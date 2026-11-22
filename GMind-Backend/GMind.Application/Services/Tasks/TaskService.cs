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
    Task<List<TaskSummaryDto>> ListSubtasksAsync(Guid userId, Guid taskId, CancellationToken ct = default);
    Task<TaskDetailDto> UpdateAsync(Guid userId, Guid taskId, string title, string? description, Priority priority, DateTime? deadlineAt, decimal? estimateHours, int? points, CancellationToken ct = default);
    Task<TaskDetailDto> AssignAsync(Guid userId, Guid taskId, Guid? assigneeUserId, CancellationToken ct = default);
    Task<TaskDetailDto> ChangeStatusAsync(Guid userId, Guid taskId, TaskStatus newStatus, string? reviewComment = null, CancellationToken ct = default);
    Task<TaskDetailDto> UpdateProgressAsync(Guid userId, Guid taskId, int progressPercent, CancellationToken ct = default);
    Task DeleteAsync(Guid userId, Guid taskId, CancellationToken ct = default);
    Task RemindAsync(Guid userId, Guid taskId, CancellationToken ct = default);
    Task<List<TaskHelperDto>> ListHelpersAsync(Guid userId, Guid taskId, CancellationToken ct = default);
    Task EndHelperAsync(Guid userId, Guid taskId, Guid helperRowId, CancellationToken ct = default);

}

public record TaskHelperDto(Guid Id, Guid UserId, string DisplayName, string? AvatarUrl, string Scope,
    DateTime CreatedAt, DateTime? EndedAt, Guid? MarketplaceRequestId, bool CanEnd);

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
        var membership = await _access.RequireMemberAsync(userId, project.GroupId, ct);
        var isLeader = membership.Role == Role.Leader;

        if (parentTaskId == null && !isLeader)
            throw new ForbiddenException("Bạn cần quyền Trưởng nhóm để thực hiện thao tác này.");

        TaskEntity? parent = null;
        if (parentTaskId != null)
        {
            parent = await _context.Tasks.FirstOrDefaultAsync(t => t.Id == parentTaskId && t.ProjectId == projectId, ct)
                ?? throw new BadRequestException("Không tìm thấy công việc cha trong dự án này.");
            if (parent.ParentTaskId != null)
                throw new BadRequestException("Công việc con chỉ được tối đa một cấp.");
            if (parent.Status is TaskStatus.Submitted or TaskStatus.Completed)
                throw new BadRequestException("Không thể thêm công việc con vào công việc đang chờ duyệt hoặc đã hoàn thành.");
            if (!isLeader && parent.AssigneeUserId != userId)
                throw new ForbiddenException("Chỉ Trưởng nhóm hoặc người phụ trách công việc chính mới thêm được công việc con.");
            if (points != null)
                throw new BadRequestException("Công việc con không có điểm.");
        }

        ValidateMetadata(title, description, priority, estimateHours, points);

        // Members may only create tasks assigned to themselves; Leader can assign to anyone.
        if (!isLeader && assigneeUserId != null && assigneeUserId != userId)
            throw new ForbiddenException("Chỉ Trưởng nhóm mới có thể giao việc cho người khác.");

        if (assigneeUserId != null)
            await _access.RequireMemberAsync(assigneeUserId.Value, project.GroupId, ct);

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
            Points = parentTaskId == null ? points : null,
            CreatedByUserId = userId
        };

        _context.Tasks.Add(task);
        _context.ActivityLogs.Add(Log(userId, project.GroupId, projectId, "Task", task.Id, "Create",
            parentTaskId == null ? $"Tạo công việc '{task.Title}'" : $"Tạo công việc con '{task.Title}' trong '{parent!.Title}'"));
        await _context.SaveChangesAsync(ct);

        if (assigneeUserId != null && assigneeUserId != userId)
            await _notifications.NotifyAsync(assigneeUserId.Value, project.GroupId, NotificationType.TaskAssigned,
                "Công việc mới được giao", $"Bạn được giao công việc '{task.Title}'", "Task", task.Id, ct);

        return await GetDetailDtoAsync(userId, task.Id, ct);
    }

    private record TaskRow(Guid Id, Guid ProjectId, Guid? ParentTaskId, string Title,
        Guid? AssigneeUserId, string? AssigneeName, TaskStatus Status, Priority Priority,
        DateTime? DeadlineAt, Guid CreatedByUserId, int ProgressPercent, int? Points, DateTime UpdatedAt,
        string? ParentTitle, Guid? ParentAssigneeId, TaskStatus? ParentStatus,
        int SubtaskCount, int SubtasksCompleted, int OpenSubtaskCount);

    private static IQueryable<TaskRow> RowQuery(IQueryable<TaskEntity> q) => q.Select(t => new TaskRow(
        t.Id, t.ProjectId, t.ParentTaskId, t.Title,
        t.AssigneeUserId, t.Assignee != null ? t.Assignee.DisplayName : null,
        t.Status, t.Priority, t.DeadlineAt, t.CreatedByUserId,
        t.ProgressPercent, t.Points, t.UpdatedAt,
        t.ParentTask != null ? t.ParentTask.Title : null,
        t.ParentTask != null ? t.ParentTask.AssigneeUserId : null,
        t.ParentTask != null ? (TaskStatus?)t.ParentTask.Status : null,
        t.Subtasks.Count,
        t.Subtasks.Count(s => s.Status == TaskStatus.Completed),
        t.Subtasks.Count(s => s.Status != TaskStatus.Completed)));

    private TaskRuleContext Ctx(GroupMember membership, Guid userId, TaskRow r, bool anotherLeader, bool isHelper = false)
        => new(membership.Role, userId, r.AssigneeUserId, r.CreatedByUserId, r.ParentTaskId,
            r.ParentAssigneeId, r.Status, r.ParentStatus, r.SubtaskCount, r.OpenSubtaskCount, anotherLeader, isHelper);

    private async Task<bool> AnotherLeaderAsync(GroupMember membership, Guid userId, Guid groupId, CancellationToken ct)
        => membership.Role == Role.Leader && await _context.GroupMembers.AnyAsync(m =>
            m.GroupId == groupId && m.Role == Role.Leader && m.IsActive && m.UserId != userId, ct);

    private TaskSummaryDto SummaryOf(TaskRow r, Guid userId, Role role, bool anotherLeader,
        bool isHelper = false, bool remindedRecently = false)
    {
        var ctx = new TaskRuleContext(role, userId, r.AssigneeUserId, r.CreatedByUserId, r.ParentTaskId,
            r.ParentAssigneeId, r.Status, r.ParentStatus, r.SubtaskCount, r.OpenSubtaskCount, anotherLeader, isHelper);
        var canView = TaskRules.CanViewDetails(ctx);
        var perms = TaskRules.Permissions(ctx, remindedRecently);
        var canReview = perms.AllowedTransitions.Contains(nameof(TaskStatus.Completed));
        return new TaskSummaryDto(r.Id, r.ProjectId, r.ParentTaskId, r.Title,
            r.AssigneeUserId, r.AssigneeName, r.Status.ToString(), r.Priority.ToString(), r.DeadlineAt,
            canView, canReview, r.ParentTitle, r.SubtaskCount, r.SubtasksCompleted,
            canView && r.ParentTaskId == null ? r.ProgressPercent : null, r.UpdatedAt,
            canView ? r.Points : null, perms);
    }

    public async Task<List<TaskSummaryDto>> ListByProjectAsync(Guid userId, Guid projectId, CancellationToken ct = default)
    {
        var project = await _context.Projects.FirstOrDefaultAsync(p => p.Id == projectId && p.ArchivedAt == null, ct)
            ?? throw new NotFoundException("Không tìm thấy dự án này.");
        var membership = await _access.RequireMemberAsync(userId, project.GroupId, ct);
        var anotherLeader = await AnotherLeaderAsync(membership, userId, project.GroupId, ct);

        var rows = await RowQuery(_context.Tasks.Where(t => t.ProjectId == projectId)
            .OrderByDescending(t => t.UpdatedAt)).ToListAsync(ct);
        var helperIds = await HelperTaskIdsAsync(userId, rows.Select(r => r.Id), ct);
        var remindedIds = await RemindedTaskIdsAsync(membership.Role == Role.Leader, rows.Select(r => r.Id), ct);
        return rows.Select(r => SummaryOf(r, userId, membership.Role, anotherLeader,
            helperIds.Contains(r.Id), remindedIds.Contains(r.Id))).ToList();
    }

    public async Task<TaskSummaryDto> GetAsync(Guid userId, Guid taskId, CancellationToken ct = default)
    {
        var row = await RowQuery(_context.Tasks.Where(t => t.Id == taskId && t.Project.ArchivedAt == null))
            .FirstOrDefaultAsync(ct)
            ?? throw new NotFoundException("Không tìm thấy công việc này.");
        var groupId = await _context.Projects.Where(p => p.Id == row.ProjectId).Select(p => p.GroupId).FirstAsync(ct);
        var membership = await _access.RequireMemberAsync(userId, groupId, ct);
        var anotherLeader = await AnotherLeaderAsync(membership, userId, groupId, ct);
        var isHelper = await _context.TaskHelpers.AnyAsync(h => h.TaskId == taskId && h.HelperUserId == userId && h.EndedAt == null, ct);
        var ctx = Ctx(membership, userId, row, anotherLeader, isHelper);
        if (!TaskRules.CanViewDetails(ctx))
            return new TaskSummaryDto(row.Id, row.ProjectId, row.ParentTaskId, row.Title,
                row.AssigneeUserId, row.AssigneeName, row.Status.ToString(), row.Priority.ToString(),
                row.DeadlineAt, false, false, row.ParentTitle, row.SubtaskCount, row.SubtasksCompleted,
                null, row.UpdatedAt, null, TaskPermissionsDto.None);
        return await GetDetailDtoAsync(userId, taskId, ct);
    }

    public async Task<List<TaskSummaryDto>> ListSubtasksAsync(Guid userId, Guid taskId, CancellationToken ct = default)
    {
        var task = await _access.RequireTaskDetailsAsync(userId, taskId, ct);
        var membership = await _access.RequireMemberAsync(userId, task.Project.GroupId, ct);
        var anotherLeader = await AnotherLeaderAsync(membership, userId, task.Project.GroupId, ct);
        var rows = await RowQuery(_context.Tasks.Where(t => t.ParentTaskId == taskId)
            .OrderBy(t => t.UpdatedAt)).ToListAsync(ct);
        return rows.Select(r => SummaryOf(r, userId, membership.Role, anotherLeader)).ToList();
    }

    public async Task<TaskDetailDto> UpdateAsync(Guid userId, Guid taskId, string title, string? description, Priority priority, DateTime? deadlineAt, decimal? estimateHours, int? points, CancellationToken ct = default)
    {
        var task = await LoadAsync(taskId, ct);
        var membership = await _access.RequireMemberAsync(userId, task.Project.GroupId, ct);

        if (task.Status == TaskStatus.Completed)
            throw new BadRequestException("Không thể sửa công việc đã hoàn thành.");
        var ctx = await BuildCtxAsync(userId, membership, task, ct);
        if (!TaskRules.CanEdit(ctx))
            throw new ForbiddenException("Bạn không có quyền sửa công việc này.");
        if (task.ParentTaskId != null && points != null)
            throw new BadRequestException("Công việc con không có điểm.");
        if (membership.Role != Role.Leader && points != task.Points)
            throw new ForbiddenException("Chỉ Trưởng nhóm mới đặt điểm cho công việc.");
        ValidateMetadata(title, description, priority, estimateHours, points);

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
        return await GetDetailDtoAsync(userId, taskId, ct);
    }

    public async Task<TaskDetailDto> AssignAsync(Guid userId, Guid taskId, Guid? assigneeUserId, CancellationToken ct = default)
    {
        var task = await LoadAsync(taskId, ct);
        var membership = await _access.RequireMemberAsync(userId, task.Project.GroupId, ct);
        if (task.Status == TaskStatus.Completed)
            throw new BadRequestException("Không thể giao lại công việc đã hoàn thành.");
        var ctx = await BuildCtxAsync(userId, membership, task, ct);
        if (!TaskRules.CanAssign(ctx))
            throw new ForbiddenException("Chỉ Trưởng nhóm mới có thể giao công việc này.");

        if (assigneeUserId != null)
            await _access.RequireMemberAsync(assigneeUserId.Value, task.Project.GroupId, ct);

        if (task.AssigneeUserId != assigneeUserId)
            await Services.Marketplace.MarketplaceCleanup.CancelActiveAsync(_context, [task.Id], null,
                "Tự động hủy vì công việc đã được giao lại.", ct);

        task.AssigneeUserId = assigneeUserId;
        task.UpdatedAt = DateTime.UtcNow;
        var assigneeName = assigneeUserId == null ? "bỏ giao" : await _context.Users.Where(u => u.Id == assigneeUserId).Select(u => u.DisplayName).FirstAsync(ct);
        _context.ActivityLogs.Add(Log(userId, task.Project.GroupId, task.ProjectId, "Task", task.Id, "Assign", $"Giao công việc '{task.Title}' cho {assigneeName}"));
        await _context.SaveChangesAsync(ct);

        if (assigneeUserId != null && assigneeUserId != userId)
            await _notifications.NotifyAsync(assigneeUserId.Value, task.Project.GroupId, NotificationType.TaskAssigned,
                "Công việc mới được giao", $"Bạn được giao công việc '{task.Title}'", "Task", task.Id, ct);

        return await GetDetailDtoAsync(userId, taskId, ct);
    }

    public async Task<TaskDetailDto> ChangeStatusAsync(Guid userId, Guid taskId, TaskStatus newStatus, string? reviewComment = null, CancellationToken ct = default)
    {
        var task = await LoadAsync(taskId, ct);
        var membership = await _access.RequireMemberAsync(userId, task.Project.GroupId, ct);
        var isLeader = membership.Role == Role.Leader;
        var isAssignee = task.AssigneeUserId == userId;
        var isSubtask = task.ParentTaskId != null;

        if (!Enum.IsDefined(newStatus)) throw new BadRequestException("Trạng thái công việc không hợp lệ.");
        var ctx = await BuildCtxAsync(userId, membership, task, ct);

        // Subtasks never go through review
        if (isSubtask && newStatus is TaskStatus.Submitted or TaskStatus.ChangesRequested)
            throw new BadRequestException("Công việc con không cần duyệt; hãy đánh dấu Hoàn thành.");
        // M0 self-review guard keeps its specific message
        if (!isSubtask && newStatus is TaskStatus.Completed or TaskStatus.ChangesRequested
            && isLeader && isAssignee && ctx.AnotherLeader)
            throw new ForbiddenException("Cần một Trưởng nhóm khác duyệt công việc của bạn.");

        var allowed = TaskRules.AllowedTransitions(ctx).Contains(newStatus);
        if (!allowed)
        {
            if (!isSubtask && newStatus is TaskStatus.Completed or TaskStatus.ChangesRequested && !isLeader)
                throw new ForbiddenException("Bạn cần quyền Trưởng nhóm để thực hiện thao tác này.");
            var actorEligible = isSubtask
                ? (isAssignee || ctx.ParentAssigneeId == userId || isLeader)
                : (newStatus is TaskStatus.Completed or TaskStatus.ChangesRequested ? isLeader : isAssignee);
            if (!actorEligible)
                throw new ForbiddenException("Chỉ người phụ trách mới có thể cập nhật trạng thái công việc này.");
            // Actor is eligible — the transition itself is blocked
            if (!isSubtask && task.Status == TaskStatus.InProgress && newStatus == TaskStatus.Submitted && ctx.OpenSubtaskCount > 0)
                throw new BadRequestException("Hoàn thành tất cả công việc con trước khi nộp.");
            throw new BadRequestException($"Không thể chuyển công việc từ {Labels.TaskStatus(task.Status)} sang {Labels.TaskStatus(newStatus)} với vai trò của bạn.");
        }

        // Leader decisions create a review record linked to the submission version
        if (!isSubtask && newStatus is TaskStatus.Completed or TaskStatus.ChangesRequested)
        {
            if (newStatus == TaskStatus.ChangesRequested && string.IsNullOrWhiteSpace(reviewComment))
                throw new BadRequestException("Vui lòng nhập nhận xét khi yêu cầu chỉnh sửa.");

            var version = await _context.TaskSubmissions
                .Where(s => s.TaskId == taskId)
                .Select(s => (int?)s.Version).MaxAsync(ct)
                ?? await _context.TaskReviews.CountAsync(r => r.TaskId == taskId, ct) + 1;
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

        // Submission note is stored per version
        if (!isSubtask && newStatus == TaskStatus.Submitted)
        {
            var note = string.IsNullOrWhiteSpace(reviewComment) ? null : reviewComment.Trim();
            var version = await _context.TaskSubmissions
                .Where(s => s.TaskId == taskId)
                .Select(s => (int?)s.Version).MaxAsync(ct) ?? 0;
            _context.TaskSubmissions.Add(new TaskSubmission
            {
                Id = Guid.NewGuid(), TaskId = taskId, SubmittedByUserId = userId,
                Note = note, Version = version + 1
            });
        }

        task.Status = newStatus;
        task.UpdatedAt = DateTime.UtcNow;
        if (newStatus == TaskStatus.Submitted) task.SubmittedAt = DateTime.UtcNow;
        if (newStatus == TaskStatus.Completed) { task.CompletedAt = DateTime.UtcNow; task.ProgressPercent = 100; }

        if (newStatus == TaskStatus.Completed)
            await Services.Marketplace.MarketplaceCleanup.CancelActiveAsync(_context, [task.Id], null,
                "Tự động hủy vì công việc đã hoàn thành.", ct);

        // Contribution: credit the assignee's points once, at approval time — reassignment later never revokes it.
        if (newStatus == TaskStatus.Completed && !isSubtask && task.AssigneeUserId != null && task.Points != null
            && !await _context.ContributionCredits.AnyAsync(c => c.TaskId == task.Id, ct))
        {
            _context.ContributionCredits.Add(new ContributionCredit
            {
                Id = Guid.NewGuid(), TaskId = task.Id, ProjectId = task.ProjectId,
                GroupId = task.Project.GroupId, UserId = task.AssigneeUserId.Value,
                Points = task.Points.Value, CreditedAt = task.CompletedAt!.Value
            });
        }
        if (isSubtask && newStatus == TaskStatus.InProgress && ctx.Status == TaskStatus.Completed)
        { task.CompletedAt = null; task.ProgressPercent = 0; }

        var selfNote = isAssignee && isLeader && !isSubtask && newStatus is TaskStatus.Completed or TaskStatus.ChangesRequested
            ? " (tự duyệt)" : "";
        _context.ActivityLogs.Add(Log(userId, task.Project.GroupId, task.ProjectId, "Task", task.Id, "StatusChange",
            $"Công việc '{task.Title}' chuyển sang {Labels.TaskStatus(newStatus)}{selfNote}"));
        await _context.SaveChangesAsync(ct);

        // Notifications per BA workflow
        if (!isSubtask && newStatus == TaskStatus.Submitted)
        {
            var note = string.IsNullOrWhiteSpace(reviewComment) ? null : reviewComment.Trim();
            var excerpt = note != null && note.Length > 120 ? note[..120] + "…" : note;
            var leaders = await _context.GroupMembers
                .Where(m => m.GroupId == task.Project.GroupId && m.Role == Role.Leader && m.IsActive && m.UserId != userId)
                .Select(m => m.UserId).ToListAsync(ct);
            foreach (var leaderId in leaders)
                await _notifications.NotifyAsync(leaderId, task.Project.GroupId, NotificationType.TaskSubmitted,
                    "Công việc chờ duyệt", $"Công việc '{task.Title}' đã được nộp để duyệt{(excerpt != null ? $": {excerpt}" : "")}", "Task", task.Id, ct);
        }
        else if (newStatus == TaskStatus.Completed && task.AssigneeUserId != null)
        {
            await _notifications.NotifyAsync(task.AssigneeUserId.Value, task.Project.GroupId, NotificationType.TaskApproved,
                "Công việc được duyệt", $"Công việc '{task.Title}' đã được duyệt", "Task", task.Id, ct);
        }
        else if (!isSubtask && newStatus == TaskStatus.ChangesRequested && task.AssigneeUserId != null)
        {
            await _notifications.NotifyAsync(task.AssigneeUserId.Value, task.Project.GroupId, NotificationType.TaskChangesRequested,
                "Công việc cần sửa lại", $"Công việc '{task.Title}' bị trả về: {reviewComment}", "Task", task.Id, ct);
        }

        return await GetDetailDtoAsync(userId, taskId, ct);
    }

    public async Task<TaskDetailDto> UpdateProgressAsync(Guid userId, Guid taskId, int progressPercent, CancellationToken ct = default)
    {
        var task = await LoadAsync(taskId, ct);
        var membership = await _access.RequireMemberAsync(userId, task.Project.GroupId, ct);
        if (task.ParentTaskId != null)
            throw new BadRequestException("Công việc con không dùng phần trăm tiến độ.");
        if (progressPercent is < 0 or > 100)
            throw new BadRequestException("Tiến độ phải từ 0 đến 100.");
        var ctx = await BuildCtxAsync(userId, membership, task, ct);
        if (!TaskRules.CanUpdateProgress(ctx))
            throw new ForbiddenException("Chỉ người phụ trách mới cập nhật được tiến độ khi công việc đang làm.");

        var old = task.ProgressPercent;
        task.ProgressPercent = progressPercent;
        task.UpdatedAt = DateTime.UtcNow;
        if (old != progressPercent)
            _context.ActivityLogs.Add(Log(userId, task.Project.GroupId, task.ProjectId, "Task", task.Id, "Progress",
                $"Cập nhật tiến độ '{task.Title}': {old}% → {progressPercent}%"));
        await _context.SaveChangesAsync(ct);
        return await GetDetailDtoAsync(userId, taskId, ct);
    }

    public async Task DeleteAsync(Guid userId, Guid taskId, CancellationToken ct = default)
    {
        var task = await LoadAsync(taskId, ct);
        var membership = await _access.RequireMemberAsync(userId, task.Project.GroupId, ct);
        if (task.Status == TaskStatus.Completed)
            throw new BadRequestException("Không thể xóa công việc đã hoàn thành.");
        var ctx = await BuildCtxAsync(userId, membership, task, ct);
        var eligible = ctx.Role == Role.Leader
            || (ctx.ParentId != null && ctx.CreatedById == userId && ctx.ParentAssigneeId == userId);
        if (!eligible)
            throw new ForbiddenException("Bạn không có quyền xóa công việc này.");
        if (await _context.MarketplaceRequests.AnyAsync(r => r.TaskId == taskId || r.RelatedTaskId == taskId, ct))
            throw new ConflictException("Công việc đã có yêu cầu Marketplace nên không thể xóa để giữ lịch sử.");
        if (await _context.Tasks.AnyAsync(t => t.ParentTaskId == taskId, ct))
            throw new ConflictException("Hãy xóa các công việc con trước.");

        var links = await _context.TaskLinks.Where(l => l.TaskId == taskId).ToListAsync(ct);
        _context.TaskLinks.RemoveRange(links);
        _context.ActivityLogs.Add(Log(userId, task.Project.GroupId, task.ProjectId, "Task", task.Id, "Delete", $"Xóa công việc '{task.Title}'"));
        _context.Tasks.Remove(task);
        await _context.SaveChangesAsync(ct);
    }

    /// <summary>PROG-04: Leader nudges the assignee — at most once per task per hour.</summary>
    public async System.Threading.Tasks.Task RemindAsync(Guid userId, Guid taskId, CancellationToken ct = default)
    {
        var task = await LoadAsync(taskId, ct);
        var membership = await _access.RequireMemberAsync(userId, task.Project.GroupId, ct);
        if (membership.Role != Role.Leader)
            throw new ForbiddenException("Bạn cần quyền Trưởng nhóm để thực hiện thao tác này.");
        if (task.AssigneeUserId == userId)
            throw new BadRequestException("Bạn không thể tự nhắc chính mình.");
        if (task.AssigneeUserId == null || task.Status == TaskStatus.Completed)
            throw new BadRequestException("Chỉ nhắc được công việc chưa hoàn thành có người phụ trách.");

        var now = DateTime.UtcNow;
        var key = $"nudge:{taskId}:{now:yyyyMMddHH}";
        if (await _context.ReminderDeliveries.AnyAsync(r => r.DeduplicationKey == key, ct))
            throw new ConflictException("Bạn vừa nhắc công việc này. Hãy thử lại sau ít phút.");

        var leaderName = await _context.Users.Where(u => u.Id == userId).Select(u => u.DisplayName).FirstAsync(ct);
        var deadline = task.DeadlineAt != null ? $" (hạn {VnTime.Format(task.DeadlineAt.Value)})" : "";
        await _notifications.NotifyAsync(task.AssigneeUserId.Value, task.Project.GroupId,
            NotificationType.LeaderReminder, "Trưởng nhóm nhắc việc",
            $"{leaderName} nhắc bạn về công việc '{task.Title}'{deadline}.", "Task", task.Id, ct);

        var assigneeName = await _context.Users.Where(u => u.Id == task.AssigneeUserId.Value).Select(u => u.DisplayName).FirstAsync(ct);
        _context.ActivityLogs.Add(Log(userId, task.Project.GroupId, task.ProjectId, "Task", task.Id, "Remind",
            $"Nhắc {assigneeName} về công việc '{task.Title}'"));
        _context.ReminderDeliveries.Add(new ReminderDelivery
        {
            Id = Guid.NewGuid(), TaskId = taskId, RecipientUserId = task.AssigneeUserId.Value,
            ReminderType = ReminderType.LeaderNudge, ScheduledFor = now, SentAt = now,
            DeduplicationKey = key, Status = "Sent"
        });
        await _context.SaveChangesAsync(ct);
    }

    public async Task<List<TaskHelperDto>> ListHelpersAsync(Guid userId, Guid taskId, CancellationToken ct = default)
    {
        var task = await _access.RequireTaskDetailsAsync(userId, taskId, ct);
        var membership = await _access.RequireMemberAsync(userId, task.Project.GroupId, ct);
        var canEnd = membership.Role == Role.Leader || task.AssigneeUserId == userId;
        var rows = await _context.TaskHelpers
            .Where(h => h.TaskId == taskId)
            .OrderByDescending(h => h.CreatedAt)
            .Select(h => new { h.Id, h.HelperUserId, h.Helper.DisplayName, h.Helper.AvatarUrl,
                h.Scope, h.CreatedAt, h.EndedAt, h.MarketplaceRequestId })
            .ToListAsync(ct);
        return rows
            .OrderBy(h => h.EndedAt != null ? 1 : 0)
            .Select(h => new TaskHelperDto(h.Id, h.HelperUserId, h.DisplayName, h.AvatarUrl, h.Scope,
                h.CreatedAt, h.EndedAt, h.MarketplaceRequestId, h.EndedAt == null && canEnd))
            .ToList();
    }

    public async System.Threading.Tasks.Task EndHelperAsync(Guid userId, Guid taskId, Guid helperRowId, CancellationToken ct = default)
    {
        var task = await _access.RequireTaskDetailsAsync(userId, taskId, ct);
        var membership = await _access.RequireMemberAsync(userId, task.Project.GroupId, ct);
        if (membership.Role != Role.Leader && task.AssigneeUserId != userId)
            throw new ForbiddenException("Chỉ Trưởng nhóm hoặc người phụ trách mới kết thúc được hỗ trợ.");
        var row = await _context.TaskHelpers.Include(h => h.Helper)
            .FirstOrDefaultAsync(h => h.Id == helperRowId && h.TaskId == taskId, ct)
            ?? throw new NotFoundException("Không tìm thấy người hỗ trợ này.");
        if (row.EndedAt != null)
            throw new BadRequestException("Hỗ trợ này đã kết thúc.");
        row.EndedAt = DateTime.UtcNow;
        row.EndedByUserId = userId;
        _context.ActivityLogs.Add(Log(userId, task.Project.GroupId, task.ProjectId, "TaskHelper", row.Id, "End",
            $"Kết thúc hỗ trợ của {row.Helper.DisplayName} cho công việc '{task.Title}'"));
        await _context.SaveChangesAsync(ct);
        await _notifications.NotifyAsync(row.HelperUserId, task.Project.GroupId, NotificationType.HelperEnded,
            "Hỗ trợ đã kết thúc", $"Hỗ trợ của bạn cho công việc '{task.Title}' đã kết thúc.", "Task", task.Id, ct);
    }

    /// <summary>Task ids (of the given set) where the viewer has an active helper row — one batched query.</summary>
    private async Task<HashSet<Guid>> HelperTaskIdsAsync(Guid userId, IEnumerable<Guid> taskIds, CancellationToken ct)
    {
        var ids = taskIds.Distinct().ToList();
        if (ids.Count == 0) return [];
        return (await _context.TaskHelpers
            .Where(h => h.HelperUserId == userId && h.EndedAt == null && ids.Contains(h.TaskId))
            .Select(h => h.TaskId).ToListAsync(ct)).ToHashSet();
    }

    /// <summary>Task ids a Leader already nudged in the current clock hour (the M3 once-per-hour key).</summary>
    private async Task<HashSet<Guid>> RemindedTaskIdsAsync(bool viewerIsLeader, IEnumerable<Guid> taskIds, CancellationToken ct)
    {
        var ids = taskIds.Distinct().ToList();
        if (!viewerIsLeader || ids.Count == 0) return [];
        var suffix = $":{DateTime.UtcNow:yyyyMMddHH}";
        return (await _context.ReminderDeliveries
            .Where(r => ids.Contains(r.TaskId) && r.DeduplicationKey.StartsWith("nudge:") && r.DeduplicationKey.EndsWith(suffix))
            .Select(r => r.TaskId).ToListAsync(ct)).ToHashSet();
    }

    private async Task<TaskRuleContext> BuildCtxAsync(Guid userId, GroupMember membership, TaskEntity task, CancellationToken ct)
    {
        Guid? pAssignee = null; TaskStatus? pStatus = null;
        if (task.ParentTaskId != null)
        {
            var p = await _context.Tasks.Where(t => t.Id == task.ParentTaskId)
                .Select(t => new { t.AssigneeUserId, t.Status }).FirstAsync(ct);
            pAssignee = p.AssigneeUserId; pStatus = p.Status;
        }
        var subCount = await _context.Tasks.CountAsync(t => t.ParentTaskId == task.Id, ct);
        var openCount = subCount == 0 ? 0 : await _context.Tasks.CountAsync(t => t.ParentTaskId == task.Id && t.Status != TaskStatus.Completed, ct);
        var anotherLeader = await AnotherLeaderAsync(membership, userId, task.Project.GroupId, ct);
        return new TaskRuleContext(membership.Role, userId, task.AssigneeUserId, task.CreatedByUserId,
            task.ParentTaskId, pAssignee, task.Status, pStatus, subCount, openCount, anotherLeader);
    }

    private async Task<TaskEntity> LoadAsync(Guid taskId, CancellationToken ct)
        => await _context.Tasks.Include(t => t.Project).FirstOrDefaultAsync(t => t.Id == taskId && t.Project.ArchivedAt == null, ct)
            ?? throw new NotFoundException("Không tìm thấy công việc này.");

    private async Task<TaskDetailDto> GetDetailDtoAsync(Guid userId, Guid taskId, CancellationToken ct)
    {
        var row = await RowQuery(_context.Tasks.Where(t => t.Id == taskId)).FirstAsync(ct);
        var groupId = await _context.Projects.Where(p => p.Id == row.ProjectId).Select(p => p.GroupId).FirstAsync(ct);
        var membership = await _access.RequireMemberAsync(userId, groupId, ct);
        var anotherLeader = await AnotherLeaderAsync(membership, userId, groupId, ct);
        var isHelper = await _context.TaskHelpers.AnyAsync(h => h.TaskId == taskId && h.HelperUserId == userId && h.EndedAt == null, ct);
        var ctx = Ctx(membership, userId, row, anotherLeader, isHelper);
        var reminded = (await RemindedTaskIdsAsync(membership.Role == Role.Leader, [taskId], ct)).Contains(taskId);
        var perms = TaskRules.Permissions(ctx, reminded);
        var canReview = perms.AllowedTransitions.Contains(nameof(TaskStatus.Completed));
        var createdByName = await _context.Users.Where(u => u.Id == row.CreatedByUserId).Select(u => u.DisplayName).FirstOrDefaultAsync(ct);
        var desc = await _context.Tasks.Where(t => t.Id == taskId)
            .Select(t => new { t.Description, t.EstimateHours, t.CreatedAt, t.SubmittedAt, t.CompletedAt }).FirstAsync(ct);
        return new TaskDetailDto(row.Id, row.ProjectId, row.ParentTaskId, row.Title,
            row.AssigneeUserId, row.AssigneeName, row.Status.ToString(), row.Priority.ToString(),
            row.DeadlineAt, desc.Description, desc.EstimateHours, row.Points,
            row.ProgressPercent, row.CreatedByUserId, desc.CreatedAt, desc.SubmittedAt, desc.CompletedAt,
            canReview, row.ParentTitle, row.SubtaskCount, row.SubtasksCompleted, row.UpdatedAt, perms, createdByName);
    }

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
