namespace GMind.Application.Common;

/// <summary>Pushes a <c>session-revoked</c> signal to a revoked session's realtime connections.</summary>
public interface IRealtimeSessions
{
    Task RevokedAsync(IReadOnlyCollection<Guid> sessionIds, CancellationToken ct = default);
}
