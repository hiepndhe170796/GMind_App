using System.Runtime.CompilerServices;
using GMind.Application.Common;
using GMind.Domain.Entities;
using GMind.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using TaskEntity = GMind.Domain.Entities.Task;

namespace GMind.Infrastructure.Persistence;

/// <summary>
/// Captures added Notifications and the ids of realtime-relevant entities during SavingChanges,
/// then enqueues one RealtimeBatch after a successful save. Failed saves enqueue nothing.
/// </summary>
public sealed class RealtimeChangeInterceptor : SaveChangesInterceptor
{
    private readonly RealtimeOutbox _outbox;
    private readonly ConditionalWeakTable<DbContext, PendingBatch> _pending = new();

    public RealtimeChangeInterceptor(RealtimeOutbox outbox) => _outbox = outbox;

    private sealed class PendingBatch
    {
        public List<RealtimeAddedNotification> Notifications { get; } = [];
        public List<Guid> TaskIds { get; } = [];
        public List<Guid> ProjectIds { get; } = [];
        public List<Guid> GroupIds { get; } = [];
        public List<Guid> ArchivedGroupIds { get; } = [];
        public List<Guid> DiscussionProjectIds { get; } = [];
    }

    private void Collect(DbContext? context)
    {
        if (context is null) return;
        var pending = _pending.GetOrCreateValue(context);

        foreach (var entry in context.ChangeTracker.Entries())
        {
            if (entry.Entity is Notification n && entry.State == EntityState.Added)
            {
                pending.Notifications.Add(new RealtimeAddedNotification(
                    n.Id, n.RecipientUserId, n.GroupId, n.Type, n.Title, n.Body,
                    n.RelatedEntityType, n.RelatedEntityId, n.CreatedAt));
                continue;
            }

            var relevant = entry.State is EntityState.Added or EntityState.Modified or EntityState.Deleted;
            if (!relevant) continue;

            switch (entry.Entity)
            {
                case TaskEntity t:
                    pending.TaskIds.Add(t.Id);
                    break;
                case TaskComment c:
                    pending.TaskIds.Add(c.TaskId);
                    break;
                case TaskLink l:
                    if (l.TaskId is Guid linkTaskId) pending.TaskIds.Add(linkTaskId);
                    else pending.ProjectIds.Add(l.ProjectId);
                    break;
                case StoredFile f:
                    if (f.Kind == FileKind.Task && f.TaskId is Guid fileTaskId) pending.TaskIds.Add(fileTaskId);
                    else if (f.Kind == FileKind.Project && f.ProjectId is Guid fileProjectId) pending.ProjectIds.Add(fileProjectId);
                    else if (f.Kind == FileKind.Message && f.ProjectId is Guid msgProjectId) pending.DiscussionProjectIds.Add(msgProjectId);
                    break;
                case ProjectMessage pm:
                    pending.DiscussionProjectIds.Add(pm.ProjectId);
                    break;
                case TaskSubmission s:
                    pending.TaskIds.Add(s.TaskId);
                    break;
                case TaskReview r:
                    pending.TaskIds.Add(r.TaskId);
                    break;
                case TaskHelper h:
                    pending.TaskIds.Add(h.TaskId);
                    break;
                case MarketplaceRequest m:
                    if (m.TaskId is Guid mrTaskId) pending.TaskIds.Add(mrTaskId);
                    pending.GroupIds.Add(m.GroupId);
                    break;
                case Project p:
                    pending.ProjectIds.Add(p.Id);
                    break;
                case GroupMember gm:
                    pending.GroupIds.Add(gm.GroupId);
                    break;
                case Group g:
                    pending.GroupIds.Add(g.Id);
                    if (entry.State == EntityState.Modified && g.IsArchived
                        && entry.Property(nameof(Group.IsArchived)).OriginalValue is false)
                        pending.ArchivedGroupIds.Add(g.Id);
                    break;
            }
        }
    }

    private void Flush(DbContext? context)
    {
        if (context is null || !_pending.TryGetValue(context, out var pending)) return;
        _pending.Remove(context);
        var batch = new RealtimeBatch(
            pending.Notifications, pending.TaskIds.Distinct().ToList(),
            pending.ProjectIds.Distinct().ToList(), pending.GroupIds.Distinct().ToList(),
            pending.ArchivedGroupIds.Distinct().ToList(), pending.DiscussionProjectIds.Distinct().ToList());
        if (!batch.IsEmpty) _outbox.Enqueue(batch);
    }

    private void Discard(DbContext? context)
    {
        if (context is not null) _pending.Remove(context);
    }

    public override InterceptionResult<int> SavingChanges(DbContextEventData eventData, InterceptionResult<int> result)
    {
        Collect(eventData.Context);
        return base.SavingChanges(eventData, result);
    }

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
    {
        Collect(eventData.Context);
        return base.SavingChangesAsync(eventData, result, cancellationToken);
    }

    public override int SavedChanges(SaveChangesCompletedEventData eventData, int result)
    {
        Flush(eventData.Context);
        return base.SavedChanges(eventData, result);
    }

    public override ValueTask<int> SavedChangesAsync(
        SaveChangesCompletedEventData eventData, int result, CancellationToken cancellationToken = default)
    {
        Flush(eventData.Context);
        return base.SavedChangesAsync(eventData, result, cancellationToken);
    }

    public override void SaveChangesFailed(DbContextErrorEventData eventData)
    {
        Discard(eventData.Context);
        base.SaveChangesFailed(eventData);
    }

    public override System.Threading.Tasks.Task SaveChangesFailedAsync(
        DbContextErrorEventData eventData, CancellationToken cancellationToken = default)
    {
        Discard(eventData.Context);
        return base.SaveChangesFailedAsync(eventData, cancellationToken);
    }
}
