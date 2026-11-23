using System.Net;
using System.Net.Sockets;

namespace GMind.Application.Common;

public static class ClientIpMask
{
    /// <summary>IPv4 → a.b.c.0; IPv6 → first 3 hextets + "::". Anything else → null.</summary>
    public static string? Mask(string? remoteIp)
    {
        if (string.IsNullOrWhiteSpace(remoteIp) || !IPAddress.TryParse(remoteIp, out var ip)) return null;
        if (ip.IsIPv4MappedToIPv6) ip = ip.MapToIPv4();
        if (IPAddress.IsLoopback(ip)) return "localhost";
        if (ip.AddressFamily == AddressFamily.InterNetwork)
        {
            var b = ip.GetAddressBytes();
            return $"{b[0]}.{b[1]}.{b[2]}.0";
        }
        if (ip.AddressFamily == AddressFamily.InterNetworkV6)
        {
            var b = ip.GetAddressBytes();
            return string.Concat(
                ((b[0] << 8) | b[1]).ToString("x"), ":",
                ((b[2] << 8) | b[3]).ToString("x"), ":",
                ((b[4] << 8) | b[5]).ToString("x"), "::");
        }
        return null;
    }
}
