using System.Text;
using GMind.Application.Common.Exceptions;

namespace GMind.Application.Common;

/// <summary>
/// Stable paging cursor: a boundary timestamp plus the ids sharing it, so new/updated rows
/// can't shift the page window. Wire format is base64url "ticks|id,id,…".
/// </summary>
public static class BoundaryCursor
{
    public static string Encode(DateTime boundary, IEnumerable<Guid> ids)
    {
        var raw = $"{boundary.Ticks}|{string.Join(',', ids)}";
        return Convert.ToBase64String(Encoding.UTF8.GetBytes(raw)).Replace('+', '-').Replace('/', '_').TrimEnd('=');
    }

    public static (DateTime Boundary, HashSet<Guid> Ids) Decode(string cursor)
    {
        try
        {
            var raw = Encoding.UTF8.GetString(Convert.FromBase64String(PadBase64(cursor)));
            var parts = raw.Split('|', 2);
            if (parts.Length != 2 || !long.TryParse(parts[0], out var ticks)) throw new FormatException();
            var boundary = new DateTime(ticks, DateTimeKind.Utc);
            var ids = parts[1].Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Select(s => Guid.Parse(s)).ToHashSet();
            return (boundary, ids);
        }
        catch
        {
            throw new BadRequestException("Con trỏ phân trang không hợp lệ.");
        }
    }

    private static string PadBase64(string base64Url)
    {
        var s = base64Url.Replace('-', '+').Replace('_', '/');
        return s.PadRight(s.Length + (4 - s.Length % 4) % 4, '=');
    }
}
