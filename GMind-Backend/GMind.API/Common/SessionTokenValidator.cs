using System.Globalization;
using System.Security.Claims;
using GMind.Application.Common;
using GMind.Application.Services.Auth;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;

namespace GMind.API.Common;

public sealed class SessionTokenValidator(IApplicationDbContext db) : JwtBearerEvents
{
    public override async Task TokenValidated(TokenValidatedContext context)
    {
        var id = context.Principal?.FindFirstValue(ClaimTypes.NameIdentifier);
        var version = context.Principal?.FindFirstValue(TokenService.AuthVersionClaim);
        if (!Guid.TryParse(id, out var userId)
            || !int.TryParse(version, NumberStyles.None, CultureInfo.InvariantCulture, out var authVersion)
            || !await db.Users.AsNoTracking().AnyAsync(u => u.Id == userId && u.IsActive && u.AuthVersion == authVersion, context.HttpContext.RequestAborted))
            context.Fail("Session is no longer valid");
    }
}
