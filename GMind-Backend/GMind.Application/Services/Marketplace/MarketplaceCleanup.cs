using GMind.Application.Common;
using GMind.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Task = System.Threading.Tasks.Task;

namespace GMind.Application.Services.Marketplace;

/// <summary>Cancels active marketplace requests when their subject changes underneath them.
/// Never saves — the caller saves in the same transaction.</summary>
public static class MarketplaceCleanup
{
    /// <summary>Cancels every active request whose TaskId or RelatedTaskId is in <paramref name="taskIds"/>.</summary>
    public static async Task<int> CancelActiveAsync(IApplicationDbContext db, IReadOnlyCollection<Guid> taskIds,
        Guid? exceptRequestId, string reason, CancellationToken ct = default)
    {
        if (taskIds.Count == 0) return 0;
        var now = DateTime.UtcNow;
        var rows = await db.MarketplaceRequests
            .Where(r => MarketplaceRules.ActiveStatuses.Contains(r.Status)
                && r.Id != exceptRequestId
                && (r.TaskId != null && taskIds.Contains(r.TaskId.Value)
                    || r.RelatedTaskId != null && taskIds.Contains(r.RelatedTaskId.Value)))
            .ToListAsync(ct);
        foreach (var r in rows)
        {
            r.Status = MarketplaceRequestStatus.Cancelled;
            r.ReviewedAt = now;
            r.ReviewComment = reason;
        }
        return rows.Count;
    }

    /// <summary>Cancels every active request of a group (group archive).</summary>
    public static async Task<int> CancelActiveForGroupAsync(IApplicationDbContext db, Guid groupId,
        string reason, CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;
        var rows = await db.MarketplaceRequests
            .Where(r => r.GroupId == groupId && MarketplaceRules.ActiveStatuses.Contains(r.Status))
            .ToListAsync(ct);
        foreach (var r in rows)
        {
            r.Status = MarketplaceRequestStatus.Cancelled;
            r.ReviewedAt = now;
            r.ReviewComment = reason;
        }
        return rows.Count;
    }
}
