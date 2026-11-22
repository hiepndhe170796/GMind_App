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
        Guid? targetUserId, Guid? relatedTaskId, string reason, string? helpScope, CancellationToken ct = default);
    Task<List<MarketplaceDto>> ListAsync(Guid userId, Guid groupId, string? statusFilter, CancellationToken ct = default);
    Task<List<MarketplaceDto>> IncomingAsync(Guid userId, CancellationToken ct = default);
    Task<List<SwapCandidateDto>> SwapCandidatesAsync(Guid userId, Guid groupId, Guid targetUserId, CancellationToken ct = default);
    Task<MarketplaceDto> RespondAsync(Guid userId, Guid requestId, bool accept, string? comment, CancellationToken ct = default);
    Task<MarketplaceDto> ClaimAsync(Guid userId, Guid requestId, string? note, CancellationToken ct = default);
    Task<MarketplaceDto> ApproveAsync(Guid leaderId, Guid requestId, string? comment, CancellationToken ct = default);
    Task<MarketplaceDto> RejectAsync(Guid leaderId, Guid requestId, string comment, CancellationToken ct = default);
    Task CancelAsync(Guid userId, Guid requestId, CancellationToken ct = default);
}

public record MarketplaceDto(Guid Id, string RequestType, string Status, string TaskTitle, Guid TaskId,
    string RequestedByName, string? TargetName, string Reason, string? ReviewComment, DateTime CreatedAt, DateTime? ReviewedAt,
    Guid RequestedByUserId, Guid? TargetUserId, Guid? RelatedTaskId, string? RelatedTaskTitle, bool CanReview = false,
    Guid GroupId = default, string? GroupName = null, Guid? ProjectId = null, string? ProjectName = null,
    string? HelpScope = null, string? RecipientComment = null, DateTime? RespondedAt = null, DateTime? ClaimedAt = null,
    DateTime? TaskDeadlineAt = null, DateTime? RelatedTaskDeadlineAt = null, string? ReviewerName = null,
    int? RequesterOpenTasks = null, int? TargetOpenTasks = null,
    bool CanReject = false, bool CanRespond = false, bool CanClaim = false, bool CanCancel = false);

public record SwapCandidateDto(Guid Id, string Title, string ProjectName, DateTime? DeadlineAt, string Status);

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

    private const string ConcurrencyMessage = "Yêu cầu vừa được cập nhật bởi người khác. Hãy tải lại và thử lại.";
    private const string ClaimConflictMessage = "Yêu cầu này đã có người nhận hoặc đã kết thúc.";
    private const string ChangedMessage = "Công việc đã thay đổi kể từ khi yêu cầu được tạo. Hãy tải lại và thử lại.";

    public async Task<MarketplaceDto> CreateAsync(Guid userId, Guid groupId, MarketplaceRequestType type, Guid taskId,
        Guid? targetUserId, Guid? relatedTaskId, string reason, string? helpScope, CancellationToken ct = default)
    {
        await RequireMemberAsync(userId, groupId, ct);
        if (!Enum.IsDefined(type)) throw new BadRequestException("Loại yêu cầu không hợp lệ.");
        if (string.IsNullOrWhiteSpace(reason) || reason.Length > 1000) throw new BadRequestException("Vui lòng nhập lý do (tối đa 1000 ký tự).");
        if (taskId == Guid.Empty || targetUserId == Guid.Empty || relatedTaskId == Guid.Empty) throw new BadRequestException("Công việc hoặc thành viên không hợp lệ.");
        if (type != MarketplaceRequestType.Swap && relatedTaskId != null) throw new BadRequestException("Chỉ yêu cầu Hoán đổi mới cần công việc liên quan.");

        var scope = helpScope?.Trim();
        if (type == MarketplaceRequestType.NeedHelp)
        {
            if (string.IsNullOrEmpty(scope) || scope.Length > 500)
                throw new BadRequestException("Vui lòng mô tả phần cần hỗ trợ (tối đa 500 ký tự).");
        }
        else if (!string.IsNullOrWhiteSpace(helpScope))
            throw new BadRequestException("Chỉ yêu cầu Cần hỗ trợ mới có phần mô tả hỗ trợ.");

        var task = await _context.Tasks.Include(t => t.Project)
            .FirstOrDefaultAsync(t => t.Id == taskId && t.Project.GroupId == groupId && t.Project.ArchivedAt == null, ct)
            ?? throw new BadRequestException("Không tìm thấy công việc này trong nhóm.");
        if (task.ParentTaskId != null)
            throw new BadRequestException("Chỉ tạo yêu cầu cho công việc chính.");

        if (task.AssigneeUserId != userId)
            throw new ForbiddenException("Bạn chỉ có thể yêu cầu hỗ trợ cho công việc được giao cho mình.");
        if (task.Status == TaskStatus.Completed)
            throw new BadRequestException("Không thể tạo yêu cầu cho công việc đã hoàn thành.");

        if (type == MarketplaceRequestType.Swap && targetUserId == null)
            throw new BadRequestException("Vui lòng chọn thành viên nhận cho yêu cầu Hoán đổi.");

        string? targetName = null;
        if (targetUserId != null)
        {
            await RequireMemberAsync(targetUserId.Value, groupId, ct);
            if (targetUserId == userId) throw new BadRequestException("Bạn không thể chọn chính mình.");
            targetName = await _context.Users.Where(u => u.Id == targetUserId.Value).Select(u => u.DisplayName).FirstAsync(ct);
            if (type == MarketplaceRequestType.NeedHelp
                && await _context.TaskHelpers.AnyAsync(h => h.TaskId == taskId && h.HelperUserId == targetUserId && h.EndedAt == null, ct))
                throw new ConflictException("Thành viên này đang là người hỗ trợ của công việc.");
        }

        TaskEntity? other = null;
        if (type == MarketplaceRequestType.Swap)
        {
            if (relatedTaskId == null) throw new BadRequestException("Yêu cầu Hoán đổi cần chọn công việc của thành viên kia.");
            other = await _context.Tasks.Include(t => t.Project)
                .FirstOrDefaultAsync(t => t.Id == relatedTaskId && t.Project.GroupId == groupId && t.Project.ArchivedAt == null, ct)
                ?? throw new BadRequestException("Không tìm thấy công việc liên quan trong nhóm này.");
            if (other.ParentTaskId != null)
                throw new BadRequestException("Chỉ tạo yêu cầu cho công việc chính.");
            if (other.AssigneeUserId != targetUserId)
                throw new BadRequestException("Công việc liên quan phải thuộc về thành viên được chọn.");
            if (other.Status == TaskStatus.Completed)
                throw new BadRequestException("Không thể hoán đổi với công việc đã hoàn thành.");
            var relatedBusy = await _context.MarketplaceRequests.AnyAsync(r =>
                MarketplaceRules.ActiveStatuses.Contains(r.Status)
                && (r.RequestType == MarketplaceRequestType.Transfer || r.RequestType == MarketplaceRequestType.Swap)
                && (r.TaskId == relatedTaskId || r.RelatedTaskId == relatedTaskId), ct);
            if (relatedBusy)
                throw new ConflictException("Công việc liên quan đang có yêu cầu chuyển giao hoặc hoán đổi khác.");
        }

        var duplicate = await _context.MarketplaceRequests.AnyAsync(r =>
            r.TaskId == taskId && r.RequestType == type && MarketplaceRules.ActiveStatuses.Contains(r.Status), ct);
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
            Reason = reason.Trim(),
            HelpScope = scope,
            Status = targetUserId != null ? MarketplaceRequestStatus.AwaitingRecipient : MarketplaceRequestStatus.Open
        };

        _context.MarketplaceRequests.Add(request);
        _context.ActivityLogs.Add(Log(userId, groupId, task.ProjectId, "MarketplaceRequest", request.Id, "Create",
            $"{GMind.Application.Common.Labels.MarketplaceType(request.RequestType)} cho công việc '{task.Title}'"));
        await _context.SaveChangesAsync(ct);

        var typeLabel = GMind.Application.Common.Labels.MarketplaceType(request.RequestType);
        var requesterName = await _context.Users.Where(u => u.Id == userId).Select(u => u.DisplayName).FirstAsync(ct);
        if (targetUserId != null)
        {
            await _notifications.NotifyAsync(targetUserId.Value, groupId, NotificationType.MarketplaceResponseNeeded,
                "Yêu cầu cần bạn phản hồi",
                $"{requesterName} gửi yêu cầu {typeLabel} cho công việc '{task.Title}'. Hãy phản hồi.",
                "MarketplaceRequest", request.Id, ct);
        }
        else
        {
            var members = await _context.GroupMembers
                .Where(m => m.GroupId == groupId && m.IsActive && m.User.IsActive && m.UserId != userId)
                .Select(m => m.UserId).ToListAsync(ct);
            foreach (var memberId in members)
                await _notifications.NotifyAsync(memberId, groupId, NotificationType.MarketplaceOpenRequest,
                    $"Yêu cầu {typeLabel} đang mở",
                    $"Có yêu cầu {typeLabel} đang mở cho công việc '{task.Title}'.",
                    "MarketplaceRequest", request.Id, ct);
        }

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
        var rows = await q.OrderByDescending(r => r.CreatedAt).Take(100)
            .Select(r => new Row(r.Id, r.RequestType, r.Status, r.GroupId, r.Group.Name,
                r.ProjectId, r.Project != null ? r.Project.Name : null,
                r.Task != null ? r.Task.Title : "", r.TaskId, r.Task != null ? r.Task.DeadlineAt : null,
                r.RequestedByUserId, r.RequestedBy.DisplayName,
                r.TargetUserId, r.TargetUser != null ? r.TargetUser.DisplayName : null,
                r.RelatedTaskId, r.RelatedTask != null ? r.RelatedTask.Title : null,
                r.RelatedTask != null ? r.RelatedTask.DeadlineAt : null,
                r.Reason, r.ReviewComment, r.HelpScope, r.RecipientComment,
                r.CreatedAt, r.ReviewedAt, r.RespondedAt, r.ClaimedAt,
                r.Reviewer != null ? r.Reviewer.DisplayName : null))
            .ToListAsync(ct);
        var workloads = await WorkloadsAsync(groupId, membership.Role == Role.Leader,
            rows.Select(r => r.RequestedByUserId).Concat(rows.Where(r => r.TargetUserId != null).Select(r => r.TargetUserId!.Value)), ct);
        var helperTaskIds = await HelperTaskIdsAsync(userId, rows, ct);
        return rows.Select(r => ToDto(r, userId, membership.Role, anotherLeader, workloads, helperTaskIds)).ToList();
    }

    public async Task<List<MarketplaceDto>> IncomingAsync(Guid userId, CancellationToken ct = default)
    {
        var groupIds = await _context.GroupMembers
            .Where(m => m.UserId == userId && m.IsActive && m.User.IsActive && !m.Group.IsArchived)
            .Select(m => m.GroupId).ToListAsync(ct);
        if (groupIds.Count == 0) return [];
        var leaderGroupIds = (await _context.GroupMembers
            .Where(m => m.UserId == userId && m.IsActive && m.Role == Role.Leader && groupIds.Contains(m.GroupId))
            .Select(m => m.GroupId).ToListAsync(ct)).ToHashSet();
        var anotherLeaderGroups = (await _context.GroupMembers
            .Where(m => leaderGroupIds.Contains(m.GroupId) && m.Role == Role.Leader && m.IsActive && m.UserId != userId)
            .Select(m => m.GroupId).Distinct().ToListAsync(ct)).ToHashSet();

        var rows = await _context.MarketplaceRequests
            .Where(r => groupIds.Contains(r.GroupId)
                && (r.Status == MarketplaceRequestStatus.AwaitingRecipient && r.TargetUserId == userId
                    || r.Status == MarketplaceRequestStatus.Open && r.RequestedByUserId != userId))
            .OrderByDescending(r => r.CreatedAt).Take(50)
            .Select(r => new Row(r.Id, r.RequestType, r.Status, r.GroupId, r.Group.Name,
                r.ProjectId, r.Project != null ? r.Project.Name : null,
                r.Task != null ? r.Task.Title : "", r.TaskId, r.Task != null ? r.Task.DeadlineAt : null,
                r.RequestedByUserId, r.RequestedBy.DisplayName,
                r.TargetUserId, r.TargetUser != null ? r.TargetUser.DisplayName : null,
                r.RelatedTaskId, r.RelatedTask != null ? r.RelatedTask.Title : null,
                r.RelatedTask != null ? r.RelatedTask.DeadlineAt : null,
                r.Reason, r.ReviewComment, r.HelpScope, r.RecipientComment,
                r.CreatedAt, r.ReviewedAt, r.RespondedAt, r.ClaimedAt,
                r.Reviewer != null ? r.Reviewer.DisplayName : null))
            .ToListAsync(ct);
        var helperTaskIds = await HelperTaskIdsAsync(userId, rows, ct);
        return rows.Select(r => ToDto(r, userId,
                leaderGroupIds.Contains(r.GroupId) ? Role.Leader : Role.Member,
                anotherLeaderGroups.Contains(r.GroupId), null, helperTaskIds)).ToList();
    }

    public async Task<List<SwapCandidateDto>> SwapCandidatesAsync(Guid userId, Guid groupId, Guid targetUserId, CancellationToken ct = default)
    {
        await RequireMemberAsync(userId, groupId, ct);
        var target = await _context.GroupMembers.FirstOrDefaultAsync(m => m.GroupId == groupId && m.UserId == targetUserId && m.IsActive, ct)
            ?? throw new NotFoundException("Không tìm thấy thành viên trong nhóm này.");
        return await _context.Tasks
            .Where(t => t.AssigneeUserId == target.UserId && t.ParentTaskId == null
                && t.Project.GroupId == groupId && t.Project.ArchivedAt == null && t.Status != TaskStatus.Completed)
            .OrderBy(t => t.DeadlineAt ?? DateTime.MaxValue)
            .Select(t => new SwapCandidateDto(t.Id, t.Title, t.Project.Name, t.DeadlineAt, t.Status.ToString()))
            .ToListAsync(ct);
    }

    public async Task<MarketplaceDto> RespondAsync(Guid userId, Guid requestId, bool accept, string? comment, CancellationToken ct = default)
    {
        var req = await LoadAsync(requestId, ct);
        await RequireMemberAsync(userId, req.GroupId, ct);
        if (req.TargetUserId != userId)
            throw new ForbiddenException("Chỉ người nhận mới có thể phản hồi yêu cầu này.");
        if (req.Status != MarketplaceRequestStatus.AwaitingRecipient)
            throw new BadRequestException("Yêu cầu này không còn chờ bạn phản hồi.");

        var task = req.Task ?? throw new ConflictException(ChangedMessage);
        var actorName = await _context.Users.Where(u => u.Id == userId).Select(u => u.DisplayName).FirstAsync(ct);
        var typeLabel = GMind.Application.Common.Labels.MarketplaceType(req.RequestType);
        req.RespondedAt = DateTime.UtcNow;
        req.RecipientComment = string.IsNullOrWhiteSpace(comment) ? null : comment.Trim();

        if (accept)
        {
            if (task.Status == TaskStatus.Completed || task.AssigneeUserId != req.RequestedByUserId)
                throw new ConflictException(ChangedMessage);
            if (req.RequestType == MarketplaceRequestType.Swap)
            {
                var other = req.RelatedTask;
                if (other == null || other.Status == TaskStatus.Completed || other.AssigneeUserId != userId)
                    throw new ConflictException(ChangedMessage);
            }
            req.Status = MarketplaceRequestStatus.Pending;
            _context.ActivityLogs.Add(Log(userId, req.GroupId, req.ProjectId, "MarketplaceRequest", req.Id, "Respond",
                $"{actorName} đồng ý yêu cầu {typeLabel} cho công việc '{task.Title}'"));
        }
        else
        {
            req.Status = MarketplaceRequestStatus.Declined;
            _context.ActivityLogs.Add(Log(userId, req.GroupId, req.ProjectId, "MarketplaceRequest", req.Id, "Respond",
                $"{actorName} từ chối yêu cầu {typeLabel} cho công việc '{task.Title}'"));
        }
        try { await _context.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { throw new ConflictException(ConcurrencyMessage); }

        if (accept)
        {
            await _notifications.NotifyAsync(req.RequestedByUserId, req.GroupId, NotificationType.MarketplaceRecipientAccepted,
                "Người nhận đồng ý", $"{actorName} đồng ý yêu cầu {typeLabel} cho công việc '{task.Title}'.",
                "MarketplaceRequest", req.Id, ct);
            await NotifyLeadersExceptPartiesAsync(req,
                $"Yêu cầu {typeLabel} cho công việc '{task.Title}' đang chờ duyệt.", ct);
        }
        else
        {
            var extra = req.RecipientComment != null ? $": {req.RecipientComment}" : ".";
            await _notifications.NotifyAsync(req.RequestedByUserId, req.GroupId, NotificationType.MarketplaceRecipientDeclined,
                "Người nhận từ chối", $"{actorName} từ chối yêu cầu {typeLabel} cho công việc '{task.Title}'{extra}",
                "MarketplaceRequest", req.Id, ct);
        }
        return ToDto(req, task.Title, req.RequestedBy.DisplayName, req.TargetUser?.DisplayName, req.RelatedTask?.Title);
    }

    public async Task<MarketplaceDto> ClaimAsync(Guid userId, Guid requestId, string? note, CancellationToken ct = default)
    {
        var req = await LoadAsync(requestId, ct);
        await RequireMemberAsync(userId, req.GroupId, ct);
        if (req.RequestedByUserId == userId)
            throw new ForbiddenException("Bạn không thể nhận yêu cầu của chính mình.");
        if (req.Status != MarketplaceRequestStatus.Open)
            throw new ConflictException(ClaimConflictMessage);
        if (req.RequestType == MarketplaceRequestType.NeedHelp && req.TaskId != null
            && await _context.TaskHelpers.AnyAsync(h => h.TaskId == req.TaskId && h.HelperUserId == userId && h.EndedAt == null, ct))
            throw new ConflictException("Bạn đang là người hỗ trợ của công việc này.");

        var now = DateTime.UtcNow;
        req.TargetUserId = userId;
        req.ClaimedAt = now;
        req.RespondedAt = now;
        req.RecipientComment = string.IsNullOrWhiteSpace(note) ? null : note.Trim();
        req.Status = MarketplaceRequestStatus.Pending;
        var task = req.Task;
        var typeLabel = GMind.Application.Common.Labels.MarketplaceType(req.RequestType);
        var actorName = await _context.Users.Where(u => u.Id == userId).Select(u => u.DisplayName).FirstAsync(ct);
        _context.ActivityLogs.Add(Log(userId, req.GroupId, req.ProjectId, "MarketplaceRequest", req.Id, "Claim",
            $"{actorName} nhận yêu cầu {typeLabel} cho công việc '{task?.Title}'"));
        try { await _context.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { throw new ConflictException(ClaimConflictMessage); }

        await _notifications.NotifyAsync(req.RequestedByUserId, req.GroupId, NotificationType.MarketplaceClaimed,
            "Yêu cầu đã có người nhận", $"{actorName} đã nhận yêu cầu {typeLabel} cho công việc '{task?.Title}'.",
            "MarketplaceRequest", req.Id, ct);
        await NotifyLeadersExceptPartiesAsync(req,
            $"Yêu cầu {typeLabel} cho công việc '{task?.Title}' đang chờ duyệt.", ct);
        return ToDto(req, task?.Title ?? "", req.RequestedBy.DisplayName, actorName, req.RelatedTask?.Title);
    }

    public async Task<MarketplaceDto> ApproveAsync(Guid leaderId, Guid requestId, string? comment, CancellationToken ct = default)
    {
        var req = await LoadAsync(requestId, ct);
        var membership = await RequireLeaderAsync(leaderId, req.GroupId, ct);
        if (req.Status != MarketplaceRequestStatus.Pending)
            throw new BadRequestException("Yêu cầu này không còn ở trạng thái chờ duyệt.");
        var anotherLeader = await _context.GroupMembers.AnyAsync(m => m.GroupId == req.GroupId
            && m.Role == Role.Leader && m.IsActive && m.UserId != leaderId, ct);
        if (!MarketplaceRules.CanReview(membership.Role, req.Status, req.RequestedByUserId, req.TargetUserId, leaderId, anotherLeader))
            throw new ForbiddenException("Cần Trưởng nhóm khác duyệt yêu cầu này.");
        var selfReview = MarketplaceRules.IsParty(req.RequestedByUserId, req.TargetUserId, leaderId);

        if (!Enum.IsDefined(req.RequestType)) throw new BadRequestException("Loại yêu cầu không hợp lệ.");
        var task = req.Task ?? throw new ConflictException("Công việc của yêu cầu không còn tồn tại.");
        if (task.Project.GroupId != req.GroupId || task.ProjectId != req.ProjectId || task.Project.ArchivedAt != null)
            throw new ConflictException("Công việc của yêu cầu không còn tồn tại trong nhóm này.");
        if (task.Status == TaskStatus.Completed || task.AssigneeUserId != req.RequestedByUserId)
            throw new ConflictException(ChangedMessage);
        await RequireMemberAsync(req.RequestedByUserId, req.GroupId, ct);
        if (req.TargetUserId == null)
            throw new BadRequestException("Yêu cầu này chưa có người nhận.");
        if (req.TargetUserId == req.RequestedByUserId) throw new BadRequestException("Bạn không thể chọn chính mình.");
        await RequireMemberAsync(req.TargetUserId.Value, req.GroupId, ct);

        TaskEntity? other = null;
        if (req.RequestType == MarketplaceRequestType.Swap) {
            other = await _context.Tasks.Include(t => t.Project)
                .FirstOrDefaultAsync(t => t.Id == req.RelatedTaskId && t.Project.GroupId == req.GroupId && t.Project.ArchivedAt == null, ct)
                ?? throw new ConflictException("Công việc liên quan không còn tồn tại trong nhóm này.");
            if (other.Id == task.Id || other.AssigneeUserId != req.TargetUserId || other.Status == TaskStatus.Completed)
                throw new ConflictException(ChangedMessage);
        }

        var now = DateTime.UtcNow;
        var suffix = selfReview ? " (tự duyệt)" : "";
        var typeLabel = GMind.Application.Common.Labels.MarketplaceType(req.RequestType);
        var requesterName = req.RequestedBy.DisplayName;
        var targetName = req.TargetUser?.DisplayName
            ?? await _context.Users.Where(u => u.Id == req.TargetUserId).Select(u => u.DisplayName).FirstAsync(ct);
        var taskIds = new List<Guid> { task.Id };

        switch (req.RequestType)
        {
            case MarketplaceRequestType.Transfer:
                // If the new assignee was a helper, their help ends now.
                var helperRow = await _context.TaskHelpers
                    .FirstOrDefaultAsync(h => h.TaskId == task.Id && h.HelperUserId == req.TargetUserId && h.EndedAt == null, ct);
                if (helperRow != null) { helperRow.EndedAt = now; helperRow.EndedByUserId = leaderId; }
                task.AssigneeUserId = req.TargetUserId;
                task.UpdatedAt = now;
                _context.ActivityLogs.Add(Log(leaderId, req.GroupId, req.ProjectId, "Task", task.Id, "Transfer",
                    $"Chuyển giao công việc '{task.Title}' từ {requesterName} sang {targetName}{suffix}"));
                break;

            case MarketplaceRequestType.Swap:
                (task.AssigneeUserId, other!.AssigneeUserId) = (other.AssigneeUserId, task.AssigneeUserId);
                task.UpdatedAt = other.UpdatedAt = now;
                taskIds.Add(other.Id);
                _context.ActivityLogs.Add(Log(leaderId, req.GroupId, req.ProjectId, "Task", task.Id, "Swap",
                    $"Hoán đổi '{task.Title}' ({requesterName}) ↔ '{other!.Title}' ({targetName}){suffix}"));
                break;

            case MarketplaceRequestType.NeedHelp:
                if (await _context.TaskHelpers.AnyAsync(h => h.TaskId == task.Id && h.HelperUserId == req.TargetUserId && h.EndedAt == null, ct))
                    throw new ConflictException("Thành viên này đang là người hỗ trợ của công việc.");
                _context.TaskHelpers.Add(new TaskHelper
                {
                    Id = Guid.NewGuid(), TaskId = task.Id, HelperUserId = req.TargetUserId!.Value,
                    MarketplaceRequestId = req.Id, Scope = req.HelpScope ?? ""
                });
                _context.ActivityLogs.Add(Log(leaderId, req.GroupId, req.ProjectId, "Task", task.Id, "NeedHelp",
                    $"{targetName} hỗ trợ công việc '{task.Title}': {req.HelpScope}{suffix}"));
                break;
        }

        // An approved request auto-cancels the other active requests on the involved tasks (not for NeedHelp).
        if (req.RequestType != MarketplaceRequestType.NeedHelp)
            await MarketplaceCleanup.CancelActiveAsync(_context, taskIds, req.Id,
                "Tự động hủy vì một yêu cầu khác của công việc đã được duyệt.", ct);

        req.Status = MarketplaceRequestStatus.Approved;
        req.ReviewerUserId = leaderId;
        req.ReviewComment = comment;
        req.ReviewedAt = now;
        try { await _context.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { throw new ConflictException(ConcurrencyMessage); }

        await _notifications.NotifyAsync(req.RequestedByUserId, req.GroupId, NotificationType.MarketplaceRequestApproved,
            "Yêu cầu được duyệt", $"Yêu cầu {typeLabel} cho công việc '{task.Title}' đã được duyệt",
            "MarketplaceRequest", req.Id, ct);
        switch (req.RequestType)
        {
            case MarketplaceRequestType.Transfer:
                await _notifications.NotifyAsync(req.TargetUserId!.Value, req.GroupId, NotificationType.TaskAssigned,
                    "Công việc mới được giao", $"Công việc '{task.Title}' được chuyển giao cho bạn.", "Task", task.Id, ct);
                break;
            case MarketplaceRequestType.Swap:
                await _notifications.NotifyAsync(req.TargetUserId!.Value, req.GroupId, NotificationType.TaskAssigned,
                    "Công việc mới được giao", $"Công việc '{task.Title}' được hoán đổi cho bạn.", "Task", task.Id, ct);
                await _notifications.NotifyAsync(req.RequestedByUserId, req.GroupId, NotificationType.TaskAssigned,
                    "Công việc mới được giao", $"Công việc '{other!.Title}' được hoán đổi cho bạn.", "Task", other.Id, ct);
                break;
            case MarketplaceRequestType.NeedHelp:
                await _notifications.NotifyAsync(req.TargetUserId!.Value, req.GroupId, NotificationType.HelperAdded,
                    "Bạn là người hỗ trợ", $"Bạn được thêm làm người hỗ trợ cho công việc '{task.Title}'.", "Task", task.Id, ct);
                break;
        }

        return ToDto(req, task.Title, req.RequestedBy.DisplayName, req.TargetUser?.DisplayName, req.RelatedTask?.Title);
    }

    public async Task<MarketplaceDto> RejectAsync(Guid leaderId, Guid requestId, string comment, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(comment))
            throw new BadRequestException("Vui lòng nhập lý do từ chối.");
        var req = await LoadAsync(requestId, ct);
        var membership = await RequireLeaderAsync(leaderId, req.GroupId, ct);
        if (!MarketplaceRules.IsActive(req.Status))
            throw new BadRequestException("Yêu cầu này đã kết thúc.");
        var anotherLeader = await _context.GroupMembers.AnyAsync(m => m.GroupId == req.GroupId
            && m.Role == Role.Leader && m.IsActive && m.UserId != leaderId, ct);
        if (!MarketplaceRules.CanReject(membership.Role, req.Status, req.RequestedByUserId, req.TargetUserId, leaderId, anotherLeader))
            throw new ForbiddenException("Cần Trưởng nhóm khác xử lý yêu cầu này.");

        var typeLabel = GMind.Application.Common.Labels.MarketplaceType(req.RequestType);
        req.Status = MarketplaceRequestStatus.Rejected;
        req.ReviewerUserId = leaderId;
        req.ReviewComment = comment.Trim();
        req.ReviewedAt = DateTime.UtcNow;
        _context.ActivityLogs.Add(Log(leaderId, req.GroupId, req.ProjectId, "MarketplaceRequest", req.Id, "Reject",
            $"Từ chối yêu cầu {typeLabel} cho công việc '{req.Task?.Title}': {req.ReviewComment}"));
        try { await _context.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { throw new ConflictException(ConcurrencyMessage); }

        await _notifications.NotifyAsync(req.RequestedByUserId, req.GroupId, NotificationType.MarketplaceRequestRejected,
            "Yêu cầu bị từ chối", $"Yêu cầu {typeLabel} bị từ chối: {req.ReviewComment}",
            "MarketplaceRequest", req.Id, ct);
        if (req.TargetUserId != null)
            await _notifications.NotifyAsync(req.TargetUserId.Value, req.GroupId, NotificationType.MarketplaceRequestRejected,
                "Yêu cầu bị từ chối", $"Yêu cầu {typeLabel} bị từ chối: {req.ReviewComment}",
                "MarketplaceRequest", req.Id, ct);

        return ToDto(req, req.Task?.Title ?? "", req.RequestedBy.DisplayName, req.TargetUser?.DisplayName, req.RelatedTask?.Title);
    }

    public async Task CancelAsync(Guid userId, Guid requestId, CancellationToken ct = default)
    {
        var req = await LoadAsync(requestId, ct);
        await RequireMemberAsync(userId, req.GroupId, ct);
        if (req.RequestedByUserId != userId) throw new ForbiddenException("Chỉ người tạo yêu cầu mới có thể hủy.");
        if (!MarketplaceRules.IsActive(req.Status))
            throw new BadRequestException("Yêu cầu này đã kết thúc.");
        var wasAwaitingOrPending = req.Status is MarketplaceRequestStatus.AwaitingRecipient or MarketplaceRequestStatus.Pending;
        var targetId = req.TargetUserId;
        req.Status = MarketplaceRequestStatus.Cancelled;
        req.ReviewedAt = DateTime.UtcNow;
        var userName = await _context.Users.Where(u => u.Id == userId).Select(u => u.DisplayName).FirstAsync(ct);
        var typeLabel = GMind.Application.Common.Labels.MarketplaceType(req.RequestType);
        _context.ActivityLogs.Add(Log(userId, req.GroupId, req.ProjectId, "MarketplaceRequest", req.Id, "Cancel",
            $"{userName} đã hủy yêu cầu {typeLabel}"));
        try { await _context.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { throw new ConflictException(ConcurrencyMessage); }

        if (wasAwaitingOrPending && targetId != null)
            await _notifications.NotifyAsync(targetId.Value, req.GroupId, NotificationType.TaskUpdated,
                "Yêu cầu đã bị hủy", $"Yêu cầu {typeLabel} cho công việc '{req.Task?.Title}' đã bị {userName} hủy.",
                "MarketplaceRequest", req.Id, ct);
    }

    private async Task NotifyLeadersExceptPartiesAsync(MarketplaceRequest req, string body, CancellationToken ct)
    {
        var leaders = await _context.GroupMembers
            .Where(m => m.GroupId == req.GroupId && m.Role == Role.Leader && m.IsActive
                && m.UserId != req.RequestedByUserId && m.UserId != req.TargetUserId)
            .Select(m => m.UserId).ToListAsync(ct);
        foreach (var leaderId in leaders)
            await _notifications.NotifyAsync(leaderId, req.GroupId, NotificationType.MarketplaceRequestCreated,
                "Yêu cầu chờ duyệt", body, "MarketplaceRequest", req.Id, ct);
    }

    private async Task<Dictionary<Guid, int>> WorkloadsAsync(Guid groupId, bool viewerIsLeader,
        IEnumerable<Guid> userIds, CancellationToken ct)
    {
        if (!viewerIsLeader) return [];
        var ids = userIds.Distinct().ToList();
        if (ids.Count == 0) return [];
        return await _context.Tasks
            .Where(t => t.Project.GroupId == groupId && t.Project.ArchivedAt == null && t.ParentTaskId == null
                && t.Status != TaskStatus.Completed && t.AssigneeUserId != null && ids.Contains(t.AssigneeUserId.Value))
            .GroupBy(t => t.AssigneeUserId!.Value)
            .Select(g => new { UserId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.UserId, x => x.Count, ct);
    }

    /// <summary>Tasks in the listed requests where the viewer is an active helper (they can't claim a NeedHelp again).</summary>
    private async Task<HashSet<Guid>> HelperTaskIdsAsync(Guid userId, List<Row> rows, CancellationToken ct)
    {
        var taskIds = rows.Where(r => r.TaskId != null).Select(r => r.TaskId!.Value).Distinct().ToList();
        if (taskIds.Count == 0) return [];
        return (await _context.TaskHelpers
            .Where(h => h.HelperUserId == userId && h.EndedAt == null && taskIds.Contains(h.TaskId))
            .Select(h => h.TaskId).ToListAsync(ct)).ToHashSet();
    }

    private async Task<MarketplaceRequest> LoadAsync(Guid requestId, CancellationToken ct)
        => await _context.MarketplaceRequests
            .Include(r => r.Task).ThenInclude(t => t!.Project).Include(r => r.RequestedBy).Include(r => r.TargetUser)
            .Include(r => r.RelatedTask).Include(r => r.Group).Include(r => r.Project).Include(r => r.Reviewer)
            .FirstOrDefaultAsync(r => r.Id == requestId, ct)
            ?? throw new NotFoundException("Không tìm thấy yêu cầu này.");

    private Task<GroupMember> RequireMemberAsync(Guid userId, Guid groupId, CancellationToken ct)
        => _access.RequireMemberAsync(userId, groupId, ct);

    private Task<GroupMember> RequireLeaderAsync(Guid userId, Guid groupId, CancellationToken ct)
        => _access.RequireLeaderAsync(userId, groupId, ct);

    private record Row(Guid Id, MarketplaceRequestType RequestType, MarketplaceRequestStatus Status,
        Guid GroupId, string GroupName, Guid? ProjectId, string? ProjectName,
        string TaskTitle, Guid? TaskId, DateTime? TaskDeadlineAt,
        Guid RequestedByUserId, string RequestedByName,
        Guid? TargetUserId, string? TargetName,
        Guid? RelatedTaskId, string? RelatedTaskTitle, DateTime? RelatedTaskDeadlineAt,
        string Reason, string? ReviewComment, string? HelpScope, string? RecipientComment,
        DateTime CreatedAt, DateTime? ReviewedAt, DateTime? RespondedAt, DateTime? ClaimedAt,
        string? ReviewerName);

    private static MarketplaceDto ToDto(Row r, Guid userId, Role role, bool anotherLeader,
        Dictionary<Guid, int>? workloads, HashSet<Guid> helperTaskIds)
    {
        var canClaim = MarketplaceRules.CanClaim(r.Status, r.RequestedByUserId, userId)
            && !(r.RequestType == MarketplaceRequestType.NeedHelp && r.TaskId != null && helperTaskIds.Contains(r.TaskId.Value));
        return new MarketplaceDto(r.Id, r.RequestType.ToString(), r.Status.ToString(), r.TaskTitle, r.TaskId ?? Guid.Empty,
            r.RequestedByName, r.TargetName, r.Reason, r.ReviewComment, r.CreatedAt, r.ReviewedAt,
            r.RequestedByUserId, r.TargetUserId, r.RelatedTaskId, r.RelatedTaskTitle,
            MarketplaceRules.CanReview(role, r.Status, r.RequestedByUserId, r.TargetUserId, userId, anotherLeader),
            r.GroupId, r.GroupName, r.ProjectId, r.ProjectName, r.HelpScope, r.RecipientComment,
            r.RespondedAt, r.ClaimedAt, r.TaskDeadlineAt, r.RelatedTaskDeadlineAt, r.ReviewerName,
            workloads != null && workloads.TryGetValue(r.RequestedByUserId, out var wr) ? wr : null,
            workloads != null && r.TargetUserId != null && workloads.TryGetValue(r.TargetUserId.Value, out var wt) ? wt : null,
            MarketplaceRules.CanReject(role, r.Status, r.RequestedByUserId, r.TargetUserId, userId, anotherLeader),
            MarketplaceRules.CanRespond(r.Status, r.TargetUserId, userId),
            canClaim,
            MarketplaceRules.CanCancel(r.Status, r.RequestedByUserId, userId));
    }

    private static MarketplaceDto ToDto(MarketplaceRequest r, string taskTitle, string requesterName, string? targetName, string? relatedTaskTitle = null)
        => new(r.Id, r.RequestType.ToString(), r.Status.ToString(), taskTitle, r.TaskId ?? Guid.Empty,
            requesterName, targetName, r.Reason, r.ReviewComment, r.CreatedAt, r.ReviewedAt,
            r.RequestedByUserId, r.TargetUserId, r.RelatedTaskId, relatedTaskTitle ?? r.RelatedTask?.Title,
            false, r.GroupId, r.Group?.Name, r.ProjectId, r.Project?.Name,
            r.HelpScope, r.RecipientComment, r.RespondedAt, r.ClaimedAt,
            r.Task?.DeadlineAt, r.RelatedTask?.DeadlineAt, r.Reviewer?.DisplayName);

    private static ActivityLog Log(Guid actor, Guid groupId, Guid? projectId, string entityType, Guid? entityId, string action, string summary)
        => new() { Id = Guid.NewGuid(), ActorUserId = actor, GroupId = groupId, ProjectId = projectId, EntityType = entityType, EntityId = entityId, Action = action, Summary = summary };
}
