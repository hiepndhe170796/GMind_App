using GMind.Application.Common;
using GMind.Domain.Enums;
using GMind.Infrastructure.Persistence;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace GMind.API.Realtime;

/// <summary>
/// Drains the realtime outbox: resolves changed ids to their group, fans out ids-only "changed"
/// to that group's active members, and pushes visible-only "notification" payloads with unread counts.
/// Failures are logged with the batch size and never propagate to requests.
/// </summary>
public sealed class RealtimeDispatcher : BackgroundService
{
    private readonly IServiceProvider _services;
    private readonly RealtimeOutbox _outbox;
    private readonly IHubContext<RealtimeHub> _hub;
    private readonly ILogger<RealtimeDispatcher> _logger;

    public RealtimeDispatcher(IServiceProvider services, RealtimeOutbox outbox,
        IHubContext<RealtimeHub> hub, ILogger<RealtimeDispatcher> logger)
    {
        _services = services;
        _outbox = outbox;
        _hub = hub;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var batch in _outbox.Reader.ReadAllAsync(stoppingToken))
        {
            try
            {
                await DispatchAsync(batch, stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "Realtime dispatch failed (notifications={Notifications}, ids={Ids})",
                    batch.Notifications.Count,
                    batch.TaskIds.Count + batch.ProjectIds.Count + batch.GroupIds.Count);
            }
        }
    }

    private async Task DispatchAsync(RealtimeBatch batch, CancellationToken ct)
    {
        await using var scope = _services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        // Resolve task → group and project → group in one query each.
        var taskRows = batch.TaskIds.Count == 0 ? [] : await db.Tasks.AsNoTracking()
            .Where(t => batch.TaskIds.Contains(t.Id))
            .Select(t => new { t.Id, t.Project.GroupId })
            .ToListAsync(ct);
        var projectRows = batch.ProjectIds.Count == 0 ? [] : await db.Projects.AsNoTracking()
            .Where(p => batch.ProjectIds.Contains(p.Id))
            .Select(p => new { p.Id, p.GroupId })
            .ToListAsync(ct);

        // discussion events only reach members of live projects in non-archived groups.
        var discussionRows = batch.DiscussionProjectIds.Count == 0 ? [] : await db.Projects.AsNoTracking()
            .Where(p => batch.DiscussionProjectIds.Contains(p.Id) && p.ArchivedAt == null && !p.Group.IsArchived)
            .Select(p => new { p.Id, p.GroupId })
            .ToListAsync(ct);

        var groupIds = batch.GroupIds
            .Concat(taskRows.Select(t => t.GroupId))
            .Concat(projectRows.Select(p => p.GroupId))
            .Concat(discussionRows.Select(p => p.GroupId))
            .Concat(batch.Notifications.Where(n => n.GroupId != null).Select(n => n.GroupId!.Value))
            .Distinct().ToList();

        var archived = batch.ArchivedGroupIds.ToHashSet();

        // Active members of each affected group (members of just-archived groups are kept so their UI leaves).
        var memberRows = groupIds.Count == 0 ? [] : await db.GroupMembers.AsNoTracking()
            .Where(m => groupIds.Contains(m.GroupId) && m.IsActive && m.User.IsActive)
            .Select(m => new { m.GroupId, m.UserId, m.Group.IsArchived })
            .ToListAsync(ct);
        var membersByGroup = memberRows
            .Where(m => !m.IsArchived || archived.Contains(m.GroupId))
            .GroupBy(m => m.GroupId)
            .ToDictionary(g => g.Key, g => g.Select(m => m.UserId).Distinct().ToList());

        // changed → per-group fan-out, ids only.
        var taskGroups = taskRows.ToDictionary(t => t.Id, t => t.GroupId);
        var projectGroups = projectRows.ToDictionary(p => p.Id, p => p.GroupId);
        foreach (var (groupId, members) in membersByGroup)
        {
            var taskIds = batch.TaskIds.Where(id => taskGroups.GetValueOrDefault(id) == groupId).ToList();
            var projectIds = batch.ProjectIds.Where(id => projectGroups.GetValueOrDefault(id) == groupId).ToList();
            var gIds = batch.GroupIds.Contains(groupId) ? new List<Guid> { groupId } : [];
            if (taskIds.Count == 0 && projectIds.Count == 0 && gIds.Count == 0) continue;
            if (members.Count == 0) continue;
            await _hub.Clients.Users(members.Select(m => m.ToString()).ToList())
                .SendAsync("changed", new { taskIds, projectIds, groupIds = gIds }, ct);
        }

        // discussion → one { projectId } event to the project's group members (live projects only).
        foreach (var row in discussionRows)
        {
            if (!membersByGroup.TryGetValue(row.GroupId, out var members) || members.Count == 0) continue;
            await _hub.Clients.Users(members.Select(m => m.ToString()).ToList())
                .SendAsync("discussion", new { projectId = row.Id }, ct);
        }

        // notification → visible-only, with the recipient's unread count (one grouped query each).
        if (batch.Notifications.Count > 0)
        {
            var recipientIds = batch.Notifications.Select(n => n.RecipientUserId).Distinct().ToList();

            // All active memberships of the recipients in non-archived groups (visibility + unread, one query).
            var recipientMemberships = await db.GroupMembers.AsNoTracking()
                .Where(m => recipientIds.Contains(m.UserId) && m.IsActive && m.User.IsActive && !m.Group.IsArchived)
                .Select(m => new { m.UserId, m.GroupId })
                .ToListAsync(ct);
            var memberGroupsByUser = recipientMemberships
                .GroupBy(m => m.UserId)
                .ToDictionary(g => g.Key, g => g.Select(m => m.GroupId).ToHashSet());

            var unreadRows = await db.Notifications.AsNoTracking()
                .Where(n => recipientIds.Contains(n.RecipientUserId) && n.ReadAt == null)
                .Select(n => new { n.RecipientUserId, n.GroupId, n.Type })
                .ToListAsync(ct);
            int UnreadFor(Guid userId) => unreadRows.Count(n => n.RecipientUserId == userId
                && (n.GroupId == null || n.Type == NotificationType.MemberRemoved || n.Type == NotificationType.GroupArchived
                    || (memberGroupsByUser.TryGetValue(userId, out var gs) && gs.Contains(n.GroupId.Value))));

            foreach (var n in batch.Notifications)
            {
                var visible = n.GroupId == null
                    || n.Type == NotificationType.MemberRemoved || n.Type == NotificationType.GroupArchived
                    || (memberGroupsByUser.TryGetValue(n.RecipientUserId, out var gs) && gs.Contains(n.GroupId.Value));
                if (!visible) continue;
                await _hub.Clients.User(n.RecipientUserId.ToString()).SendAsync("notification", new
                {
                    id = n.Id,
                    type = n.Type.ToString(),
                    title = n.Title,
                    body = n.Body,
                    relatedEntityType = n.RelatedEntityType,
                    relatedEntityId = n.RelatedEntityId,
                    groupId = n.GroupId,
                    createdAt = n.CreatedAt,
                    unreadCount = UnreadFor(n.RecipientUserId)
                }, ct);
            }
        }
    }
}
