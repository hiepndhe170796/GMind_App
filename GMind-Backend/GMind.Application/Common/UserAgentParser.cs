namespace GMind.Application.Common;

/// <summary>Pure User-Agent → browser/OS label parser for the session list.</summary>
public static class UserAgentParser
{
    public const string UnknownBrowser = "Trình duyệt không xác định";
    public const string UnknownOs = "hệ điều hành không xác định";

    public static (string Browser, string Os) Parse(string? userAgent)
    {
        var ua = userAgent ?? string.Empty;
        string browser;
        if (ua.Contains("Edg/")) browser = "Edge";
        else if (ua.Contains("OPR/") || ua.Contains("Opera")) browser = "Opera";
        else if (ua.Contains("Chrome/") || ua.Contains("CriOS/")) browser = "Chrome";
        else if (ua.Contains("Firefox/") || ua.Contains("FxiOS/")) browser = "Firefox";
        else if (ua.Contains("Safari/") && ua.Contains("Version/")) browser = "Safari";
        else browser = UnknownBrowser;

        string os;
        if (ua.Contains("Windows")) os = "Windows";
        else if (ua.Contains("iPhone") || ua.Contains("iPad") || ua.Contains("iPod")) os = "iOS";
        else if (ua.Contains("Android")) os = "Android";
        else if (ua.Contains("Mac OS X") || ua.Contains("Macintosh")) os = "macOS";
        else if (ua.Contains("Linux")) os = "Linux";
        else os = UnknownOs;

        return (browser, os);
    }

    public static string DeviceLabel(string? userAgent)
    {
        var (browser, os) = Parse(userAgent);
        if (browser == UnknownBrowser)
            return os == UnknownOs ? "Thiết bị không xác định" : $"Trình duyệt trên {os}";
        return os == UnknownOs ? browser : $"{browser} trên {os}";
    }
}
