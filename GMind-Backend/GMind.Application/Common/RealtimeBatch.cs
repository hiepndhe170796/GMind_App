using GMind.Domain.Enums;

namespace GMind.Application.Common;

/// <summary>A Notification row captured while saving (id + display fields only, no navigation).</summary>
public sealed record RealtimeAddedNotification(
    Guid Id,
    Guid RecipientUserId,
    Guid? GroupId,
    NotificationType Type,
    string Title,
    string Body,
    string? RelatedEntityType,
    Guid? RelatedEntityId,
    DateTime CreatedAt);

/// <summary>Ids of entities touched by one SaveChanges — the dispatcher resolves group membership from these.</summary>
public sealed record RealtimeBatch(
    List<RealtimeAddedNotification> Notifications,
    List<Guid> TaskIds,
    List<Guid> ProjectIds,
    List<Guid> GroupIds,
    List<Guid> ArchivedGroupIds,
    List<Guid> DiscussionProjectIds)
{
    public bool IsEmpty => Notifications.Count == 0 && TaskIds.Count == 0 && ProjectIds.Count == 0 && GroupIds.Count == 0
        && DiscussionProjectIds.Count == 0;
}
