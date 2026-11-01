using System.Security.Cryptography;
using System.Text;
using GMind.Application.Common;
using GMind.Application.Common.Exceptions;
using GMind.Application.DTOs;
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
    Task<InviteDto> CreateInviteAsync(Guid userId, Guid groupId, DateTime? expiresAt, int? maxUses, CancellationToken ct = default);
    Task RevokeInviteAsync(Guid userId, Guid inviteId, CancellationToken ct = default);
    Task<GroupDto> JoinByCodeAsync(Guid userId, string code, CancellationToken ct = default);
    Task<List<MemberDto>> GetMembersAsync(Guid userId, Guid groupId, CancellationToken ct = default);
    Task RemoveMemberAsync(Guid userId, Guid groupId, Guid memberUserId, CancellationToken ct = default);
    Task ChangeMemberRoleAsync(Guid userId, Guid groupId, Guid memberUserId, Role newRole, CancellationToken ct = default);
    Task LeaveGroupAsync(Guid userId, Guid groupId, CancellationToken ct = default);
    Task<List<ActivityDto>> GetActivityAsync(Guid userId, Guid groupId, int take, CancellationToken ct = default);
}

public record GroupDto(Guid Id, string Name, string? Description, int MemberCount, string MyRole, DateTime CreatedAt);
public record GroupDetailDto(Guid Id, string Name, string? Description, int MemberCount, string MyRole, DateTime CreatedAt, List<MemberDto> Members);
public record MemberDto(Guid UserId, string DisplayName, string? AvatarUrl, string Role, DateTime JoinedAt);
public record InviteDto(Guid Id, string Code, string InviteLink, DateTime? ExpiresAt, int? MaxUses, int UsedCount);
public record ActivityDto(Guid Id, string ActorName, string Action, string EntityType, string Summary, DateTime CreatedAt);

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
        _context.ActivityLogs.Add(Log(userId, group.Id, null, "Group", group.Id, "Create", $"Created group '{group.Name}'"));
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
        var members = await _context.GroupMembers
            .Where(m => m.GroupId == groupId && m.IsActive)
            .Select(m => new MemberDto(m.UserId, m.User.DisplayName, m.User.AvatarUrl, m.Role.ToString(), m.JoinedAt))
            .ToListAsync(ct);

        return new GroupDetailDto(group.Id, group.Name, group.Description, members.Count, membership.Role.ToString(), group.CreatedAt, members);
    }

    public async Task<GroupDto> UpdateGroupAsync(Guid userId, Guid groupId, string name, string? description, CancellationToken ct = default)
    {
        await RequireLeaderAsync(userId, groupId, ct);
        var group = await _context.Groups.FirstAsync(g => g.Id == groupId, ct);
        var before = group.Name;
        group.Name = name.Trim();
        group.Description = description;
        _context.ActivityLogs.Add(Log(userId, groupId, null, "Group", groupId, "Update", $"Renamed '{before}' -> '{group.Name}'"));
        await _context.SaveChangesAsync(ct);
        var count = await _context.GroupMembers.CountAsync(m => m.GroupId == groupId && m.IsActive, ct);
        return new GroupDto(group.Id, group.Name, group.Description, count, "Leader", group.CreatedAt);
    }

    public async Task<InviteDto> CreateInviteAsync(Guid userId, Guid groupId, DateTime? expiresAt, int? maxUses, CancellationToken ct = default)
    {
        await RequireLeaderAsync(userId, groupId, ct);
        var code = GenerateCode();
        var invite = new GroupInvite
        {
            Id = Guid.NewGuid(),
            GroupId = groupId,
            Code = code,
            TokenHash = HashToken(code),
            CreatedByUserId = userId,
            ExpiresAt = expiresAt,
            MaxUses = maxUses
        };
        _context.GroupInvites.Add(invite);
        await _context.SaveChangesAsync(ct);
        return new InviteDto(invite.Id, code, $"/join/{code}", expiresAt, maxUses, 0);
    }

    public async Task RevokeInviteAsync(Guid userId, Guid inviteId, CancellationToken ct = default)
    {
        var invite = await _context.GroupInvites.FirstOrDefaultAsync(i => i.Id == inviteId, ct)
            ?? throw new NotFoundException("Invite not found");
        await RequireLeaderAsync(userId, invite.GroupId, ct);
        invite.RevokedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync(ct);
    }

    public async Task<GroupDto> JoinByCodeAsync(Guid userId, string code, CancellationToken ct = default)
    {
        var hash = HashToken(code.Trim().ToUpperInvariant());
        var invite = await _context.GroupInvites
            .Include(i => i.Group)
            .FirstOrDefaultAsync(i => i.TokenHash == hash, ct)
            ?? throw new NotFoundException("Invalid invite code");

        if (invite.RevokedAt != null || (invite.ExpiresAt != null && invite.ExpiresAt < DateTime.UtcNow)
            || (invite.MaxUses != null && invite.UsedCount >= invite.MaxUses))
            throw new BadRequestException("Invite is expired, revoked, or out of uses");
        if (invite.Group.IsArchived) throw new BadRequestException("Group is archived");

        if (await _context.GroupMembers.AnyAsync(m => m.GroupId == invite.GroupId && m.UserId == userId && m.IsActive, ct))
            throw new ConflictException("Already a member of this group");

        _context.GroupMembers.Add(new GroupMember
        {
            Id = Guid.NewGuid(), GroupId = invite.GroupId, UserId = userId, Role = Role.Member
        });
        invite.UsedCount++;
        _context.ActivityLogs.Add(Log(userId, invite.GroupId, null, "GroupMember", userId, "Join", $"{userId} joined group {invite.GroupId}"));
        await _context.SaveChangesAsync(ct);

        var leaders = await _context.GroupMembers
            .Where(m => m.GroupId == invite.GroupId && m.Role == Role.Leader && m.IsActive)
            .Select(m => m.UserId).ToListAsync(ct);
        var joinedName = await _context.Users.Where(u => u.Id == userId).Select(u => u.DisplayName).FirstAsync(ct);
        foreach (var leaderId in leaders)
            await _notifications.NotifyAsync(leaderId, invite.GroupId, NotificationType.MemberJoined,
                "Thành viên mới", $"{joinedName} đã tham gia nhóm '{invite.Group.Name}'", "Group", invite.GroupId, ct);

        var count = await _context.GroupMembers.CountAsync(m => m.GroupId == invite.GroupId && m.IsActive, ct);
        return new GroupDto(invite.GroupId, invite.Group.Name, invite.Group.Description, count, "Member", invite.Group.CreatedAt);
    }

    public async Task<List<MemberDto>> GetMembersAsync(Guid userId, Guid groupId, CancellationToken ct = default)
    {
        await RequireMembershipAsync(userId, groupId, ct);
        return await _context.GroupMembers
            .Where(m => m.GroupId == groupId && m.IsActive)
            .Select(m => new MemberDto(m.UserId, m.User.DisplayName, m.User.AvatarUrl, m.Role.ToString(), m.JoinedAt))
            .ToListAsync(ct);
    }

    public async Task RemoveMemberAsync(Guid userId, Guid groupId, Guid memberUserId, CancellationToken ct = default)
    {
        await RequireLeaderAsync(userId, groupId, ct);
        var target = await _context.GroupMembers.Include(m => m.Group)
            .FirstOrDefaultAsync(m => m.GroupId == groupId && m.UserId == memberUserId && m.IsActive, ct)
            ?? throw new NotFoundException("Member not found");
        if (target.Role == Role.Leader)
        {
            var leaderCount = await _context.GroupMembers.CountAsync(m => m.GroupId == groupId && m.Role == Role.Leader && m.IsActive, ct);
            if (leaderCount <= 1) throw new BadRequestException("Cannot remove the only leader");
        }
        target.IsActive = false;
        _context.ActivityLogs.Add(Log(userId, groupId, null, "GroupMember", memberUserId, "Remove", $"Removed member {memberUserId}"));
        await _context.SaveChangesAsync(ct);

        await _notifications.NotifyAsync(memberUserId, groupId, NotificationType.MemberRemoved,
            "Bạn đã bị xóa khỏi nhóm", $"Bạn không còn là thành viên của nhóm '{target.Group.Name}'", "Group", groupId, ct);
    }

    public async Task ChangeMemberRoleAsync(Guid userId, Guid groupId, Guid memberUserId, Role newRole, CancellationToken ct = default)
    {
        await RequireLeaderAsync(userId, groupId, ct);
        if (!Enum.IsDefined(newRole)) throw new BadRequestException("Invalid member role");
        var target = await _context.GroupMembers.FirstOrDefaultAsync(m => m.GroupId == groupId && m.UserId == memberUserId && m.IsActive, ct)
            ?? throw new NotFoundException("Member not found");
        if (target.Role == Role.Leader && newRole == Role.Member)
        {
            var leaderCount = await _context.GroupMembers.CountAsync(m => m.GroupId == groupId && m.Role == Role.Leader && m.IsActive, ct);
            if (leaderCount <= 1) throw new BadRequestException("Cannot demote the only leader");
        }
        var before = target.Role;
        target.Role = newRole;
        _context.ActivityLogs.Add(Log(userId, groupId, null, "GroupMember", memberUserId, "ChangeRole", $"Role {before} -> {newRole}"));
        await _context.SaveChangesAsync(ct);
    }

    public async Task LeaveGroupAsync(Guid userId, Guid groupId, CancellationToken ct = default)
    {
        var membership = await RequireMembershipAsync(userId, groupId, ct);
        if (membership.Role == Role.Leader)
        {
            var leaderCount = await _context.GroupMembers.CountAsync(m => m.GroupId == groupId && m.Role == Role.Leader && m.IsActive, ct);
            if (leaderCount <= 1) throw new BadRequestException("The only leader must transfer leadership before leaving");
        }
        membership.IsActive = false;
        _context.ActivityLogs.Add(Log(userId, groupId, null, "GroupMember", userId, "Leave", $"{userId} left group"));
        await _context.SaveChangesAsync(ct);
    }

    public async Task<List<ActivityDto>> GetActivityAsync(Guid userId, Guid groupId, int take, CancellationToken ct = default)
    {
        await RequireLeaderAsync(userId, groupId, ct);
        return await _context.ActivityLogs
            .Where(a => a.GroupId == groupId)
            .OrderByDescending(a => a.CreatedAt)
            .Take(Math.Clamp(take, 1, 100))
            .Select(a => new ActivityDto(a.Id, a.Actor.DisplayName, a.Action, a.EntityType, a.Summary, a.CreatedAt))
            .ToListAsync(ct);
    }

    private async Task<GroupMember> RequireMembershipAsync(Guid userId, Guid groupId, CancellationToken ct)
        => await _access.RequireMemberAsync(userId, groupId, ct);

    private async Task<GroupMember> RequireLeaderAsync(Guid userId, Guid groupId, CancellationToken ct)
        => await _access.RequireLeaderAsync(userId, groupId, ct);

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
