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
    CommentAdded = 15,
    AtRiskWarning = 16,
    LeaderReminder = 17,
    MarketplaceResponseNeeded = 18,
    MarketplaceRecipientAccepted = 19,
    MarketplaceRecipientDeclined = 20,
    MarketplaceClaimed = 21,
    MarketplaceOpenRequest = 22,
    HelperAdded = 23,
    HelperEnded = 24,
    GroupArchived = 25,
    GroupRestored = 26
}
