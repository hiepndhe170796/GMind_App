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
    Task<TaskDto> CreateAsync(Guid userId, Guid projectId, string title, string? description, Guid? assigneeUserId, Priority priority, DateTime? deadlineAt, decimal? estimateHours, int? points, Guid? parentTaskId, CancellationToken ct = default);
    Task<List<TaskDto>> ListByProjectAsync(Guid userId, Guid projectId, CancellationToken ct = default);
    Task<TaskDto> GetAsync(Guid userId, Guid taskId, CancellationToken ct = default);
    Task<TaskDto> UpdateAsync(Guid userId, Guid taskId, string title, string? description, Priority priority, DateTime? deadlineAt, decimal? estimateHours, int? points, CancellationToken ct = default);
    Task<TaskDto> AssignAsync(Guid userId, Guid taskId, Guid? assigneeUserId, CancellationToken ct = default);
    Task<TaskDto> ChangeStatusAsync(Guid userId, Guid taskId, TaskStatus newStatus, CancellationToken ct = default);
    Task DeleteAsync(Guid userId, Guid taskId, CancellationToken ct = default);
}

public record TaskDto(Guid Id, Guid ProjectId, Guid? ParentTaskId, string Title, string? Description,
    Guid? AssigneeUserId, string? AssigneeName, string Status, string Priority,
    DateTime? DeadlineAt, decimal? EstimateHours, int? Points, int ProgressPercent,
    Guid CreatedByUserId, DateTime CreatedAt, DateTime? SubmittedAt, DateTime? CompletedAt);

public class TaskService : ITaskService
{
    private readonly IApplicationDbContext _context;

    public TaskService(IApplicationDbContext context) => _context = context;

    public async Task<TaskDto> CreateAsync(Guid userId, Guid projectId, string title, string? description, Guid? assigneeUserId, Priority priority, DateTime? deadlineAt, decimal? estimateHours, int? points, Guid? parentTaskId, CancellationToken ct = default)
    {
        var project = await _context.Projects.FirstOrDefaultAsync(p => p.Id == projectId && p.ArchivedAt == null, ct)
            ?? throw new NotFoundException("Project not found");
        var membership = await RequireMemberAsync(userId, project.GroupId, ct);

        // Members may only create tasks assigned to themselves; Leader can assign to anyone.
        var isLeader = membership.Role == Role.Leader;
        if (!isLeader && assigneeUserId != null && assigneeUserId != userId)
            throw new ForbiddenException("Only the leader can assign tasks to others");

        if (assigneeUserId != null)
            await RequireMemberAsync(assigneeUserId.Value, project.GroupId, ct);

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
        return await GetDtoAsync(task.Id, ct);
    }

    public async Task<List<TaskDto>> ListByProjectAsync(Guid userId, Guid projectId, CancellationToken ct = default)
    {
        var project = await _context.Projects.FirstOrDefaultAsync(p => p.Id == projectId && p.ArchivedAt == null, ct)
            ?? throw new NotFoundException("Project not found");
        await RequireMemberAsync(userId, project.GroupId, ct);

        return await _context.Tasks
            .Where(t => t.ProjectId == projectId)
            .OrderByDescending(t => t.CreatedAt)
            .Select(t => new TaskDto(t.Id, t.ProjectId, t.ParentTaskId, t.Title, t.Description,
                t.AssigneeUserId, t.Assignee != null ? t.Assignee.DisplayName : null,
                t.Status.ToString(), t.Priority.ToString(), t.DeadlineAt, t.EstimateHours, t.Points,
                t.ProgressPercent, t.CreatedByUserId, t.CreatedAt, t.SubmittedAt, t.CompletedAt))
            .ToListAsync(ct);
    }

    public async Task<TaskDto> GetAsync(Guid userId, Guid taskId, CancellationToken ct = default)
    {
        var task = await LoadAsync(taskId, ct);
        await RequireMemberAsync(userId, task.Project.GroupId, ct);
        return await GetDtoAsync(taskId, ct);
    }

    public async Task<TaskDto> UpdateAsync(Guid userId, Guid taskId, string title, string? description, Priority priority, DateTime? deadlineAt, decimal? estimateHours, int? points, CancellationToken ct = default)
    {
        var task = await LoadAsync(taskId, ct);
        var membership = await RequireMemberAsync(userId, task.Project.GroupId, ct);

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
        return await GetDtoAsync(taskId, ct);
    }

    public async Task<TaskDto> AssignAsync(Guid userId, Guid taskId, Guid? assigneeUserId, CancellationToken ct = default)
    {
        var task = await LoadAsync(taskId, ct);
        var membership = await RequireMemberAsync(userId, task.Project.GroupId, ct);
        if (membership.Role != Role.Leader && task.CreatedByUserId != userId)
            throw new ForbiddenException("Only the leader or task creator can assign this task");
        if (task.Status == TaskStatus.Completed)
            throw new BadRequestException("Cannot reassign a completed task");

        if (assigneeUserId != null)
            await RequireMemberAsync(assigneeUserId.Value, task.Project.GroupId, ct);

        task.AssigneeUserId = assigneeUserId;
        task.UpdatedAt = DateTime.UtcNow;
        _context.ActivityLogs.Add(Log(userId, task.Project.GroupId, task.ProjectId, "Task", task.Id, "Assign", $"Assigned task '{task.Title}' to {assigneeUserId}"));
        await _context.SaveChangesAsync(ct);
        return await GetDtoAsync(taskId, ct);
    }

    public async Task<TaskDto> ChangeStatusAsync(Guid userId, Guid taskId, TaskStatus newStatus, CancellationToken ct = default)
    {
        var task = await LoadAsync(taskId, ct);
        var membership = await RequireMemberAsync(userId, task.Project.GroupId, ct);
        var isLeader = membership.Role == Role.Leader;
        var isAssignee = task.AssigneeUserId == userId;

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

        task.Status = newStatus;
        task.UpdatedAt = DateTime.UtcNow;
        if (newStatus == TaskStatus.Submitted) task.SubmittedAt = DateTime.UtcNow;
        if (newStatus == TaskStatus.Completed) { task.CompletedAt = DateTime.UtcNow; task.ProgressPercent = 100; }

        _context.ActivityLogs.Add(Log(userId, task.Project.GroupId, task.ProjectId, "Task", task.Id, "StatusChange", $"Task '{task.Title}' -> {newStatus}"));
        await _context.SaveChangesAsync(ct);
        return await GetDtoAsync(taskId, ct);
    }

    public async Task DeleteAsync(Guid userId, Guid taskId, CancellationToken ct = default)
    {
        var task = await LoadAsync(taskId, ct);
        var membership = await RequireMemberAsync(userId, task.Project.GroupId, ct);
        if (membership.Role != Role.Leader && task.CreatedByUserId != userId)
            throw new ForbiddenException("Only the leader or task creator can delete this task");
        if (task.Status == TaskStatus.Completed)
            throw new BadRequestException("Completed tasks cannot be deleted");

        _context.ActivityLogs.Add(Log(userId, task.Project.GroupId, task.ProjectId, "Task", task.Id, "Delete", $"Deleted task '{task.Title}'"));
        _context.Tasks.Remove(task);
        await _context.SaveChangesAsync(ct);
    }

    private async Task<TaskEntity> LoadAsync(Guid taskId, CancellationToken ct)
        => await _context.Tasks.Include(t => t.Project).FirstOrDefaultAsync(t => t.Id == taskId, ct)
            ?? throw new NotFoundException("Task not found");

    private async Task<TaskDto> GetDtoAsync(Guid taskId, CancellationToken ct)
        => await _context.Tasks.Where(t => t.Id == taskId)
            .Select(t => new TaskDto(t.Id, t.ProjectId, t.ParentTaskId, t.Title, t.Description,
                t.AssigneeUserId, t.Assignee != null ? t.Assignee.DisplayName : null,
                t.Status.ToString(), t.Priority.ToString(), t.DeadlineAt, t.EstimateHours, t.Points,
                t.ProgressPercent, t.CreatedByUserId, t.CreatedAt, t.SubmittedAt, t.CompletedAt))
            .FirstAsync(ct);

    private async Task<GroupMember> RequireMemberAsync(Guid userId, Guid groupId, CancellationToken ct)
        => await _context.GroupMembers.FirstOrDefaultAsync(m => m.GroupId == groupId && m.UserId == userId && m.IsActive, ct)
            ?? throw new ForbiddenException("Not a member of this group");

    private static ActivityLog Log(Guid actor, Guid groupId, Guid projectId, string entityType, Guid? entityId, string action, string summary)
        => new() { Id = Guid.NewGuid(), ActorUserId = actor, GroupId = groupId, ProjectId = projectId, EntityType = entityType, EntityId = entityId, Action = action, Summary = summary };
}
