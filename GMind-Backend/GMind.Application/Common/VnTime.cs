using System.Text;
using Microsoft.Extensions.Configuration;

namespace GMind.Application.Common;

public static class VnTime
{
    private static TimeZoneInfo? _zone;
    private static TimeZoneInfo Zone => _zone ??= Resolve();

    public static void Configure(IConfiguration config)
    {
        var id = config["App:TimeZone"] ?? "Asia/Ho_Chi_Minh";
        try { _zone = TimeZoneInfo.FindSystemTimeZoneById(id); }
        catch { try { _zone = TimeZoneInfo.FindSystemTimeZoneById("SE Asia Standard Time"); } catch { _zone = TimeZoneInfo.Utc; } }
    }

    private static TimeZoneInfo Resolve()
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById("Asia/Ho_Chi_Minh"); }
        catch { try { return TimeZoneInfo.FindSystemTimeZoneById("SE Asia Standard Time"); } catch { return TimeZoneInfo.Utc; } }
    }

    public static string Format(DateTime utc) =>
        TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc), Zone).ToString("HH:mm dd/MM/yyyy");

    public static string FormatDate(DateTime utc) =>
        TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc), Zone).ToString("dd/MM/yyyy");
}
