using System.Security.Claims;
using GMind.Application.Services.Auth;

namespace GMind.API.Common;

public static class ClaimsPrincipalExtensions
{
    public static Guid GetUserId(this ClaimsPrincipal user)
    {
        var value = user.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(value, out var id) ? id : Guid.Empty;
    }

    public static Guid? GetSessionId(this ClaimsPrincipal user)
    {
        var value = user.FindFirstValue(TokenService.SessionIdClaim);
        return Guid.TryParse(value, out var id) ? id : null;
    }
}
