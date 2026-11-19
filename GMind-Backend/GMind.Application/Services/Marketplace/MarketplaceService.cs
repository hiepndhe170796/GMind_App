using GMind.Application.Common;
using GMind.Application.Common.Exceptions;
using GMind.Application.Services.Notifications;
using GMind.Domain.Entities;
using GMind.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using TaskEntity = GMind.Domain.Entities.Task;
using Task = System.Threading.Tasks.Task;
using TaskStatus = GMind.Domain.Enums.TaskStatus;

namespace GMind.Application.Services.Marketplace;

public interface IMarketplaceService
{
    Task<MarketplaceDto> CreateAsync(Guid userId, Guid groupId, MarketplaceRequestType type, Guid taskId,
        Guid? targetUserId, Guid? relatedTaskId, string reason, CancellationToken ct = default);
    Task<List<MarketplaceDto>> ListAsync(Guid userId, Guid groupId, string? statusFilter, CancellationToken ct = default);
    Task<MarketplaceDto> ApproveAsync(Guid leaderId, Guid requestId, string? comment, CancellationToken ct = default);
    Task<MarketplaceDto> RejectAsync(Guid leaderId, Guid requestId, string comment, CancellationToken ct = default);
    Task CancelAsync(Guid userId, Guid requestId, CancellationToken ct = default);
}

public record MarketplaceDto(Guid Id, string RequestType, string Status, string TaskTitle, Guid TaskId,
    string RequestedByName, string? TargetName, string Reason, string? ReviewComment, DateTime CreatedAt, DateTime? ReviewedAt,
    Guid RequestedByUserId, Guid? TargetUserId, Guid? RelatedTaskId, string? RelatedTaskTitle, bool CanReview = false);

public class MarketplaceService : IMarketplaceService
{
    private readonly IApplicationDbContext _context;
    private readonly INotificationService _notifications;
    private readonly IResourceAccess _access;

    public MarketplaceService(IApplicationDbContext context, INotificationService notifications, IResourceAccess access)
    {
        _context = context;
        _notifications = notifications;
        _access = access;
    }

    public async Task<MarketplaceDto> CreateAsync(Guid userId, Guid groupId, MarketplaceRequestType type, Guid taskId,
        Guid? targetUserId, Guid? relatedTaskId, string reason, CancellationToken ct = default)
    {
        await RequireMemberAsync(userId, groupId, ct);
        if (!Enum.IsDefined(type)) throw new BadRequestException("Loại yêu cầu không hợp lệ.");
        if (string.IsNullOrWhiteSpace(reason) || reason.Length > 1000) throw new BadRequestException("Vui lòng nhập lý do (tối đa 1000 ký tự).");
        if (taskId == Guid.Empty || targetUserId == Guid.Empty || relatedTaskId == Guid.Empty) throw new BadRequestException("Công việc hoặc thành viên không hợp lệ.");
        if (type != MarketplaceRequestType.Swap && relatedTaskId != null) throw new BadRequestException("Chỉ yêu cầu Hoán đổi mới cần công việc liên quan.");

        var task = await _context.Tasks.Include(t => t.Project)
            .FirstOrDefaultAsync(t => t.Id == taskId && t.Project.GroupId == groupId && t.Project.ArchivedAt == null, ct)
            ?? throw new BadRequestException("Không tìm thấy công việc này trong nhóm.");

        if (task.AssigneeUserId != userId)
            throw new ForbiddenException("Bạn chỉ có thể yêu cầu hỗ trợ cho công việc được giao cho mình.");
        if (task.Status == TaskStatus.Completed)
            throw new BadRequestException("Không thể tạo yêu cầu cho công việc đã hoàn thành.");

        if (type is MarketplaceRequestType.Transfer or MarketplaceRequestType.Swap && targetUserId == null)
            throw new BadRequestException("Vui lòng chọn thành viên nhận cho yêu cầu Chuyển giao/Hoán đổi.");

        string? targetName = null;
        if (targetUserId != null)
        {
            await RequireMemberAsync(targetUserId.Value, groupId, ct);
            if (targetUserId == userId) throw new BadRequestException("Bạn không thể chọn chính mình.");
            targetName = await _context.Users.Where(u => u.Id == targetUserId.Value).Select(u => u.DisplayName).FirstAsync(ct);
        }

        TaskEntity? other = null;
        if (type == MarketplaceRequestType.Swap)
        {
            if (relatedTaskId == null) throw new BadRequestException("Yêu cầu Hoán đổi cần chọn công việc của thành viên kia.");
            other = await _context.Tasks.Include(t => t.Project)
                .FirstOrDefaultAsync(t => t.Id == relatedTaskId && t.Project.GroupId == groupId && t.Project.ArchivedAt == null, ct)
                ?? throw new BadRequestException("Không tìm thấy công việc liên quan trong nhóm này.");
            if (other.AssigneeUserId != targetUserId)
                throw new BadRequestException("Công việc liên quan phải thuộc về thành viên được chọn.");
            if (other.Status == TaskStatus.Completed)
                throw new BadRequestException("Không thể hoán đổi với công việc đã hoàn thành.");
        }

        var duplicate = await _context.MarketplaceRequests.AnyAsync(r =>
            r.TaskId == taskId && r.RequestType == type && r.Status == MarketplaceRequestStatus.Pending, ct);
        if (duplicate) throw new ConflictException("Công việc này đã có một yêu cầu cùng loại đang chờ duyệt.");

        var request = new MarketplaceRequest
        {
            Id = Guid.NewGuid(),
            GroupId = groupId,
            ProjectId = task.ProjectId,
            TaskId = taskId,
            RequestType = type,
            RequestedByUserId = userId,
            TargetUserId = targetUserId,
            RelatedTaskId = relatedTaskId,
            Reason = reason.Trim()
        };

        _context.MarketplaceRequests.Add(request);
        _context.ActivityLogs.Add(Log(userId, groupId, task.ProjectId, "MarketplaceRequest", request.Id, "Create",
            $"{GMind.Application.Common.Labels.MarketplaceType(request.RequestType)} cho công việc '{task.Title}'"));
        await _context.SaveChangesAsync(ct);

        var leaders = await _context.GroupMembers
            .Where(m => m.GroupId == groupId && m.Role == Role.Leader && m.IsActive && m.UserId != userId)
            .Select(m => m.UserId).ToListAsync(ct);
        var requesterName = await _context.Users.Where(u => u.Id == userId).Select(u => u.DisplayName).FirstAsync(ct);
        foreach (var leaderId in leaders)
            await _notifications.NotifyAsync(leaderId, groupId, NotificationType.MarketplaceRequestCreated,
                $"Yêu cầu {GMind.Application.Common.Labels.MarketplaceType(request.RequestType)}", $"{requesterName} tạo yêu cầu {GMind.Application.Common.Labels.MarketplaceType(request.RequestType)} cho công việc '{task.Title}'",
                "MarketplaceRequest", request.Id, ct);

        return ToDto(request, task.Title, requesterName, targetName, other?.Title);
    }

    public async Task<List<MarketplaceDto>> ListAsync(Guid userId, Guid groupId, string? statusFilter, CancellationToken ct = default)
    {
        var membership = await RequireMemberAsync(userId, groupId, ct);
        var anotherLeader = membership.Role == Role.Leader
            && await _context.GroupMembers.AnyAsync(m => m.GroupId == groupId
                && m.Role == Role.Leader && m.IsActive && m.UserId != userId, ct);
        var q = _context.MarketplaceRequests
            .Where(r => r.GroupId == groupId)
            .AsQueryable();
        if (!string.IsNullOrWhiteSpace(statusFilter))
        {
            if (!Enum.TryParse<MarketplaceRequestStatus>(statusFilter, true, out var s) || !Enum.IsDefined(s))
                throw new BadRequestException("Trạng thái yêu cầu không hợp lệ.");
            q = q.Where(r => r.Status == s);
        }
        return await q.OrderByDescending(r => r.CreatedAt)
            .Take(100)
            .Select(r => new MarketplaceDto(r.Id, r.RequestType.ToString(), r.Status.ToString(),
                r.Task != null ? r.Task.Title : "", r.TaskId ?? Guid.Empty,
                r.RequestedBy.DisplayName, r.TargetUser != null ? r.TargetUser.DisplayName : null,
                r.Reason, r.ReviewComment, r.CreatedAt, r.ReviewedAt,
                r.RequestedByUserId, r.TargetUserId, r.RelatedTaskId,
                r.RelatedTask != null ? r.RelatedTask.Title : null,
                membership.Role == Role.Leader && r.Status == MarketplaceRequestStatus.Pending
                    && !(r.RequestedByUserId == userId && anotherLeader)))
            .ToListAsync(ct);
    }

    public async Task<MarketplaceDto> ApproveAsync(Guid leaderId, Guid requestId, string? comment, CancellationToken ct = default)
    {
        var req = await LoadAsync(requestId, ct);
        await RequireLeaderAsync(leaderId, req.GroupId, ct);
        if (req.Status != MarketplaceRequestStatus.Pending)
            throw new BadRequestException("Yêu cầu này không còn ở trạng thái chờ duyệt.");

        if (!Enum.IsDefined(req.RequestType)) throw new BadRequestException("Loại yêu cầu không hợp lệ.");
        var task = req.Task ?? throw new ConflictException("Công việc của yêu cầu không còn tồn tại.");
        if (task.Project.GroupId != req.GroupId || task.ProjectId != req.ProjectId || task.Project.ArchivedAt != null)
            throw new ConflictException("Công việc của yêu cầu không còn tồn tại trong nhóm này.");
        if (task.Status == TaskStatus.Completed || task.AssigneeUserId != req.RequestedByUserId)
            throw new ConflictException("Công việc đã thay đổi kể từ khi yêu cầu được tạo. Hãy tải lại và thử lại.");
        await RequireMemberAsync(req.RequestedByUserId, req.GroupId, ct);
        if (req.RequestType is MarketplaceRequestType.Transfer or MarketplaceRequestType.Swap && req.TargetUserId == null)
            throw new BadRequestException("Vui lòng chọn thành viên.");
        if (req.TargetUserId != null) {
            if (req.TargetUserId == req.RequestedByUserId) throw new BadRequestException("Bạn không thể chọn chính mình.");
            await RequireMemberAsync(req.TargetUserId.Value, req.GroupId, ct);
        }
        TaskEntity? other = null;
        if (req.RequestType == MarketplaceRequestType.Swap) {
            other = await _context.Tasks.Include(t => t.Project)
                .FirstOrDefaultAsync(t => t.Id == req.RelatedTaskId && t.Project.GroupId == req.GroupId && t.Project.ArchivedAt == null, ct)
                ?? throw new ConflictException("Công việc liên quan không còn tồn tại trong nhóm này.");
            if (other.Id == task.Id || other.AssigneeUserId != req.TargetUserId || other.Status == TaskStatus.Completed)
                throw new ConflictException("Công việc liên quan đã thay đổi kể từ khi yêu cầu được tạo. Hãy tải lại và thử lại.");
        }

        switch (req.RequestType)
        {
            case MarketplaceRequestType.Transfer:
                task.AssigneeUserId = req.TargetUserId;
                task.UpdatedAt = DateTime.UtcNow;
                _context.ActivityLogs.Add(Log(leaderId, req.GroupId, req.ProjectId, "Task", task.Id, "Transfer",
                    $"Công việc '{task.Title}' chuyển cho {req.TargetUser?.DisplayName}"));
                break;

            case MarketplaceRequestType.Swap:
                (task.AssigneeUserId, other!.AssigneeUserId) = (other.AssigneeUserId, task.AssigneeUserId);
                task.UpdatedAt = other.UpdatedAt = DateTime.UtcNow;
                _context.ActivityLogs.Add(Log(leaderId, req.GroupId, req.ProjectId, "Task", task.Id, "Swap",
                    $"Hoán đổi '{task.Title}' ↔ '{other!.Title}'"));
                break;

            case MarketplaceRequestType.NeedHelp:
                _context.ActivityLogs.Add(Log(leaderId, req.GroupId, req.ProjectId, "Task", task.Id, "NeedHelp",
                    $"Hỗ trợ được duyệt cho công việc '{task.Title}'"));
                break;
        }

        req.Status = MarketplaceRequestStatus.Approved;
        req.ReviewerUserId = leaderId;
        req.ReviewComment = comment;
        req.ReviewedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync(ct);

        await _notifications.NotifyAsync(req.RequestedByUserId, req.GroupId, NotificationType.MarketplaceRequestApproved,
            "Yêu cầu được duyệt", $"Yêu cầu {GMind.Application.Common.Labels.MarketplaceType(req.RequestType)} cho công việc '{task.Title}' đã được duyệt",
            "MarketplaceRequest", req.Id, ct);
        if (req.TargetUserId != null)
            await _notifications.NotifyAsync(req.TargetUserId.Value, req.GroupId, NotificationType.TaskAssigned,
                "Bạn được giao task", $"Task '{task.Title}' được {req.RequestType.ToString().ToLower()} cho bạn",
                "Task", task.Id, ct);

        return ToDto(req, task.Title, req.RequestedBy.DisplayName, req.TargetUser?.DisplayName);
    }

    public async Task<MarketplaceDto> RejectAsync(Guid leaderId, Guid requestId, string comment, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(comment))
            throw new BadRequestException("Vui lòng nhập lý do từ chối.");
        var req = await LoadAsync(requestId, ct);
        await RequireLeaderAsync(leaderId, req.GroupId, ct);
        if (req.Status != MarketplaceRequestStatus.Pending)
            throw new BadRequestException("Yêu cầu này không còn ở trạng thái chờ duyệt.");

        req.Status = MarketplaceRequestStatus.Rejected;
        req.ReviewerUserId = leaderId;
        req.ReviewComment = comment.Trim();
        req.ReviewedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync(ct);

        await _notifications.NotifyAsync(req.RequestedByUserId, req.GroupId, NotificationType.MarketplaceRequestRejected,
            "Yêu cầu bị từ chối", $"Yêu cầu {GMind.Application.Common.Labels.MarketplaceType(req.RequestType)} bị từ chối: {comment}",
            "MarketplaceRequest", req.Id, ct);

        return ToDto(req, req.Task?.Title ?? "", req.RequestedBy.DisplayName, req.TargetUser?.DisplayName);
    }

    public async Task CancelAsync(Guid userId, Guid requestId, CancellationToken ct = default)
    {
        var req = await LoadAsync(requestId, ct);
        await RequireMemberAsync(userId, req.GroupId, ct);
        if (req.RequestedByUserId != userId) throw new ForbiddenException("Chỉ người tạo yêu cầu mới có thể hủy.");
        if (req.Status != MarketplaceRequestStatus.Pending)
            throw new BadRequestException("Yêu cầu này không còn ở trạng thái chờ duyệt.");
        req.Status = MarketplaceRequestStatus.Cancelled;
        req.ReviewedAt = DateTime.UtcNow;
        var userName = await _context.Users.Where(u => u.Id == userId).Select(u => u.DisplayName).FirstAsync(ct);
        _context.ActivityLogs.Add(new ActivityLog
        {
            Id = Guid.NewGuid(), ActorUserId = userId, GroupId = req.GroupId,
            EntityType = "MarketplaceRequest", EntityId = req.Id, Action = "Cancel",
            Summary = $"{userName} đã hủy yêu cầu {GMind.Application.Common.Labels.MarketplaceType(req.RequestType)}",
        });
        await _context.SaveChangesAsync(ct);
    }

    private async Task<MarketplaceRequest> LoadAsync(Guid requestId, CancellationToken ct)
        => await _context.MarketplaceRequests
            .Include(r => r.Task).ThenInclude(t => t!.Project).Include(r => r.RequestedBy).Include(r => r.TargetUser)
            .Include(r => r.RelatedTask)
            .FirstOrDefaultAsync(r => r.Id == requestId, ct)
            ?? throw new NotFoundException("Không tìm thấy yêu cầu này.");

    private Task<GroupMember> RequireMemberAsync(Guid userId, Guid groupId, CancellationToken ct)
        => _access.RequireMemberAsync(userId, groupId, ct);

    private Task RequireLeaderAsync(Guid userId, Guid groupId, CancellationToken ct)
        => _access.RequireLeaderAsync(userId, groupId, ct);

    private static MarketplaceDto ToDto(MarketplaceRequest r, string taskTitle, string requesterName, string? targetName, string? relatedTaskTitle = null, bool canReview = false)
        => new(r.Id, r.RequestType.ToString(), r.Status.ToString(), taskTitle, r.TaskId ?? Guid.Empty,
            requesterName, targetName, r.Reason, r.ReviewComment, r.CreatedAt, r.ReviewedAt,
            r.RequestedByUserId, r.TargetUserId, r.RelatedTaskId, relatedTaskTitle ?? r.RelatedTask?.Title,
            CanReview: canReview);

    private static ActivityLog Log(Guid actor, Guid groupId, Guid? projectId, string entityType, Guid? entityId, string action, string summary)
        => new() { Id = Guid.NewGuid(), ActorUserId = actor, GroupId = groupId, ProjectId = projectId, EntityType = entityType, EntityId = entityId, Action = action, Summary = summary };
}
