using System.Globalization;
using System.Security.Claims;
using GMind.Application.Common;
using GMind.Application.Services.Auth;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;

namespace GMind.API.Common;

public sealed class SessionTokenValidator(IApplicationDbContext db) : JwtBearerEvents
{
    public override Task MessageReceived(MessageReceivedContext context)
    {
        // JWT via query string is allowed for SignalR hub paths only (browsers can't set headers on WebSocket/SSE).
        var accessToken = context.Request.Query["access_token"];
        if (!string.IsNullOrEmpty(accessToken) && context.HttpContext.Request.Path.StartsWithSegments("/hubs"))
            context.Token = accessToken;
        return Task.CompletedTask;
    }

    public override async Task TokenValidated(TokenValidatedContext context)
    {
        var id = context.Principal?.FindFirstValue(ClaimTypes.NameIdentifier);
        var version = context.Principal?.FindFirstValue(TokenService.AuthVersionClaim);
        var sessionId = context.Principal?.FindFirstValue(TokenService.SessionIdClaim);
        var now = DateTime.UtcNow;

        if (!Guid.TryParse(id, out var userId)
            || !int.TryParse(version, NumberStyles.None, CultureInfo.InvariantCulture, out var authVersion)
            || !Guid.TryParse(sessionId, out var sid)
            || !await db.UserSessions.AsNoTracking().AnyAsync(
                s => s.Id == sid && s.UserId == userId
                    && s.RevokedAt == null && s.ExpiresAt > now && s.AbsoluteExpiresAt > now
                    && s.User.IsActive && s.User.AuthVersion == authVersion,
                context.HttpContext.RequestAborted))
            context.Fail("Session is no longer valid");
    }
}
