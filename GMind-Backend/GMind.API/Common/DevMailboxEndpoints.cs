using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace GMind.API.Common;

/// <summary>
/// Local dev mailbox viewer — mapped only in Development and only reachable from loopback.
/// GET /api/dev/mailbox → latest 50 metadata; GET /api/dev/mailbox/{id} → { meta, html }.
/// </summary>
public static class DevMailboxEndpoints
{
    private static readonly Regex IdFormat = new("^[0-9a-fA-F]{32}$", RegexOptions.Compiled);

    public static void MapDevMailbox(this WebApplication app)
    {
        var group = app.MapGroup("/api/dev/mailbox").AllowAnonymous();

        group.MapGet("", (HttpContext ctx) =>
        {
            if (!IsLoopback(ctx)) return Results.NotFound();
            var path = DevelopmentMailbox.MailboxPath(ctx.RequestServices.GetRequiredService<IConfiguration>());
            if (!Directory.Exists(path)) return Results.Ok(Array.Empty<object>());
            var items = Directory.EnumerateFiles(path, "*.json")
                .Select(ReadMeta)
                .Where(m => m is not null)
                .OrderByDescending(m => m!.CreatedAt)
                .Take(50)
                .ToList();
            return Results.Ok(items);
        });

        group.MapGet("/{id}", (string id, HttpContext ctx) =>
        {
            if (!IsLoopback(ctx) || !IdFormat.IsMatch(id) || !Guid.TryParseExact(id, "N", out _))
                return Results.NotFound();
            var path = DevelopmentMailbox.MailboxPath(ctx.RequestServices.GetRequiredService<IConfiguration>());
            var jsonPath = Path.Combine(path, $"{id.ToLowerInvariant()}.json");
            var htmlPath = Path.Combine(path, $"{id.ToLowerInvariant()}.html");
            if (!File.Exists(jsonPath) || !File.Exists(htmlPath)) return Results.NotFound();
            var meta = ReadMeta(jsonPath);
            var html = File.ReadAllText(htmlPath);
            return Results.Ok(new { meta, html });
        });
    }

    private static bool IsLoopback(HttpContext ctx)
        => ctx.Connection.RemoteIpAddress is { } ip && IPAddress.IsLoopback(ip);

    private sealed record Meta(string Id, string To, string Subject, DateTime CreatedAt,
        IReadOnlyList<JsonElement> Links);

    private static Meta? ReadMeta(string jsonPath)
    {
        try
        {
            using var doc = JsonDocument.Parse(File.ReadAllText(jsonPath));
            var r = doc.RootElement;
            return new Meta(
                r.GetProperty("id").GetString()!,
                r.GetProperty("to").GetString()!,
                r.GetProperty("subject").GetString()!,
                r.GetProperty("createdAt").GetDateTime(),
                r.GetProperty("links").EnumerateArray().Select(e => e.Clone()).ToList());
        }
        catch { return null; }
    }
}
