using GMind.Application.Common;

namespace GMind.API.Common;

/// <summary>Reads User-Agent and the (masked) remote IP from the current request. X-Forwarded-For is never trusted.</summary>
public sealed class HttpClientInfo(IHttpContextAccessor accessor) : IClientInfo
{
    public string? UserAgent => accessor.HttpContext?.Request.Headers.UserAgent.ToString() is { Length: > 0 } ua ? ua : null;

    public string? IpAddress => ClientIpMask.Mask(accessor.HttpContext?.Connection.RemoteIpAddress?.ToString());
}
