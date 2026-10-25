namespace GMind.Domain.Enums;

public enum NotificationType
{
    TaskAssigned = 1,
    TaskUpdated = 2,
    TaskSubmitted = 3,
    TaskApproved = 4,
    TaskChangesRequested = 5,
    MarketplaceRequestCreated = 6,
    MarketplaceRequestApproved = 7,
    MarketplaceRequestRejected = 8,
    DeadlineReminder = 9,
    OverdueAlert = 10,
    MemberInvited = 11,
    MemberJoined = 12,
    MemberRemoved = 13,
    StaleTaskWarning = 14,
    CommentAdded = 15
}
