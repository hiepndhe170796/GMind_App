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
    string RequestedByName, string? TargetName, string Reason, string? ReviewComment, DateTime CreatedAt, DateTime? ReviewedAt);

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
        if (!Enum.IsDefined(type)) throw new BadRequestException("Invalid marketplace request type");
        if (string.IsNullOrWhiteSpace(reason) || reason.Length > 1000) throw new BadRequestException("A reason of up to 1000 characters is required");
        if (taskId == Guid.Empty || targetUserId == Guid.Empty || relatedTaskId == Guid.Empty) throw new BadRequestException("Invalid task or member id");
        if (type != MarketplaceRequestType.Swap && relatedTaskId != null) throw new BadRequestException("Related task is only allowed for Swap");

        var task = await _context.Tasks.Include(t => t.Project)
            .FirstOrDefaultAsync(t => t.Id == taskId && t.Project.GroupId == groupId && t.Project.ArchivedAt == null, ct)
            ?? throw new BadRequestException("Task not found in this group");

        if (task.AssigneeUserId != userId)
            throw new ForbiddenException("You can only request help for tasks assigned to you");
        if (task.Status == TaskStatus.Completed)
            throw new BadRequestException("Cannot create marketplace request for a completed task");

        if (type is MarketplaceRequestType.Transfer or MarketplaceRequestType.Swap && targetUserId == null)
            throw new BadRequestException("Target member is required for Transfer/Swap");

        if (targetUserId != null)
        {
            await RequireMemberAsync(targetUserId.Value, groupId, ct);
            if (targetUserId == userId) throw new BadRequestException("Target cannot be yourself");
        }

        if (type == MarketplaceRequestType.Swap)
        {
            if (relatedTaskId == null) throw new BadRequestException("Swap requires the other member's task");
            var other = await _context.Tasks.Include(t => t.Project)
                .FirstOrDefaultAsync(t => t.Id == relatedTaskId && t.Project.GroupId == groupId && t.Project.ArchivedAt == null, ct)
                ?? throw new BadRequestException("Related task not found in this group");
            if (other.AssigneeUserId != targetUserId)
                throw new BadRequestException("Related task must belong to the target member");
            if (other.Status == TaskStatus.Completed)
                throw new BadRequestException("Cannot swap with a completed task");
        }

        var duplicate = await _context.MarketplaceRequests.AnyAsync(r =>
            r.TaskId == taskId && r.RequestType == type && r.Status == MarketplaceRequestStatus.Pending, ct);
        if (duplicate) throw new ConflictException("A pending request of this type already exists for the task");

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
            $"{type} request for task '{task.Title}'"));
        await _context.SaveChangesAsync(ct);

        var leaders = await _context.GroupMembers
            .Where(m => m.GroupId == groupId && m.Role == Role.Leader && m.IsActive && m.UserId != userId)
            .Select(m => m.UserId).ToListAsync(ct);
        var requesterName = await _context.Users.Where(u => u.Id == userId).Select(u => u.DisplayName).FirstAsync(ct);
        foreach (var leaderId in leaders)
            await _notifications.NotifyAsync(leaderId, groupId, NotificationType.MarketplaceRequestCreated,
                $"Yêu cầu {type}", $"{requesterName} tạo yêu cầu {type} cho task '{task.Title}'",
                "MarketplaceRequest", request.Id, ct);

        return ToDto(request, task.Title, requesterName, null);
    }

    public async Task<List<MarketplaceDto>> ListAsync(Guid userId, Guid groupId, string? statusFilter, CancellationToken ct = default)
    {
        await RequireMemberAsync(userId, groupId, ct);
        var q = _context.MarketplaceRequests
            .Where(r => r.GroupId == groupId)
            .AsQueryable();
        if (!string.IsNullOrWhiteSpace(statusFilter))
        {
            if (!Enum.TryParse<MarketplaceRequestStatus>(statusFilter, true, out var s) || !Enum.IsDefined(s))
                throw new BadRequestException("Invalid marketplace status");
            q = q.Where(r => r.Status == s);
        }
        return await q.OrderByDescending(r => r.CreatedAt)
            .Take(100)
            .Select(r => new MarketplaceDto(r.Id, r.RequestType.ToString(), r.Status.ToString(),
                r.Task != null ? r.Task.Title : "", r.TaskId ?? Guid.Empty,
                r.RequestedBy.DisplayName, r.TargetUser != null ? r.TargetUser.DisplayName : null,
                r.Reason, r.ReviewComment, r.CreatedAt, r.ReviewedAt))
            .ToListAsync(ct);
    }

    public async Task<MarketplaceDto> ApproveAsync(Guid leaderId, Guid requestId, string? comment, CancellationToken ct = default)
    {
        var req = await LoadAsync(requestId, ct);
        await RequireLeaderAsync(leaderId, req.GroupId, ct);
        if (req.Status != MarketplaceRequestStatus.Pending)
            throw new BadRequestException("Request is not pending");

        if (!Enum.IsDefined(req.RequestType)) throw new BadRequestException("Invalid marketplace request type");
        var task = req.Task ?? throw new ConflictException("Request task is no longer available");
        if (task.Project.GroupId != req.GroupId || task.ProjectId != req.ProjectId || task.Project.ArchivedAt != null)
            throw new ConflictException("Request task is no longer available in this group");
        if (task.Status == TaskStatus.Completed || task.AssigneeUserId != req.RequestedByUserId)
            throw new ConflictException("Task changed since this request was created");
        await RequireMemberAsync(req.RequestedByUserId, req.GroupId, ct);
        if (req.RequestType is MarketplaceRequestType.Transfer or MarketplaceRequestType.Swap && req.TargetUserId == null)
            throw new BadRequestException("Target member is required");
        if (req.TargetUserId != null) {
            if (req.TargetUserId == req.RequestedByUserId) throw new BadRequestException("Target cannot be yourself");
            await RequireMemberAsync(req.TargetUserId.Value, req.GroupId, ct);
        }
        TaskEntity? other = null;
        if (req.RequestType == MarketplaceRequestType.Swap) {
            other = await _context.Tasks.Include(t => t.Project)
                .FirstOrDefaultAsync(t => t.Id == req.RelatedTaskId && t.Project.GroupId == req.GroupId && t.Project.ArchivedAt == null, ct)
                ?? throw new ConflictException("Related task is no longer available in this group");
            if (other.Id == task.Id || other.AssigneeUserId != req.TargetUserId || other.Status == TaskStatus.Completed)
                throw new ConflictException("Related task changed since this request was created");
        }

        switch (req.RequestType)
        {
            case MarketplaceRequestType.Transfer:
                task.AssigneeUserId = req.TargetUserId;
                task.UpdatedAt = DateTime.UtcNow;
                _context.ActivityLogs.Add(Log(leaderId, req.GroupId, req.ProjectId, "Task", task.Id, "Transfer",
                    $"Task '{task.Title}' transferred to {req.TargetUserId}"));
                break;

            case MarketplaceRequestType.Swap:
                (task.AssigneeUserId, other!.AssigneeUserId) = (other.AssigneeUserId, task.AssigneeUserId);
                task.UpdatedAt = other.UpdatedAt = DateTime.UtcNow;
                _context.ActivityLogs.Add(Log(leaderId, req.GroupId, req.ProjectId, "Task", task.Id, "Swap",
                    $"Swapped '{task.Title}' <-> '{other!.Title}'"));
                break;

            case MarketplaceRequestType.NeedHelp:
                _context.ActivityLogs.Add(Log(leaderId, req.GroupId, req.ProjectId, "Task", task.Id, "NeedHelp",
                    $"Help approved for '{task.Title}'"));
                break;
        }

        req.Status = MarketplaceRequestStatus.Approved;
        req.ReviewerUserId = leaderId;
        req.ReviewComment = comment;
        req.ReviewedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync(ct);

        await _notifications.NotifyAsync(req.RequestedByUserId, req.GroupId, NotificationType.MarketplaceRequestApproved,
            "Yêu cầu được duyệt", $"Yêu cầu {req.RequestType} cho task '{task.Title}' đã được duyệt",
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
            throw new BadRequestException("Rejection comment is required");
        var req = await LoadAsync(requestId, ct);
        await RequireLeaderAsync(leaderId, req.GroupId, ct);
        if (req.Status != MarketplaceRequestStatus.Pending)
            throw new BadRequestException("Request is not pending");

        req.Status = MarketplaceRequestStatus.Rejected;
        req.ReviewerUserId = leaderId;
        req.ReviewComment = comment.Trim();
        req.ReviewedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync(ct);

        await _notifications.NotifyAsync(req.RequestedByUserId, req.GroupId, NotificationType.MarketplaceRequestRejected,
            "Yêu cầu bị từ chối", $"Yêu cầu {req.RequestType} bị từ chối: {comment}",
            "MarketplaceRequest", req.Id, ct);

        return ToDto(req, req.Task?.Title ?? "", req.RequestedBy.DisplayName, req.TargetUser?.DisplayName);
    }

    public async Task CancelAsync(Guid userId, Guid requestId, CancellationToken ct = default)
    {
        var req = await LoadAsync(requestId, ct);
        await RequireMemberAsync(userId, req.GroupId, ct);
        if (req.RequestedByUserId != userId) throw new ForbiddenException("Only the requester can cancel");
        if (req.Status != MarketplaceRequestStatus.Pending)
            throw new BadRequestException("Request is not pending");
        _context.MarketplaceRequests.Remove(req);
        await _context.SaveChangesAsync(ct);
    }

    private async Task<MarketplaceRequest> LoadAsync(Guid requestId, CancellationToken ct)
        => await _context.MarketplaceRequests
            .Include(r => r.Task).ThenInclude(t => t!.Project).Include(r => r.RequestedBy).Include(r => r.TargetUser)
            .FirstOrDefaultAsync(r => r.Id == requestId, ct)
            ?? throw new NotFoundException("Request not found");

    private Task<GroupMember> RequireMemberAsync(Guid userId, Guid groupId, CancellationToken ct)
        => _access.RequireMemberAsync(userId, groupId, ct);

    private Task RequireLeaderAsync(Guid userId, Guid groupId, CancellationToken ct)
        => _access.RequireLeaderAsync(userId, groupId, ct);

    private static MarketplaceDto ToDto(MarketplaceRequest r, string taskTitle, string requesterName, string? targetName)
        => new(r.Id, r.RequestType.ToString(), r.Status.ToString(), taskTitle, r.TaskId ?? Guid.Empty,
            requesterName, targetName, r.Reason, r.ReviewComment, r.CreatedAt, r.ReviewedAt);

    private static ActivityLog Log(Guid actor, Guid groupId, Guid? projectId, string entityType, Guid? entityId, string action, string summary)
        => new() { Id = Guid.NewGuid(), ActorUserId = actor, GroupId = groupId, ProjectId = projectId, EntityType = entityType, EntityId = entityId, Action = action, Summary = summary };
}
