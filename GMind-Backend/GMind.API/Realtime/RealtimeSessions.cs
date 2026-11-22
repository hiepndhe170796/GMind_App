using GMind.Application.Common;
using Microsoft.AspNetCore.SignalR;

namespace GMind.API.Realtime;

/// <summary>Sends <c>session-revoked</c> to the realtime connections of specific sessions.</summary>
public sealed class RealtimeSessions(IHubContext<RealtimeHub> hub) : IRealtimeSessions
{
    public async Task RevokedAsync(IReadOnlyCollection<Guid> sessionIds, CancellationToken ct = default)
    {
        foreach (var id in sessionIds)
            await hub.Clients.Group($"session:{id}").SendAsync("session-revoked", new { sessionId = id }, ct);
    }
}
