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
            ?? throw new NotFoundException("Không tìm thấy dự án này.");
        var membership = await _access.RequireLeaderAsync(userId, project.GroupId, ct);
        ValidateMetadata(title, description, priority, estimateHours, points);

        // Members may only create tasks assigned to themselves; Leader can assign to anyone.
        var isLeader = membership.Role == Role.Leader;
        if (!isLeader && assigneeUserId != null && assigneeUserId != userId)
            throw new ForbiddenException("Chỉ Trưởng nhóm mới có thể giao việc cho người khác.");

        if (assigneeUserId != null)
            await _access.RequireMemberAsync(assigneeUserId.Value, project.GroupId, ct);

        if (parentTaskId != null)
        {
            var parent = await _context.Tasks.FirstOrDefaultAsync(t => t.Id == parentTaskId && t.ProjectId == projectId, ct)
                ?? throw new BadRequestException("Không tìm thấy công việc cha trong dự án này.");
            if (parent.ParentTaskId != null)
                throw new BadRequestException("Công việc con chỉ được tối đa một cấp.");
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
        _context.ActivityLogs.Add(Log(userId, project.GroupId, projectId, "Task", task.Id, "Create", $"Tạo công việc '{task.Title}'"));
        await _context.SaveChangesAsync(ct);

        if (assigneeUserId != null && assigneeUserId != userId)
            await _notifications.NotifyAsync(assigneeUserId.Value, project.GroupId, NotificationType.TaskAssigned,
                "Task mới được giao", $"Bạn được giao công việc '{task.Title}'", "Task", task.Id, ct);

        return await GetDetailDtoAsync(task.Id, ct);
    }

    public async Task<List<TaskSummaryDto>> ListByProjectAsync(Guid userId, Guid projectId, CancellationToken ct = default)
    {
        var project = await _context.Projects.FirstOrDefaultAsync(p => p.Id == projectId && p.ArchivedAt == null, ct)
            ?? throw new NotFoundException("Không tìm thấy dự án này.");
        var membership = await _access.RequireMemberAsync(userId, project.GroupId, ct);
        var anotherLeader = membership.Role == Role.Leader
            && await _context.GroupMembers.AnyAsync(m => m.GroupId == project.GroupId
                && m.Role == Role.Leader && m.IsActive && m.UserId != userId, ct);

        return await _context.Tasks
            .Where(t => t.ProjectId == projectId)
            .OrderByDescending(t => t.CreatedAt)
            .Select(t => new TaskSummaryDto(t.Id, t.ProjectId, t.ParentTaskId, t.Title,
                t.AssigneeUserId, t.Assignee != null ? t.Assignee.DisplayName : null,
                t.Status.ToString(), t.Priority.ToString(), t.DeadlineAt,
                membership.Role == Role.Leader || t.AssigneeUserId == userId,
                membership.Role == Role.Leader && t.Status == TaskStatus.Submitted
                    && !(t.AssigneeUserId == userId && anotherLeader)))
            .ToListAsync(ct);
    }

    public async Task<TaskSummaryDto> GetAsync(Guid userId, Guid taskId, CancellationToken ct = default)
    {
        var scope = await _context.Tasks.Where(t => t.Id == taskId && t.Project.ArchivedAt == null)
            .Select(t => new { t.Project.GroupId, t.AssigneeUserId }).FirstOrDefaultAsync(ct)
            ?? throw new NotFoundException("Không tìm thấy công việc này.");
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
            throw new ForbiddenException("Bạn không có quyền sửa công việc này.");
        if (task.Status == TaskStatus.Completed)
            throw new BadRequestException("Không thể sửa công việc đã hoàn thành.");

        var oldDeadline = task.DeadlineAt;
        task.Title = title.Trim();
        task.Description = description;
        task.Priority = priority;
        task.DeadlineAt = deadlineAt;
        task.EstimateHours = estimateHours;
        task.Points = points;
        task.UpdatedAt = DateTime.UtcNow;

        _context.ActivityLogs.Add(Log(userId, task.Project.GroupId, task.ProjectId, "Task", task.Id, "Update",
            $"Cập nhật công việc '{task.Title}'{(oldDeadline != deadlineAt ? $" — hạn {(oldDeadline != null ? VnTime.FormatDate(oldDeadline.Value) : "—")} → {(deadlineAt != null ? VnTime.FormatDate(deadlineAt.Value) : "—")}" : "")}"));
        await _context.SaveChangesAsync(ct);
        if (oldDeadline != deadlineAt && task.AssigneeUserId != null && task.AssigneeUserId != userId)
        {
            var vn = deadlineAt != null ? VnTime.Format(deadlineAt.Value) : null;
            await _notifications.NotifyAsync(task.AssigneeUserId.Value, task.Project.GroupId, NotificationType.TaskUpdated,
                "Hạn công việc đã thay đổi",
                deadlineAt == null ? $"Hạn công việc '{task.Title}' đã bỏ" : $"Hạn công việc '{task.Title}': {vn}",
                "Task", task.Id, ct);
        }
        return await GetDetailDtoAsync(taskId, ct);
    }

    public async Task<TaskDetailDto> AssignAsync(Guid userId, Guid taskId, Guid? assigneeUserId, CancellationToken ct = default)
    {
        var task = await LoadAsync(taskId, ct);
        var membership = await _access.RequireLeaderAsync(userId, task.Project.GroupId, ct);
        if (membership.Role != Role.Leader && task.CreatedByUserId != userId)
            throw new ForbiddenException("Chỉ Trưởng nhóm hoặc người tạo mới có thể giao công việc này.");
        if (task.Status == TaskStatus.Completed)
            throw new BadRequestException("Không thể giao lại công việc đã hoàn thành.");

        if (assigneeUserId != null)
            await _access.RequireMemberAsync(assigneeUserId.Value, task.Project.GroupId, ct);

        task.AssigneeUserId = assigneeUserId;
        task.UpdatedAt = DateTime.UtcNow;
        var assigneeName = assigneeUserId == null ? "bỏ giao" : await _context.Users.Where(u => u.Id == assigneeUserId).Select(u => u.DisplayName).FirstAsync(ct);
        _context.ActivityLogs.Add(Log(userId, task.Project.GroupId, task.ProjectId, "Task", task.Id, "Assign", $"Giao công việc '{task.Title}' cho {assigneeName}"));
        await _context.SaveChangesAsync(ct);

        if (assigneeUserId != null && assigneeUserId != userId)
            await _notifications.NotifyAsync(assigneeUserId.Value, task.Project.GroupId, NotificationType.TaskAssigned,
                "Task mới được giao", $"Bạn được giao công việc '{task.Title}'", "Task", task.Id, ct);

        return await GetDetailDtoAsync(taskId, ct);
    }

    public async Task<TaskDetailDto> ChangeStatusAsync(Guid userId, Guid taskId, TaskStatus newStatus, string? reviewComment = null, CancellationToken ct = default)
    {
        var task = await LoadAsync(taskId, ct);
        var membership = await _access.RequireMemberAsync(userId, task.Project.GroupId, ct);
        var isLeader = membership.Role == Role.Leader;
        var isAssignee = task.AssigneeUserId == userId;

        if (!Enum.IsDefined(newStatus)) throw new BadRequestException("Trạng thái công việc không hợp lệ.");
        if (newStatus is TaskStatus.Completed or TaskStatus.ChangesRequested)
        {
            if (!isLeader) throw new ForbiddenException("Bạn cần quyền Trưởng nhóm để thực hiện thao tác này.");
        }
        else if (!isAssignee) throw new ForbiddenException("Chỉ người phụ trách mới có thể cập nhật trạng thái công việc này.");

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
            throw new BadRequestException($"Không thể chuyển công việc từ {Labels.TaskStatus(task.Status)} sang {Labels.TaskStatus(newStatus)} với vai trò của bạn.");

        // Leader decisions create a review record with optional comment
        if (newStatus is TaskStatus.Completed or TaskStatus.ChangesRequested)
        {
            if (isAssignee && !await _access.CanReviewOwnAsync(task.Project.GroupId, userId, task.AssigneeUserId ?? userId, ct))
                throw new ForbiddenException("Cần một Trưởng nhóm khác duyệt công việc của bạn");
            if (newStatus == TaskStatus.ChangesRequested && string.IsNullOrWhiteSpace(reviewComment))
                throw new BadRequestException("Vui lòng nhập nhận xét khi yêu cầu chỉnh sửa.");

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

        var selfNote = isAssignee && isLeader && (newStatus is TaskStatus.Completed or TaskStatus.ChangesRequested)
            ? " (tự duyệt)" : "";
        _context.ActivityLogs.Add(Log(userId, task.Project.GroupId, task.ProjectId, "Task", task.Id, "StatusChange",
            $"Công việc '{task.Title}' chuyển sang {GMind.Application.Common.Labels.TaskStatus(newStatus)}{selfNote}"));
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
            throw new ForbiddenException("Chỉ Trưởng nhóm hoặc người tạo mới có thể xóa công việc này.");
        if (task.Status == TaskStatus.Completed)
            throw new BadRequestException("Không thể xóa công việc đã hoàn thành.");

        _context.ActivityLogs.Add(Log(userId, task.Project.GroupId, task.ProjectId, "Task", task.Id, "Delete", $"Xóa công việc '{task.Title}'"));
        _context.Tasks.Remove(task);
        await _context.SaveChangesAsync(ct);
    }

    private async Task<TaskEntity> LoadAsync(Guid taskId, CancellationToken ct)
        => await _context.Tasks.Include(t => t.Project).FirstOrDefaultAsync(t => t.Id == taskId && t.Project.ArchivedAt == null, ct)
            ?? throw new NotFoundException("Không tìm thấy công việc này.");

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
            throw new BadRequestException("Tiêu đề hoặc mô tả công việc không hợp lệ.");
        if (!Enum.IsDefined(priority)) throw new BadRequestException("Mức độ ưu tiên không hợp lệ.");
        if (estimateHours is < 0 or > 999.99m) throw new BadRequestException("Thời lượng ước tính phải từ 0 đến 999.99 giờ.");
        if (points is <= 0) throw new BadRequestException("Điểm phải là số nguyên dương.");
    }

    private static ActivityLog Log(Guid actor, Guid groupId, Guid projectId, string entityType, Guid? entityId, string action, string summary)
        => new() { Id = Guid.NewGuid(), ActorUserId = actor, GroupId = groupId, ProjectId = projectId, EntityType = entityType, EntityId = entityId, Action = action, Summary = summary };
}
