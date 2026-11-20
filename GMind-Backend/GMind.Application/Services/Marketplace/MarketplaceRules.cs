using GMind.Domain.Enums;

namespace GMind.Application.Services.Marketplace;

/// <summary>Marketplace 3-party rules — single source used by the service and DTO projections.</summary>
public static class MarketplaceRules
{
    /// <summary>Statuses in which a request is still alive (can transition further).</summary>
    public static readonly MarketplaceRequestStatus[] ActiveStatuses =
    [
        MarketplaceRequestStatus.Open,
        MarketplaceRequestStatus.AwaitingRecipient,
        MarketplaceRequestStatus.Pending
    ];

    public static bool IsActive(MarketplaceRequestStatus status) => ActiveStatuses.Contains(status);

    /// <summary>The requester and the target are the "parties" of a request.</summary>
    public static bool IsParty(Guid requesterId, Guid? targetId, Guid userId)
        => userId == requesterId || userId == targetId;

    /// <summary>Leader may approve only Pending requests, and never a request they are a party of when another active Leader exists.</summary>
    public static bool CanReview(Role role, MarketplaceRequestStatus status, Guid requesterId, Guid? targetId, Guid userId, bool anotherLeader)
        => role == Role.Leader && status == MarketplaceRequestStatus.Pending
            && !(IsParty(requesterId, targetId, userId) && anotherLeader);

    /// <summary>Leader may reject at any active stage, with the same party restriction.</summary>
    public static bool CanReject(Role role, MarketplaceRequestStatus status, Guid requesterId, Guid? targetId, Guid userId, bool anotherLeader)
        => role == Role.Leader && IsActive(status)
            && !(IsParty(requesterId, targetId, userId) && anotherLeader);

    /// <summary>The named target may respond while the request awaits their answer.</summary>
    public static bool CanRespond(MarketplaceRequestStatus status, Guid? targetId, Guid userId)
        => status == MarketplaceRequestStatus.AwaitingRecipient && targetId == userId;

    /// <summary>Any active member except the requester may claim an Open request.</summary>
    public static bool CanClaim(MarketplaceRequestStatus status, Guid requesterId, Guid userId)
        => status == MarketplaceRequestStatus.Open && userId != requesterId;

    /// <summary>The requester may cancel while the request is active.</summary>
    public static bool CanCancel(MarketplaceRequestStatus status, Guid requesterId, Guid userId)
        => requesterId == userId && IsActive(status);
}
