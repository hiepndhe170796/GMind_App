using System.Security.Cryptography;
using System.Text;
using GMind.Application.Common;
using GMind.Application.Common.Exceptions;
using GMind.Application.DTOs;
using GMind.Application.Services.Marketplace;
using GMind.Application.Services.Tasks;
using GMind.Domain.Entities;
using GMind.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Task = System.Threading.Tasks.Task;

namespace GMind.Application.Services.Groups;

public interface IGroupService
{
    Task<GroupDto> CreateGroupAsync(Guid userId, string name, string? description, CancellationToken ct = default);
    Task<List<GroupDto>> GetMyGroupsAsync(Guid userId, CancellationToken ct = default);
    Task<GroupDetailDto> GetGroupAsync(Guid userId, Guid groupId, CancellationToken ct = default);
    Task<GroupDto> UpdateGroupAsync(Guid userId, Guid groupId, string name, string? description, CancellationToken ct = default);
    Task<InviteDto> CreateInviteAsync(Guid userId, Guid groupId, string? label, DateTime? expiresAt, int? maxUses, CancellationToken ct = default);
    Task<List<InviteListItemDto>> ListInvitesAsync(Guid userId, Guid groupId, CancellationToken ct = default);
    Task RevokeInviteAsync(Guid userId, Guid inviteId, CancellationToken ct = default);
    Task ArchiveGroupAsync(Guid userId, Guid groupId, string confirmName, CancellationToken ct = default);
    Task RestoreGroupAsync(Guid userId, Guid groupId, CancellationToken ct = default);
    Task<List<ArchivedGroupDto>> ListArchivedGroupsAsync(Guid userId, CancellationToken ct = default);
    Task<ActivityPageDto> GetActivityLogAsync(Guid userId, Guid groupId, Guid? actorId, Guid? projectId,
        string? category, string? from, string? to, string? cursor, int take, CancellationToken ct = default);
    Task<ActivityLogFiltersDto> GetActivityLogFiltersAsync(Guid userId, Guid groupId, CancellationToken ct = default);
    Task<GroupDto> JoinByCodeAsync(Guid userId, string code, CancellationToken ct = default);
    Task<List<MemberDto>> GetMembersAsync(Guid userId, Guid groupId, CancellationToken ct = default);
    Task RemoveMemberAsync(Guid userId, Guid groupId, Guid memberUserId, CancellationToken ct = default);
    Task ChangeMemberRoleAsync(Guid userId, Guid groupId, Guid memberUserId, Role newRole, CancellationToken ct = default);
    Task LeaveGroupAsync(Guid userId, Guid groupId, CancellationToken ct = default);
    Task<List<ActivityDto>> GetActivityAsync(Guid userId, Guid groupId, int take, CancellationToken ct = default);
    Task<GroupSettingsDto> GetSettingsAsync(Guid userId, Guid groupId, CancellationToken ct = default);
    Task<GroupSettingsDto> UpdateSettingsAsync(Guid userId, Guid groupId, int riskHours, int riskPercent, int staleHours, CancellationToken ct = default);
    Task<MemberOverviewDto> GetMemberOverviewAsync(Guid userId, Guid groupId, Guid memberUserId, CancellationToken ct = default);
}

public record GroupDto(Guid Id, string Name, string? Description, int MemberCount, string MyRole, DateTime CreatedAt);
public record GroupDetailDto(Guid Id, string Name, string? Description, int MemberCount, string MyRole, DateTime CreatedAt, List<MemberDto> Members);
public record MemberDto(Guid UserId, string DisplayName, string? AvatarUrl, string Role, DateTime JoinedAt, int? OpenTaskCount);
public record InviteDto(Guid Id, string Code, string InviteLink, DateTime? ExpiresAt, int? MaxUses, int UsedCount,
    string? Label = null, DateTime? CreatedAt = null);
public record InviteListItemDto(Guid Id, string? Label, DateTime CreatedAt, string CreatedByName,
    DateTime? ExpiresAt, int? MaxUses, int UsedCount, DateTime? RevokedAt, string Status);
public record ArchivedGroupDto(Guid Id, string Name, string? Description, DateTime? ArchivedAt,
    string? ArchivedByName, string MyRole, int MemberCount, int ProjectCount, bool CanRestore);
public record ActivityItemDto(Guid Id, Guid ActorUserId, string ActorName, string Action, string EntityType,
    Guid? EntityId, string? Category, string Summary, DateTime CreatedAt, Guid? ProjectId, string? ProjectName, Guid? TaskId);
public record ActivityPageDto(List<ActivityItemDto> Items, string? NextCursor);
public record ActivityLogActorDto(Guid UserId, string DisplayName, bool IsActive);
public record ActivityLogProjectDto(Guid Id, string Name, bool IsArchived);
public record ActivityLogFiltersDto(List<ActivityLogActorDto> Actors, List<ActivityLogProjectDto> Projects);
public record ActivityDto(Guid Id, string ActorName, string Action, string EntityType, string Summary, DateTime CreatedAt, Guid? ProjectId);
public record GroupSettingsDto(int RiskHoursBeforeDeadline, int RiskProgressBelowPercent, int StaleAfterHours,
    DateTime? UpdatedAt, string? UpdatedByName, bool IsDefault);
public record MemberOverviewMemberDto(Guid UserId, string DisplayName, string? AvatarUrl, string Role, DateTime JoinedAt, bool IsActive);
public record MemberOverviewSummaryDto(int Total, int ToDo, int InProgress, int Submitted, int ChangesRequested,
    int Completed, int Overdue, int AtRisk, int Stale, int CompletionPercent);
public record MemberProjectPointsDto(Guid ProjectId, string ProjectName, int MemberPoints, int ProjectCreditedPoints, double Percent);
public record MemberOverviewPointsDto(int Total, List<MemberProjectPointsDto> Projects);
public record MemberOverviewTaskDto(Guid Id, Guid ProjectId, string ProjectName, string Title, string Status, string Priority,
    DateTime? DeadlineAt, Guid? ParentTaskId, string? ParentTitle, int? ProgressPercent, DateTime? UpdatedAt,
    DateTime? CompletedAt, bool IsOverdue, bool IsAtRisk, bool IsStale, TaskPermissionsDto? Permissions);
public record MemberOverviewDto(MemberOverviewMemberDto Member, MemberOverviewSummaryDto Summary,
    MemberOverviewPointsDto Points, List<MemberOverviewTaskDto> Tasks, List<ActivityDto> Activity);

public class GroupService : IGroupService
{
    private readonly IApplicationDbContext _context;
    private readonly IResourceAccess _access;
    private readonly Notifications.INotificationService _notifications;

    public GroupService(IApplicationDbContext context, IResourceAccess access, Notifications.INotificationService notifications)
    {
        _context = context;
        _access = access;
        _notifications = notifications;
    }

    public async Task<GroupDto> CreateGroupAsync(Guid userId, string name, string? description, CancellationToken ct = default)
    {
        var group = new Group
        {
            Id = Guid.NewGuid(),
            Name = name.Trim(),
            Description = description,
            CreatedByUserId = userId
        };
        var membership = new GroupMember
        {
            Id = Guid.NewGuid(),
            GroupId = group.Id,
            UserId = userId,
            Role = Role.Leader
        };

        _context.Groups.Add(group);
        _context.GroupMembers.Add(membership);
        _context.ActivityLogs.Add(Log(userId, group.Id, null, "Group", group.Id, "Create", $"Tạo nhóm '{group.Name}'"));
        await _context.SaveChangesAsync(ct);

        return new GroupDto(group.Id, group.Name, group.Description, 1, "Leader", group.CreatedAt);
    }

    public async Task<List<GroupDto>> GetMyGroupsAsync(Guid userId, CancellationToken ct = default)
    {
        return await _context.GroupMembers
            .Where(m => m.UserId == userId && m.IsActive && m.User.IsActive && !m.Group.IsArchived)
            .Select(m => new GroupDto(
                m.GroupId, m.Group.Name, m.Group.Description,
                m.Group.Members.Count(x => x.IsActive),
                m.Role.ToString(), m.Group.CreatedAt))
            .ToListAsync(ct);
    }

    public async Task<GroupDetailDto> GetGroupAsync(Guid userId, Guid groupId, CancellationToken ct = default)
    {
        var membership = await RequireMembershipAsync(userId, groupId, ct);
        var group = membership.Group;
        var isLeader = membership.Role == Role.Leader;
        var openTasks = await _context.Tasks
            .Where(t => t.Project.GroupId == groupId && t.Project.ArchivedAt == null
                && t.AssigneeUserId != null && t.Status != Domain.Enums.TaskStatus.Completed)
            .Select(t => t.AssigneeUserId!.Value)
            .ToListAsync(ct);
        var openCounts = openTasks.GroupBy(id => id).ToDictionary(g => g.Key, g => g.Count());
        var rows = await _context.GroupMembers
            .Where(m => m.GroupId == groupId && m.IsActive)
            .Select(m => new { m.UserId, m.User.DisplayName, m.User.AvatarUrl, m.Role, m.JoinedAt })
            .ToListAsync(ct);
        var members = rows.Select(m => new MemberDto(m.UserId, m.DisplayName, m.AvatarUrl, m.Role.ToString(), m.JoinedAt,
                isLeader || m.UserId == userId ? (openCounts.ContainsKey(m.UserId) ? openCounts[m.UserId] : 0) : null))
            .ToList();

        return new GroupDetailDto(group.Id, group.Name, group.Description, members.Count, membership.Role.ToString(), group.CreatedAt, members);
    }

    public async Task<GroupDto> UpdateGroupAsync(Guid userId, Guid groupId, string name, string? description, CancellationToken ct = default)
    {
        await RequireLeaderAsync(userId, groupId, ct);
        var group = await _context.Groups.FirstAsync(g => g.Id == groupId, ct);
        var before = group.Name;
        group.Name = name.Trim();
        group.Description = description;
        _context.ActivityLogs.Add(Log(userId, groupId, null, "Group", groupId, "Update", $"Cập nhật nhóm '{group.Name}'"));
        await _context.SaveChangesAsync(ct);
        var count = await _context.GroupMembers.CountAsync(m => m.GroupId == groupId && m.IsActive, ct);
        return new GroupDto(group.Id, group.Name, group.Description, count, "Leader", group.CreatedAt);
    }

    public async Task<InviteDto> CreateInviteAsync(Guid userId, Guid groupId, string? label, DateTime? expiresAt, int? maxUses, CancellationToken ct = default)
    {
        await RequireLeaderAsync(userId, groupId, ct);
        var now = DateTime.UtcNow;
        if (expiresAt != null && (expiresAt.Value < now.AddHours(1) || expiresAt.Value > now.AddDays(90)))
            throw new BadRequestException("Hạn dùng phải từ 1 giờ đến 90 ngày kể từ bây giờ.");
        if (maxUses != null && (maxUses < 1 || maxUses > 500))
            throw new BadRequestException("Số lượt dùng phải từ 1 đến 500.");
        var trimmedLabel = string.IsNullOrWhiteSpace(label) ? null : label.Trim();
        if (trimmedLabel != null && trimmedLabel.Length > 100)
            throw new BadRequestException("Nhãn mã mời tối đa 100 ký tự.");
        var code = GenerateCode();
        var invite = new GroupInvite
        {
            Id = Guid.NewGuid(),
            GroupId = groupId,
            Code = null, // plaintext codes are never persisted for new invites
            TokenHash = HashToken(code),
            Label = trimmedLabel,
            CreatedByUserId = userId,
            ExpiresAt = expiresAt,
            MaxUses = maxUses
        };
        _context.GroupInvites.Add(invite);
        _context.ActivityLogs.Add(Log(userId, groupId, null, "GroupInvite", invite.Id, "Create",
            $"Tạo mã mời{(trimmedLabel != null ? $" {trimmedLabel}" : "")}"));
        await _context.SaveChangesAsync(ct);
        return new InviteDto(invite.Id, code, $"/join/{code}", expiresAt, maxUses, 0, trimmedLabel, invite.CreatedAt);
    }

    public async Task<List<InviteListItemDto>> ListInvitesAsync(Guid userId, Guid groupId, CancellationToken ct = default)
    {
        await RequireLeaderAsync(userId, groupId, ct);
        var now = DateTime.UtcNow;
        var rows = await _context.GroupInvites
            .Where(i => i.GroupId == groupId)
            .Select(i => new { i.Id, i.Label, i.CreatedAt, CreatedBy = i.CreatedBy.DisplayName,
                i.ExpiresAt, i.MaxUses, i.UsedCount, i.RevokedAt })
            .ToListAsync(ct);
        return rows
            .Select(i => new { i, Status = InviteStatus(i.RevokedAt, i.ExpiresAt, i.MaxUses, i.UsedCount, now) })
            .OrderBy(x => x.Status == "Active" ? 0 : 1)
            .ThenByDescending(x => x.i.CreatedAt)
            .Take(100)
            .Select(x => new InviteListItemDto(x.i.Id, x.i.Label, x.i.CreatedAt, x.i.CreatedBy,
                x.i.ExpiresAt, x.i.MaxUses, x.i.UsedCount, x.i.RevokedAt, x.Status))
            .ToList();
    }

    public async Task RevokeInviteAsync(Guid userId, Guid inviteId, CancellationToken ct = default)
    {
        var invite = await _context.GroupInvites.FirstOrDefaultAsync(i => i.Id == inviteId, ct)
            ?? throw new NotFoundException("Không tìm thấy mã mời này.");
        await RequireLeaderAsync(userId, invite.GroupId, ct);
        if (invite.RevokedAt != null)
            throw new BadRequestException("Mã mời này đã bị thu hồi.");
        invite.RevokedAt = DateTime.UtcNow;
        _context.ActivityLogs.Add(Log(userId, invite.GroupId, null, "GroupInvite", invite.Id, "Revoke",
            $"Thu hồi mã mời{(invite.Label != null ? $" {invite.Label}" : "")}"));
        await _context.SaveChangesAsync(ct);
    }

    public async Task<GroupDto> JoinByCodeAsync(Guid userId, string code, CancellationToken ct = default)
    {
        var hash = HashToken(code.Trim().ToUpperInvariant());
        var invite = await _context.GroupInvites
            .Include(i => i.Group)
            .FirstOrDefaultAsync(i => i.TokenHash == hash, ct)
            ?? throw new NotFoundException("Mã mời không hợp lệ.");

        if (invite.RevokedAt != null || (invite.ExpiresAt != null && invite.ExpiresAt < DateTime.UtcNow)
            || (invite.MaxUses != null && invite.UsedCount >= invite.MaxUses))
            throw new BadRequestException("Mã mời đã hết hạn, bị thu hồi hoặc hết lượt sử dụng.");
        if (invite.Group.IsArchived) throw new BadRequestException("Nhóm này đã được lưu trữ.");

        var existing = await _context.GroupMembers
            .FirstOrDefaultAsync(m => m.GroupId == invite.GroupId && m.UserId == userId, ct);
        if (existing is { IsActive: true })
            throw new ConflictException("Bạn đã là thành viên của nhóm này.");
        if (existing != null)
        {
            // Reactivate the former membership rather than inserting a duplicate.
            existing.IsActive = true;
            existing.Role = Role.Member;
            existing.JoinedAt = DateTime.UtcNow;
        }
        else
        {
            _context.GroupMembers.Add(new GroupMember
            {
                Id = Guid.NewGuid(), GroupId = invite.GroupId, UserId = userId, Role = Role.Member
            });
        }
        var joinedName = await _context.Users.Where(u => u.Id == userId).Select(u => u.DisplayName).FirstAsync(ct);
        invite.UsedCount++;
        _context.ActivityLogs.Add(Log(userId, invite.GroupId, null, "GroupMember", userId, "Join", $"Tham gia nhóm '{invite.Group.Name}'"));
        await _context.SaveChangesAsync(ct);

        var leaders = await _context.GroupMembers
            .Where(m => m.GroupId == invite.GroupId && m.Role == Role.Leader && m.IsActive)
            .Select(m => m.UserId).ToListAsync(ct);
        foreach (var leaderId in leaders)
            await _notifications.NotifyAsync(leaderId, invite.GroupId, NotificationType.MemberJoined,
                "Thành viên mới", $"{joinedName} đã tham gia nhóm '{invite.Group.Name}'", "Group", invite.GroupId, ct);

        var count = await _context.GroupMembers.CountAsync(m => m.GroupId == invite.GroupId && m.IsActive, ct);
        return new GroupDto(invite.GroupId, invite.Group.Name, invite.Group.Description, count, "Member", invite.Group.CreatedAt);
    }

    public async Task<List<MemberDto>> GetMembersAsync(Guid userId, Guid groupId, CancellationToken ct = default)
    {
        var membership = await RequireMembershipAsync(userId, groupId, ct);
        var isLeader = membership.Role == Role.Leader;
        var openTasks = await _context.Tasks
            .Where(t => t.Project.GroupId == groupId && t.Project.ArchivedAt == null
                && t.AssigneeUserId != null && t.Status != Domain.Enums.TaskStatus.Completed)
            .Select(t => t.AssigneeUserId!.Value)
            .ToListAsync(ct);
        var openCounts = openTasks.GroupBy(id => id).ToDictionary(g => g.Key, g => g.Count());
        var rows = await _context.GroupMembers
            .Where(m => m.GroupId == groupId && m.IsActive)
            .Select(m => new { m.UserId, m.User.DisplayName, m.User.AvatarUrl, m.Role, m.JoinedAt })
            .ToListAsync(ct);
        return rows.Select(m => new MemberDto(m.UserId, m.DisplayName, m.AvatarUrl, m.Role.ToString(), m.JoinedAt,
                isLeader || m.UserId == userId ? (openCounts.ContainsKey(m.UserId) ? openCounts[m.UserId] : 0) : null))
            .ToList();
    }

    public async Task RemoveMemberAsync(Guid userId, Guid groupId, Guid memberUserId, CancellationToken ct = default)
    {
        await RequireLeaderAsync(userId, groupId, ct);
        var target = await _context.GroupMembers.Include(m => m.Group)
            .FirstOrDefaultAsync(m => m.GroupId == groupId && m.UserId == memberUserId && m.IsActive, ct)
            ?? throw new NotFoundException("Không tìm thấy thành viên này trong nhóm.");
        if (target.Role == Role.Leader)
        {
            var leaderCount = await _context.GroupMembers.CountAsync(m => m.GroupId == groupId && m.Role == Role.Leader && m.IsActive, ct);
            if (leaderCount <= 1) throw new BadRequestException("Không thể xóa Trưởng nhóm duy nhất của nhóm.");
        }
        target.IsActive = false;
        var memberName = await _context.Users.Where(u => u.Id == memberUserId).Select(u => u.DisplayName).FirstAsync(ct);
        var count = await DeactivateMemberAsync(target, groupId, userId, ct);
        _context.ActivityLogs.Add(Log(userId, groupId, null, "GroupMember", memberUserId, "Remove",
            $"Xóa {memberName} khỏi nhóm{(count > 0 ? $"; {count} công việc chuyển về Chưa giao" : "")}"));
        await _context.SaveChangesAsync(ct);

        await _notifications.NotifyAsync(memberUserId, groupId, NotificationType.MemberRemoved,
            "Bạn đã bị xóa khỏi nhóm", $"Bạn không còn là thành viên của nhóm '{target.Group.Name}'", "Group", groupId, ct);
        await NotifyLeadersAsync(userId, groupId,
            $"{memberName} đã bị xóa khỏi nhóm{(count > 0 ? $"; {count} công việc chuyển về Chưa giao" : "")}", ct);
    }

    private async Task<int> DeactivateMemberAsync(GroupMember member, Guid groupId, Guid actorId, CancellationToken ct)
    {
        var openTasks = await _context.Tasks
            .Where(t => t.AssigneeUserId == member.UserId && t.Status != Domain.Enums.TaskStatus.Completed
                && t.Project.GroupId == groupId && t.Project.ArchivedAt == null)
            .ToListAsync(ct);
        foreach (var t in openTasks) { t.AssigneeUserId = null; t.UpdatedAt = DateTime.UtcNow; }

        var active = await _context.MarketplaceRequests
            .Where(r => r.GroupId == groupId && MarketplaceRules.ActiveStatuses.Contains(r.Status)
                && (r.RequestedByUserId == member.UserId || r.TargetUserId == member.UserId))
            .ToListAsync(ct);
        foreach (var r in active)
        {
            r.Status = MarketplaceRequestStatus.Cancelled;
            r.ReviewedAt = DateTime.UtcNow;
            r.ReviewComment = "Tự động hủy vì thành viên đã rời nhóm";
        }

        // A helper who leaves the group stops helping automatically.
        var helpers = await _context.TaskHelpers
            .Where(h => h.HelperUserId == member.UserId && h.EndedAt == null && h.Task.Project.GroupId == groupId)
            .ToListAsync(ct);
        foreach (var h in helpers) { h.EndedAt = DateTime.UtcNow; h.EndedByUserId = actorId; }

        return openTasks.Count;
    }

    private async Task NotifyLeadersAsync(Guid actorId, Guid groupId, string message, CancellationToken ct)
    {
        var leaders = await _context.GroupMembers
            .Where(m => m.GroupId == groupId && m.Role == Role.Leader && m.IsActive && m.UserId != actorId)
            .Select(m => m.UserId).ToListAsync(ct);
        var groupName = await _context.Groups.Where(g => g.Id == groupId).Select(g => g.Name).FirstAsync(ct);
        foreach (var leaderId in leaders)
            await _notifications.NotifyAsync(leaderId, groupId, NotificationType.MemberRemoved,
                "Thành viên rời nhóm", $"{message} — nhóm '{groupName}'", "Group", groupId, ct);
    }

    public async Task ChangeMemberRoleAsync(Guid userId, Guid groupId, Guid memberUserId, Role newRole, CancellationToken ct = default)
    {
        await RequireLeaderAsync(userId, groupId, ct);
        if (!Enum.IsDefined(newRole)) throw new BadRequestException("Vai trò thành viên không hợp lệ.");
        var target = await _context.GroupMembers.FirstOrDefaultAsync(m => m.GroupId == groupId && m.UserId == memberUserId && m.IsActive, ct)
            ?? throw new NotFoundException("Không tìm thấy thành viên này trong nhóm.");
        if (target.Role == Role.Leader && newRole == Role.Member)
        {
            var leaderCount = await _context.GroupMembers.CountAsync(m => m.GroupId == groupId && m.Role == Role.Leader && m.IsActive, ct);
            if (leaderCount <= 1) throw new BadRequestException("Không thể hạ vai trò Trưởng nhóm duy nhất của nhóm.");
        }
        var before = target.Role;
        target.Role = newRole;
        var memberName = await _context.Users.Where(u => u.Id == memberUserId).Select(u => u.DisplayName).FirstAsync(ct);
        _context.ActivityLogs.Add(Log(userId, groupId, null, "GroupMember", memberUserId, "ChangeRole",
            $"Đổi vai trò của {memberName}: {Labels.Role(before)} → {Labels.Role(newRole)}"));
        await _context.SaveChangesAsync(ct);
    }

    public async Task LeaveGroupAsync(Guid userId, Guid groupId, CancellationToken ct = default)
    {
        var membership = await RequireMembershipAsync(userId, groupId, ct);
        if (membership.Role == Role.Leader)
        {
            var leaderCount = await _context.GroupMembers.CountAsync(m => m.GroupId == groupId && m.Role == Role.Leader && m.IsActive, ct);
            if (leaderCount <= 1) throw new BadRequestException("Bạn là Trưởng nhóm duy nhất. Hãy chỉ định Trưởng nhóm khác trước khi rời nhóm.");
        }
        membership.IsActive = false;
        var memberName = await _context.Users.Where(u => u.Id == userId).Select(u => u.DisplayName).FirstAsync(ct);
        var count = await DeactivateMemberAsync(membership, groupId, userId, ct);
        _context.ActivityLogs.Add(Log(userId, groupId, null, "GroupMember", userId, "Leave",
            $"Rời nhóm{(count > 0 ? $"; {count} công việc chuyển về Chưa giao" : "")}"));
        await _context.SaveChangesAsync(ct);
        await NotifyLeadersAsync(userId, groupId,
            $"{memberName} đã rời nhóm{(count > 0 ? $"; {count} công việc chuyển về Chưa giao" : "")}", ct);
    }

    public async Task<List<ActivityDto>> GetActivityAsync(Guid userId, Guid groupId, int take, CancellationToken ct = default)
    {
        await RequireLeaderAsync(userId, groupId, ct);
        return await _context.ActivityLogs
            .Where(a => a.GroupId == groupId)
            .OrderByDescending(a => a.CreatedAt)
            .Take(Math.Clamp(take, 1, 100))
            .Select(a => new ActivityDto(a.Id, a.Actor.DisplayName, a.Action, a.EntityType, a.Summary, a.CreatedAt, a.ProjectId))
            .ToListAsync(ct);
    }

    public async Task<GroupSettingsDto> GetSettingsAsync(Guid userId, Guid groupId, CancellationToken ct = default)
    {
        await RequireLeaderAsync(userId, groupId, ct);
        var row = await _context.GroupSettings
            .Where(s => s.GroupId == groupId)
            .Select(s => new { s.RiskHoursBeforeDeadline, s.RiskProgressBelowPercent, s.StaleAfterHours, s.UpdatedAt, UpdatedBy = s.UpdatedBy!.DisplayName })
            .FirstOrDefaultAsync(ct);
        return row == null
            ? new GroupSettingsDto(GroupThresholds.Default.RiskHoursBeforeDeadline,
                GroupThresholds.Default.RiskProgressBelowPercent, GroupThresholds.Default.StaleAfterHours, null, null, true)
            : new GroupSettingsDto(row.RiskHoursBeforeDeadline, row.RiskProgressBelowPercent, row.StaleAfterHours, row.UpdatedAt, row.UpdatedBy, false);
    }

    public async Task<GroupSettingsDto> UpdateSettingsAsync(Guid userId, Guid groupId, int riskHours, int riskPercent, int staleHours, CancellationToken ct = default)
    {
        await RequireLeaderAsync(userId, groupId, ct);
        if (riskHours is < 1 or > 168)
            throw new BadRequestException("Số giờ cảnh báo trước hạn phải từ 1 đến 168.");
        if (riskPercent is < 1 or > 100)
            throw new BadRequestException("Ngưỡng phần trăm tiến độ phải từ 1 đến 100.");
        if (staleHours is < 1 or > 720)
            throw new BadRequestException("Số giờ đình trệ phải từ 1 đến 720.");
        var row = await _context.GroupSettings.FirstOrDefaultAsync(s => s.GroupId == groupId, ct);
        if (row == null)
        {
            row = new GroupSettings { GroupId = groupId };
            _context.GroupSettings.Add(row);
        }
        row.RiskHoursBeforeDeadline = riskHours;
        row.RiskProgressBelowPercent = riskPercent;
        row.StaleAfterHours = staleHours;
        row.UpdatedAt = DateTime.UtcNow;
        row.UpdatedByUserId = userId;
        _context.ActivityLogs.Add(Log(userId, groupId, null, "GroupSettings", groupId, "Update",
            $"Cập nhật ngưỡng cảnh báo: còn {riskHours} giờ và dưới {riskPercent}%; đình trệ sau {staleHours} giờ"));
        await _context.SaveChangesAsync(ct);
        return new GroupSettingsDto(riskHours, riskPercent, staleHours, row.UpdatedAt,
            await _context.Users.Where(u => u.Id == userId).Select(u => u.DisplayName).FirstOrDefaultAsync(ct), false);
    }

    public async Task<MemberOverviewDto> GetMemberOverviewAsync(Guid userId, Guid groupId, Guid memberUserId, CancellationToken ct = default)
    {
        var caller = await RequireMembershipAsync(userId, groupId, ct);
        if (caller.Role != Role.Leader && userId != memberUserId)
            throw new ForbiddenException("Chỉ Trưởng nhóm hoặc chính thành viên đó mới xem được tổng quan này.");
        var membership = await _context.GroupMembers.Include(m => m.User)
            .FirstOrDefaultAsync(m => m.GroupId == groupId && m.UserId == memberUserId, ct)
            ?? throw new NotFoundException("Không tìm thấy thành viên này trong nhóm.");

        var now = DateTime.UtcNow;
        var thresholds = await GroupThresholdsLoader.ForGroupsAsync(_context, new[] { groupId }, ct);
        var t = thresholds[groupId];
        var cutoff = now.AddDays(-30);

        // All tasks assigned to the member in this group's active projects (top-level + subtasks, incl. recently completed)
        var tasks = await _context.Tasks
            .Where(x => x.AssigneeUserId == memberUserId && x.Project.GroupId == groupId && x.Project.ArchivedAt == null
                && (x.Status != Domain.Enums.TaskStatus.Completed || x.CompletedAt >= cutoff))
            .Select(x => new
            {
                x.Id, x.ProjectId, ProjectName = x.Project.Name, x.Title, x.Status, x.Priority,
                x.DeadlineAt, x.ParentTaskId,
                ParentTitle = x.ParentTask != null ? x.ParentTask.Title : null,
                x.ProgressPercent, x.UpdatedAt, x.CompletedAt, x.CreatedByUserId, x.AssigneeUserId,
                ParentAssignee = x.ParentTask != null ? x.ParentTask.AssigneeUserId : (Guid?)null,
                ParentStatus = x.ParentTask != null ? (Domain.Enums.TaskStatus?)x.ParentTask.Status : null,
                SubtaskCount = x.Subtasks.Count,
                OpenSubtasks = x.Subtasks.Count(s => s.Status != Domain.Enums.TaskStatus.Completed)
            })
            .ToListAsync(ct);

        var anotherLeader = caller.Role == Role.Leader
            && await _context.GroupMembers.AnyAsync(m => m.GroupId == groupId && m.Role == Role.Leader && m.IsActive && m.UserId != userId, ct);

        // A Leader's once-per-hour nudge keys (M3) — so the UI can show "Đã nhắc" after reload.
        var nudgeSuffix = $":{now:yyyyMMddHH}";
        var taskIds = tasks.Select(x => x.Id).ToList();
        var reminded = caller.Role == Role.Leader
            ? (await _context.ReminderDeliveries
                .Where(r => taskIds.Contains(r.TaskId) && r.DeduplicationKey.StartsWith("nudge:")
                    && r.DeduplicationKey.EndsWith(nudgeSuffix))
                .Select(r => r.TaskId).ToListAsync(ct)).ToHashSet()
            : new HashSet<Guid>();

        var taskDtos = tasks.Select(x =>
        {
            var flags = TaskRisk.Evaluate(x.Status, x.ParentTaskId, x.AssigneeUserId, x.DeadlineAt,
                x.ProgressPercent, x.UpdatedAt, t, now);
            var ctx = new TaskRuleContext(caller.Role, userId, x.AssigneeUserId, x.CreatedByUserId,
                x.ParentTaskId, x.ParentAssignee, x.Status, x.ParentStatus, x.SubtaskCount, x.OpenSubtasks, anotherLeader);
            return new MemberOverviewTaskDto(x.Id, x.ProjectId, x.ProjectName, x.Title, x.Status.ToString(), x.Priority.ToString(),
                x.DeadlineAt, x.ParentTaskId, x.ParentTitle, x.ParentTaskId == null ? x.ProgressPercent : null,
                x.UpdatedAt, x.CompletedAt, flags.IsOverdue, flags.IsAtRisk, flags.IsStale,
                TaskRules.Permissions(ctx, reminded.Contains(x.Id)));
        }).OrderBy(x => x.DeadlineAt ?? DateTime.MaxValue).ToList();

        var top = taskDtos.Where(x => x.ParentTaskId == null).ToList();
        var total = top.Count;
        var done = top.Count(x => x.Status == nameof(Domain.Enums.TaskStatus.Completed));
        var summary = new MemberOverviewSummaryDto(total,
            top.Count(x => x.Status == nameof(Domain.Enums.TaskStatus.ToDo)),
            top.Count(x => x.Status == nameof(Domain.Enums.TaskStatus.InProgress)),
            top.Count(x => x.Status == nameof(Domain.Enums.TaskStatus.Submitted)),
            top.Count(x => x.Status == nameof(Domain.Enums.TaskStatus.ChangesRequested)),
            done,
            top.Count(x => x.IsOverdue), top.Count(x => x.IsAtRisk), top.Count(x => x.IsStale),
            total == 0 ? 0 : (int)Math.Round(done * 100.0 / total));

        // Contribution points per project (only Leader or the member themself sees this — already enforced)
        var credits = await _context.ContributionCredits
            .Where(c => c.GroupId == groupId)
            .GroupBy(c => new { c.ProjectId, c.UserId })
            .Select(g => new { g.Key.ProjectId, g.Key.UserId, Points = g.Sum(c => c.Points) })
            .ToListAsync(ct);
        var projectTotals = credits.GroupBy(c => c.ProjectId)
            .ToDictionary(g => g.Key, g => g.Sum(c => c.Points));
        var memberProjectPoints = credits.Where(c => c.UserId == memberUserId)
            .GroupBy(c => c.ProjectId).ToDictionary(g => g.Key, g => g.Sum(c => c.Points));
        var projectIds = memberProjectPoints.Keys.ToList();
        var projectNames = await _context.Projects.Where(p => projectIds.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, p => p.Name, ct);
        var projectPoints = memberProjectPoints.Select(kv =>
        {
            var pTotal = projectTotals.GetValueOrDefault(kv.Key, 0);
            return new MemberProjectPointsDto(kv.Key, projectNames.GetValueOrDefault(kv.Key, "Dự án"),
                kv.Value, pTotal, pTotal == 0 ? 0 : Math.Round(kv.Value * 100.0 / pTotal, 1));
        }).OrderByDescending(p => p.MemberPoints).ToList();
        var points = new MemberOverviewPointsDto(memberProjectPoints.Values.Sum(), projectPoints);

        var activity = await _context.ActivityLogs
            .Where(a => a.GroupId == groupId && a.ActorUserId == memberUserId)
            .OrderByDescending(a => a.CreatedAt).Take(20)
            .Select(a => new ActivityDto(a.Id, a.Actor.DisplayName, a.Action, a.EntityType, a.Summary, a.CreatedAt, a.ProjectId))
            .ToListAsync(ct);

        return new MemberOverviewDto(
            new MemberOverviewMemberDto(membership.UserId, membership.User.DisplayName, membership.User.AvatarUrl,
                membership.Role.ToString(), membership.JoinedAt, membership.IsActive),
            summary, points, taskDtos, activity);
    }

    public async Task ArchiveGroupAsync(Guid userId, Guid groupId, string confirmName, CancellationToken ct = default)
    {
        var membership = await RequireLeaderAsync(userId, groupId, ct);
        var group = membership.Group;
        if (!string.Equals(confirmName?.Trim(), group.Name, StringComparison.Ordinal))
            throw new BadRequestException("Tên nhóm xác nhận không khớp.");
        var now = DateTime.UtcNow;
        group.IsArchived = true;
        group.ArchivedAt = now;
        group.ArchivedByUserId = userId;
        await MarketplaceCleanup.CancelActiveForGroupAsync(_context, groupId,
            "Tự động hủy vì nhóm đã được lưu trữ.", ct);
        _context.ActivityLogs.Add(Log(userId, groupId, null, "Group", groupId, "Archive", $"Lưu trữ nhóm '{group.Name}'"));
        await _context.SaveChangesAsync(ct);

        var actorName = await _context.Users.Where(u => u.Id == userId).Select(u => u.DisplayName).FirstAsync(ct);
        var members = await _context.GroupMembers
            .Where(m => m.GroupId == groupId && m.IsActive && m.UserId != userId)
            .Select(m => m.UserId).ToListAsync(ct);
        foreach (var memberId in members)
            await _notifications.NotifyAsync(memberId, groupId, NotificationType.GroupArchived,
                "Nhóm đã lưu trữ", $"Nhóm '{group.Name}' đã được {actorName} lưu trữ.", "Group", groupId, ct);
    }

    public async Task RestoreGroupAsync(Guid userId, Guid groupId, CancellationToken ct = default)
    {
        var group = await _context.Groups.FirstOrDefaultAsync(g => g.Id == groupId, ct)
            ?? throw new NotFoundException("Không tìm thấy nhóm này.");
        // Archived groups fail the normal member filter — check the membership row directly.
        var membership = await _context.GroupMembers
            .FirstOrDefaultAsync(m => m.GroupId == groupId && m.UserId == userId && m.IsActive && m.User.IsActive, ct);
        if (membership == null || membership.Role != Role.Leader)
            throw new ForbiddenException("Bạn cần quyền Trưởng nhóm để thực hiện thao tác này.");
        if (!group.IsArchived)
            throw new BadRequestException("Nhóm chưa được lưu trữ.");
        group.IsArchived = false;
        group.ArchivedAt = null;
        group.ArchivedByUserId = null;
        _context.ActivityLogs.Add(Log(userId, groupId, null, "Group", groupId, "Restore", $"Khôi phục nhóm '{group.Name}'"));
        await _context.SaveChangesAsync(ct);

        var actorName = await _context.Users.Where(u => u.Id == userId).Select(u => u.DisplayName).FirstAsync(ct);
        var members = await _context.GroupMembers
            .Where(m => m.GroupId == groupId && m.IsActive && m.UserId != userId)
            .Select(m => m.UserId).ToListAsync(ct);
        foreach (var memberId in members)
            await _notifications.NotifyAsync(memberId, groupId, NotificationType.GroupRestored,
                "Nhóm đã khôi phục", $"Nhóm '{group.Name}' đã được {actorName} khôi phục.", "Group", groupId, ct);
    }

    public async Task<List<ArchivedGroupDto>> ListArchivedGroupsAsync(Guid userId, CancellationToken ct = default)
        => await _context.GroupMembers
            .Where(m => m.UserId == userId && m.IsActive && m.User.IsActive && m.Group.IsArchived)
            .OrderByDescending(m => m.Group.ArchivedAt)
            .Select(m => new ArchivedGroupDto(m.GroupId, m.Group.Name, m.Group.Description, m.Group.ArchivedAt,
                m.Group.ArchivedBy != null ? m.Group.ArchivedBy.DisplayName : null, m.Role.ToString(),
                m.Group.Members.Count(x => x.IsActive), m.Group.Projects.Count,
                m.Role == Role.Leader))
            .ToListAsync(ct);

    private static readonly HashSet<string> ActivityCategories = ["task", "status", "member", "project", "marketplace", "group"];

    /// <summary>Same category mapping used for the filter and for the per-row Category field.</summary>
    private static string? ActivityCategory(string entityType, string action) => entityType switch
    {
        "Task" => action switch
        {
            "StatusChange" => "status",
            "Create" or "Update" or "Assign" or "Delete" or "Progress" or "Remind" => "task",
            "Transfer" or "Swap" or "NeedHelp" => "marketplace",
            _ => null,
        },
        "TaskLink" or "StoredFile" => "task",
        "GroupMember" => "member",
        "Project" or "ProjectMessage" => "project",
        "MarketplaceRequest" or "TaskHelper" => "marketplace",
        "Group" or "GroupSettings" or "GroupInvite" => "group",
        _ => null,
    };

    public async Task<ActivityPageDto> GetActivityLogAsync(Guid userId, Guid groupId, Guid? actorId, Guid? projectId,
        string? category, string? from, string? to, string? cursor, int take, CancellationToken ct = default)
    {
        await RequireLeaderAsync(userId, groupId, ct);
        take = Math.Clamp(take, 1, 100);

        var q = _context.ActivityLogs.Where(a => a.GroupId == groupId);
        if (actorId != null) q = q.Where(a => a.ActorUserId == actorId);
        if (projectId != null) q = q.Where(a => a.ProjectId == projectId);
        if (!string.IsNullOrWhiteSpace(category))
        {
            q = category switch
            {
                "task" => q.Where(a => (a.EntityType == "Task"
                        && (a.Action == "Create" || a.Action == "Update" || a.Action == "Assign"
                            || a.Action == "Delete" || a.Action == "Progress" || a.Action == "Remind"))
                    || a.EntityType == "TaskLink" || a.EntityType == "StoredFile"),
                "status" => q.Where(a => a.EntityType == "Task" && a.Action == "StatusChange"),
                "member" => q.Where(a => a.EntityType == "GroupMember"),
                "project" => q.Where(a => a.EntityType == "Project" || a.EntityType == "ProjectMessage"),
                "marketplace" => q.Where(a => a.EntityType == "MarketplaceRequest" || a.EntityType == "TaskHelper"
                    || (a.EntityType == "Task" && (a.Action == "Transfer" || a.Action == "Swap" || a.Action == "NeedHelp"))),
                "group" => q.Where(a => a.EntityType == "Group" || a.EntityType == "GroupSettings" || a.EntityType == "GroupInvite"),
                _ => throw new BadRequestException("Loại hoạt động không hợp lệ."),
            };
        }

        DateTime? fromUtc = null, toUtc = null;
        if (!string.IsNullOrWhiteSpace(from))
        {
            if (!DateOnly.TryParse(from, out var d)) throw new BadRequestException("Ngày không hợp lệ.");
            fromUtc = VnMidnightUtc(d);
        }
        if (!string.IsNullOrWhiteSpace(to))
        {
            if (!DateOnly.TryParse(to, out var d)) throw new BadRequestException("Ngày không hợp lệ.");
            toUtc = VnMidnightUtc(d.AddDays(1));
        }
        if (fromUtc != null && toUtc != null && fromUtc > toUtc.Value.AddDays(-1))
            throw new BadRequestException("Ngày bắt đầu phải trước ngày kết thúc.");
        if (fromUtc != null) q = q.Where(a => a.CreatedAt >= fromUtc);
        if (toUtc != null) q = q.Where(a => a.CreatedAt < toUtc);

        long snapshotTicks; int offset;
        if (string.IsNullOrEmpty(cursor))
        {
            snapshotTicks = DateTime.UtcNow.Ticks; offset = 0;
        }
        else
        {
            string decoded;
            try { decoded = Encoding.UTF8.GetString(Base64UrlDecode(cursor)); }
            catch { throw new BadRequestException("Con trỏ phân trang không hợp lệ."); }
            var parts = decoded.Split(':');
            if (parts.Length != 2 || !long.TryParse(parts[0], out snapshotTicks) || !int.TryParse(parts[1], out offset) || offset < 0)
                throw new BadRequestException("Con trỏ phân trang không hợp lệ.");
        }
        var snapshotUtc = new DateTime(snapshotTicks, DateTimeKind.Utc);

        var page = await q.Where(a => a.CreatedAt <= snapshotUtc)
            .OrderByDescending(a => a.CreatedAt).ThenByDescending(a => a.Id)
            .Skip(offset).Take(take + 1)
            .Select(a => new { a.Id, a.ActorUserId, ActorName = a.Actor.DisplayName, a.Action, a.EntityType,
                a.EntityId, a.Summary, a.CreatedAt, a.ProjectId,
                ProjectName = a.Project != null ? a.Project.Name : null })
            .ToListAsync(ct);
        var hasMore = page.Count > take;
        var items = page.Take(take).ToList();

        // TaskId only survives when the task still exists in a non-archived project.
        var taskIds = items.Where(i => i.EntityType == "Task" && i.EntityId != null)
            .Select(i => i.EntityId!.Value).Distinct().ToList();
        var liveTasks = taskIds.Count == 0 ? new HashSet<Guid>()
            : (await _context.Tasks.Where(t => taskIds.Contains(t.Id) && t.Project.ArchivedAt == null)
                .Select(t => t.Id).ToListAsync(ct)).ToHashSet();

        var dtos = items.Select(i => new ActivityItemDto(i.Id, i.ActorUserId, i.ActorName, i.Action, i.EntityType,
            i.EntityId, ActivityCategory(i.EntityType, i.Action), i.Summary, i.CreatedAt, i.ProjectId, i.ProjectName,
            i.EntityType == "Task" && i.EntityId != null && liveTasks.Contains(i.EntityId.Value) ? i.EntityId : null))
            .ToList();
        var nextCursor = hasMore ? Base64UrlEncode(Encoding.UTF8.GetBytes($"{snapshotTicks}:{offset + take}")) : null;
        return new ActivityPageDto(dtos, nextCursor);
    }

    public async Task<ActivityLogFiltersDto> GetActivityLogFiltersAsync(Guid userId, Guid groupId, CancellationToken ct = default)
    {
        await RequireLeaderAsync(userId, groupId, ct);
        var actors = await _context.GroupMembers
            .Where(m => m.GroupId == groupId)
            .OrderBy(m => m.User.DisplayName)
            .Select(m => new ActivityLogActorDto(m.UserId, m.User.DisplayName, m.IsActive))
            .ToListAsync(ct);
        var projects = await _context.Projects
            .Where(p => p.GroupId == groupId)
            .OrderBy(p => p.Name)
            .Select(p => new ActivityLogProjectDto(p.Id, p.Name, p.ArchivedAt != null))
            .ToListAsync(ct);
        return new ActivityLogFiltersDto(actors, projects);
    }

    /// <summary>VN midnight of the given calendar date, in UTC (Asia/Ho_Chi_Minh = UTC+7, no DST).</summary>
    private static DateTime VnMidnightUtc(DateOnly d)
        => new DateTime(d.Year, d.Month, d.Day, 0, 0, 0, DateTimeKind.Utc).AddHours(-7);

    private static string Base64UrlEncode(byte[] bytes)
        => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static byte[] Base64UrlDecode(string s)
    {
        s = s.Replace('-', '+').Replace('_', '/');
        s += new string('=', (4 - s.Length % 4) % 4);
        return Convert.FromBase64String(s);
    }

    private async Task<GroupMember> RequireMembershipAsync(Guid userId, Guid groupId, CancellationToken ct)
        => await _access.RequireMemberAsync(userId, groupId, ct);

    private async Task<GroupMember> RequireLeaderAsync(Guid userId, Guid groupId, CancellationToken ct)
        => await _access.RequireLeaderAsync(userId, groupId, ct);

    private static string InviteStatus(DateTime? revokedAt, DateTime? expiresAt, int? maxUses, int usedCount, DateTime now)
        => revokedAt != null ? "Revoked"
            : expiresAt != null && expiresAt < now ? "Expired"
            : maxUses != null && usedCount >= maxUses ? "Exhausted" : "Active";

    private static string GenerateCode()
    {
        const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        return new string(RandomNumberGenerator.GetBytes(8).Select(b => chars[b % chars.Length]).ToArray());
    }

    private static string HashToken(string token)
        => Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    private static ActivityLog Log(Guid actor, Guid groupId, Guid? projectId, string entityType, Guid? entityId, string action, string summary)
        => new() { Id = Guid.NewGuid(), ActorUserId = actor, GroupId = groupId, ProjectId = projectId, EntityType = entityType, EntityId = entityId, Action = action, Summary = summary };
}
