using GMind.Application.Common;
using GMind.Application.Common.Exceptions;
using GMind.Domain.Entities;
using GMind.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using TaskEntity = GMind.Domain.Entities.Task;
using Task = System.Threading.Tasks.Task;
using TaskStatus = GMind.Domain.Enums.TaskStatus;

namespace GMind.Application.Services.Tasks;

public interface ITaskService
{
    Task<TaskDetailDto> CreateAsync(Guid userId, Guid projectId, string title, string? description, Guid? assigneeUserId, Priority priority, DateTime? deadlineAt, decimal? estimateHours, int? points, Guid? parentTaskId, CancellationToken ct = default);
    Task<List<TaskSummaryDto>> ListByProjectAsync(Guid userId, Guid projectId, CancellationToken ct = default);
    Task<TaskSummaryDto> GetAsync(Guid userId, Guid taskId, CancellationToken ct = default);
    Task<TaskDetailDto> UpdateAsync(Guid userId, Guid taskId, string title, string? description, Priority priority, DateTime? deadlineAt, decimal? estimateHours, int? points, CancellationToken ct = default);
    Task<TaskDetailDto> AssignAsync(Guid userId, Guid taskId, Guid? assigneeUserId, CancellationToken ct = default);
    Task<TaskDetailDto> ChangeStatusAsync(Guid userId, Guid taskId, TaskStatus newStatus, string? reviewComment = null, CancellationToken ct = default);
    Task DeleteAsync(Guid userId, Guid taskId, CancellationToken ct = default);
}

public class TaskService : ITaskService
{
    private readonly IApplicationDbContext _context;
    private readonly IResourceAccess _access;
    private readonly Notifications.INotificationService _notifications;

    public TaskService(IApplicationDbContext context, IResourceAccess access, Notifications.INotificationService notifications)
    {
        _context = context;
        _access = access;
        _notifications = notifications;
    }

    public async Task<TaskDetailDto> CreateAsync(Guid userId, Guid projectId, string title, string? description, Guid? assigneeUserId, Priority priority, DateTime? deadlineAt, decimal? estimateHours, int? points, Guid? parentTaskId, CancellationToken ct = default)
    {
        var project = await _context.Projects.FirstOrDefaultAsync(p => p.Id == projectId && p.ArchivedAt == null, ct)
            ?? throw new NotFoundException("Project not found");
        var membership = await _access.RequireLeaderAsync(userId, project.GroupId, ct);
        ValidateMetadata(title, description, priority, estimateHours, points);

        // Members may only create tasks assigned to themselves; Leader can assign to anyone.
        var isLeader = membership.Role == Role.Leader;
        if (!isLeader && assigneeUserId != null && assigneeUserId != userId)
            throw new ForbiddenException("Only the leader can assign tasks to others");

        if (assigneeUserId != null)
            await _access.RequireMemberAsync(assigneeUserId.Value, project.GroupId, ct);

        if (parentTaskId != null)
        {
            var parent = await _context.Tasks.FirstOrDefaultAsync(t => t.Id == parentTaskId && t.ProjectId == projectId, ct)
                ?? throw new BadRequestException("Parent task not found in this project");
            if (parent.ParentTaskId != null)
                throw new BadRequestException("Subtasks may only be one level deep");
        }

        var task = new TaskEntity
        {
            Id = Guid.NewGuid(),
            ProjectId = projectId,
            ParentTaskId = parentTaskId,
            Title = title.Trim(),
            Description = description,
            AssigneeUserId = assigneeUserId,
            Priority = priority,
            DeadlineAt = deadlineAt,
            EstimateHours = estimateHours,
            Points = points,
            CreatedByUserId = userId
        };

        _context.Tasks.Add(task);
        _context.ActivityLogs.Add(Log(userId, project.GroupId, projectId, "Task", task.Id, "Create", $"Created task '{task.Title}'"));
        await _context.SaveChangesAsync(ct);

        if (assigneeUserId != null && assigneeUserId != userId)
            await _notifications.NotifyAsync(assigneeUserId.Value, project.GroupId, NotificationType.TaskAssigned,
                "Task mới được giao", $"Bạn được giao task '{task.Title}'", "Task", task.Id, ct);

        return await GetDetailDtoAsync(task.Id, ct);
    }

    public async Task<List<TaskSummaryDto>> ListByProjectAsync(Guid userId, Guid projectId, CancellationToken ct = default)
    {
        var project = await _context.Projects.FirstOrDefaultAsync(p => p.Id == projectId && p.ArchivedAt == null, ct)
            ?? throw new NotFoundException("Project not found");
        var membership = await _access.RequireMemberAsync(userId, project.GroupId, ct);

        return await _context.Tasks
            .Where(t => t.ProjectId == projectId)
            .OrderByDescending(t => t.CreatedAt)
            .Select(t => new TaskSummaryDto(t.Id, t.ProjectId, t.ParentTaskId, t.Title,
                t.AssigneeUserId, t.Assignee != null ? t.Assignee.DisplayName : null,
                t.Status.ToString(), t.Priority.ToString(), t.DeadlineAt,
                membership.Role == Role.Leader || t.AssigneeUserId == userId))
            .ToListAsync(ct);
    }

    public async Task<TaskSummaryDto> GetAsync(Guid userId, Guid taskId, CancellationToken ct = default)
    {
        var scope = await _context.Tasks.Where(t => t.Id == taskId && t.Project.ArchivedAt == null)
            .Select(t => new { t.Project.GroupId, t.AssigneeUserId }).FirstOrDefaultAsync(ct)
            ?? throw new NotFoundException("Task not found");
        var membership = await _access.RequireMemberAsync(userId, scope.GroupId, ct);
        if (membership.Role == Role.Leader || scope.AssigneeUserId == userId)
            return await GetDetailDtoAsync(taskId, ct);
        return await _context.Tasks.Where(t => t.Id == taskId)
            .Select(t => new TaskSummaryDto(t.Id, t.ProjectId, t.ParentTaskId, t.Title,
                t.AssigneeUserId, t.Assignee != null ? t.Assignee.DisplayName : null,
                t.Status.ToString(), t.Priority.ToString(), t.DeadlineAt, false)).FirstAsync(ct);
    }

    public async Task<TaskDetailDto> UpdateAsync(Guid userId, Guid taskId, string title, string? description, Priority priority, DateTime? deadlineAt, decimal? estimateHours, int? points, CancellationToken ct = default)
    {
        var task = await LoadAsync(taskId, ct);
        var membership = await _access.RequireLeaderAsync(userId, task.Project.GroupId, ct);
        ValidateMetadata(title, description, priority, estimateHours, points);

        // Editable by leader, creator, or assignee
        if (membership.Role != Role.Leader && task.CreatedByUserId != userId && task.AssigneeUserId != userId)
            throw new ForbiddenException("You cannot edit this task");
        if (task.Status == TaskStatus.Completed)
            throw new BadRequestException("Completed tasks cannot be edited");

        task.Title = title.Trim();
        task.Description = description;
        task.Priority = priority;
        task.DeadlineAt = deadlineAt;
        task.EstimateHours = estimateHours;
        task.Points = points;
        task.UpdatedAt = DateTime.UtcNow;

        _context.ActivityLogs.Add(Log(userId, task.Project.GroupId, task.ProjectId, "Task", task.Id, "Update", $"Updated task '{task.Title}'"));
        await _context.SaveChangesAsync(ct);
        return await GetDetailDtoAsync(taskId, ct);
    }

    public async Task<TaskDetailDto> AssignAsync(Guid userId, Guid taskId, Guid? assigneeUserId, CancellationToken ct = default)
    {
        var task = await LoadAsync(taskId, ct);
        var membership = await _access.RequireLeaderAsync(userId, task.Project.GroupId, ct);
        if (membership.Role != Role.Leader && task.CreatedByUserId != userId)
            throw new ForbiddenException("Only the leader or task creator can assign this task");
        if (task.Status == TaskStatus.Completed)
            throw new BadRequestException("Cannot reassign a completed task");

        if (assigneeUserId != null)
            await _access.RequireMemberAsync(assigneeUserId.Value, task.Project.GroupId, ct);

        task.AssigneeUserId = assigneeUserId;
        task.UpdatedAt = DateTime.UtcNow;
        _context.ActivityLogs.Add(Log(userId, task.Project.GroupId, task.ProjectId, "Task", task.Id, "Assign", $"Assigned task '{task.Title}' to {assigneeUserId}"));
        await _context.SaveChangesAsync(ct);

        if (assigneeUserId != null && assigneeUserId != userId)
            await _notifications.NotifyAsync(assigneeUserId.Value, task.Project.GroupId, NotificationType.TaskAssigned,
                "Task mới được giao", $"Bạn được giao task '{task.Title}'", "Task", task.Id, ct);

        return await GetDetailDtoAsync(taskId, ct);
    }

    public async Task<TaskDetailDto> ChangeStatusAsync(Guid userId, Guid taskId, TaskStatus newStatus, string? reviewComment = null, CancellationToken ct = default)
    {
        var task = await LoadAsync(taskId, ct);
        var membership = await _access.RequireMemberAsync(userId, task.Project.GroupId, ct);
        var isLeader = membership.Role == Role.Leader;
        var isAssignee = task.AssigneeUserId == userId;

        if (!Enum.IsDefined(newStatus)) throw new BadRequestException("Invalid task status");
        if (newStatus is TaskStatus.Completed or TaskStatus.ChangesRequested)
        {
            if (!isLeader) throw new ForbiddenException("Leader role required");
        }
        else if (!isAssignee) throw new ForbiddenException("Only the assignee can update task status");

        // Submit -> Review -> Approve -> Completed per BA workflow
        var allowed = (task.Status, newStatus, isLeader, isAssignee) switch
        {
            (TaskStatus.ToDo, TaskStatus.InProgress, _, true) => true,
            (TaskStatus.InProgress, TaskStatus.Submitted, _, true) => true,              // submit for review
            (TaskStatus.Submitted, TaskStatus.Completed, true, _) => true,               // approve
            (TaskStatus.Submitted, TaskStatus.ChangesRequested, true, _) => true,        // reject
            (TaskStatus.ChangesRequested, TaskStatus.InProgress, _, true) => true,       // rework
            (TaskStatus.InProgress, TaskStatus.ToDo, _, true) => true,                   // move back
            _ => false
        };

        if (!allowed)
            throw new BadRequestException($"Cannot transition task from {task.Status} to {newStatus} with your role");

        // Leader decisions create a review record with optional comment
        if (newStatus is TaskStatus.Completed or TaskStatus.ChangesRequested)
        {
            if (newStatus == TaskStatus.ChangesRequested && string.IsNullOrWhiteSpace(reviewComment))
                throw new BadRequestException("Review comment is required when requesting changes");

            var version = await _context.TaskReviews.CountAsync(r => r.TaskId == taskId, ct) + 1;
            _context.TaskReviews.Add(new TaskReview
            {
                Id = Guid.NewGuid(),
                TaskId = taskId,
                ReviewerUserId = userId,
                Decision = newStatus,
                Comment = reviewComment,
                SubmissionVersion = version
            });
        }

        task.Status = newStatus;
        task.UpdatedAt = DateTime.UtcNow;
        if (newStatus == TaskStatus.Submitted) task.SubmittedAt = DateTime.UtcNow;
        if (newStatus == TaskStatus.Completed) { task.CompletedAt = DateTime.UtcNow; task.ProgressPercent = 100; }

        _context.ActivityLogs.Add(Log(userId, task.Project.GroupId, task.ProjectId, "Task", task.Id, "StatusChange", $"Task '{task.Title}' -> {newStatus}"));
        await _context.SaveChangesAsync(ct);

        // Notifications per BA workflow
        if (newStatus == TaskStatus.Submitted)
        {
            var leaders = await _context.GroupMembers
                .Where(m => m.GroupId == task.Project.GroupId && m.Role == Role.Leader && m.IsActive && m.UserId != userId)
                .Select(m => m.UserId).ToListAsync(ct);
            foreach (var leaderId in leaders)
                await _notifications.NotifyAsync(leaderId, task.Project.GroupId, NotificationType.TaskSubmitted,
                    "Task chờ duyệt", $"Task '{task.Title}' đã được nộp để duyệt", "Task", task.Id, ct);
        }
        else if (newStatus == TaskStatus.Completed && task.AssigneeUserId != null)
        {
            await _notifications.NotifyAsync(task.AssigneeUserId.Value, task.Project.GroupId, NotificationType.TaskApproved,
                "Task được duyệt", $"Task '{task.Title}' đã được duyệt", "Task", task.Id, ct);
        }
        else if (newStatus == TaskStatus.ChangesRequested && task.AssigneeUserId != null)
        {
            await _notifications.NotifyAsync(task.AssigneeUserId.Value, task.Project.GroupId, NotificationType.TaskChangesRequested,
                "Task cần sửa lại", $"Task '{task.Title}' bị trả về: {reviewComment}", "Task", task.Id, ct);
        }

        return await GetDetailDtoAsync(taskId, ct);
    }

    public async Task DeleteAsync(Guid userId, Guid taskId, CancellationToken ct = default)
    {
        var task = await LoadAsync(taskId, ct);
        var membership = await _access.RequireLeaderAsync(userId, task.Project.GroupId, ct);
        if (membership.Role != Role.Leader && task.CreatedByUserId != userId)
            throw new ForbiddenException("Only the leader or task creator can delete this task");
        if (task.Status == TaskStatus.Completed)
            throw new BadRequestException("Completed tasks cannot be deleted");

        _context.ActivityLogs.Add(Log(userId, task.Project.GroupId, task.ProjectId, "Task", task.Id, "Delete", $"Deleted task '{task.Title}'"));
        _context.Tasks.Remove(task);
        await _context.SaveChangesAsync(ct);
    }

    private async Task<TaskEntity> LoadAsync(Guid taskId, CancellationToken ct)
        => await _context.Tasks.Include(t => t.Project).FirstOrDefaultAsync(t => t.Id == taskId && t.Project.ArchivedAt == null, ct)
            ?? throw new NotFoundException("Task not found");

    private async Task<TaskDetailDto> GetDetailDtoAsync(Guid taskId, CancellationToken ct)
        => await _context.Tasks.Where(t => t.Id == taskId)
            .Select(t => new TaskDetailDto(t.Id, t.ProjectId, t.ParentTaskId, t.Title,
                t.AssigneeUserId, t.Assignee != null ? t.Assignee.DisplayName : null,
                t.Status.ToString(), t.Priority.ToString(), t.DeadlineAt, t.Description, t.EstimateHours, t.Points,
                t.ProgressPercent, t.CreatedByUserId, t.CreatedAt, t.SubmittedAt, t.CompletedAt))
            .FirstAsync(ct);

    private static void ValidateMetadata(string title, string? description, Priority priority, decimal? estimateHours, int? points)
    {
        if (string.IsNullOrWhiteSpace(title) || title.Length > 200 || description?.Length > 2000)
            throw new BadRequestException("Invalid task title or description");
        if (!Enum.IsDefined(priority)) throw new BadRequestException("Invalid task priority");
        if (estimateHours is < 0 or > 999.99m) throw new BadRequestException("Estimate hours must be between 0 and 999.99");
        if (points is <= 0) throw new BadRequestException("Points must be a positive integer");
    }

    private static ActivityLog Log(Guid actor, Guid groupId, Guid projectId, string entityType, Guid? entityId, string action, string summary)
        => new() { Id = Guid.NewGuid(), ActorUserId = actor, GroupId = groupId, ProjectId = projectId, EntityType = entityType, EntityId = entityId, Action = action, Summary = summary };
}
