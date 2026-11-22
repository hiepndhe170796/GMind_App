namespace GMind.Application.Common;

/// <summary>Client metadata captured at login time. Implemented by the API layer from HttpContext; tests fake it.</summary>
public interface IClientInfo
{
    string? UserAgent { get; }
    /// <summary>Already-masked remote IP (IPv4 /24, IPv6 /48); never from X-Forwarded-For.</summary>
    string? IpAddress { get; }
}
