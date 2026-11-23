using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using GMind.Application.Common;
using GMind.Application.Common.Exceptions;
using GMind.Application.Services.Auth;
using GMind.Application.Services.Notifications;
using GMind.Domain.Entities;
using GMind.Domain.Enums;
using GMind.Infrastructure.Persistence;
using GMind.Infrastructure.Workers;
using GMind.API.Realtime;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;
using TaskEntity = GMind.Domain.Entities.Task;
using Task = System.Threading.Tasks.Task;
using TaskStatus = GMind.Domain.Enums.TaskStatus;

namespace GMind.Tests;

/// <summary>Stage 2 M5 Part A — sessions, preferences, cursor page, email change, dev mailbox, realtime.</summary>
public class M5Tests
{
    private const string Secret = "test-secret-key-minimum-32-chars-long!";
    private const string Password = "Password123!";

    private sealed class RemoteIpFilter(string ip) : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
        {
            app.Use(async (ctx, n) =>
            {
                ctx.Connection.RemoteIpAddress = IPAddress.Parse(ip);
                await n();
            });
            next(app);
        };
    }

    private static WebApplicationFactory<Program> MakeFactory(
        string dbName, bool realtime = false, string env = "Development",
        string? remoteIp = null, string? mailboxPath = null)
    {
        var f = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment(env);
            // Host-level settings are visible during Program.cs top-level statements
            // (StartupConfigurationValidator); ConfigureAppConfiguration merges later.
            builder.UseSetting("Jwt:Secret", Secret);
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Issuer"] = "GMindTests", ["Jwt:Audience"] = "GMindTests", ["Jwt:Secret"] = Secret,
                ["Jwt:RefreshTokenExpiryDays"] = "7",
                ["RateLimiting:LoginPermitLimit"] = "500", ["RateLimiting:RecoveryPermitLimit"] = "500",
                ["ConnectionStrings:DefaultConnection"] =
                    "Server=(localdb)\\mssqllocaldb;Database=GMind_M5Tests_NeverUsed;Trusted_Connection=True;TrustServerCertificate=True;",
                ["Auth:LocalMailboxPath"] = mailboxPath ?? Path.Combine(Path.GetTempPath(), $"gm-m5box-{Guid.NewGuid():N}"),
                ["Auth:FrontendUrl"] = "http://localhost:5173",
            }));
            builder.ConfigureServices(services =>
            {
                var worker = services.SingleOrDefault(d => d.ImplementationType == typeof(ReminderWorker));
                if (worker is not null) services.Remove(worker);
                services.RemoveAll<DbContextOptions<ApplicationDbContext>>();
                services.RemoveAll<Microsoft.EntityFrameworkCore.Infrastructure.IDbContextOptionsConfiguration<ApplicationDbContext>>();
                services.AddDbContext<ApplicationDbContext>((sp, o) =>
                {
                    o.UseInMemoryDatabase(dbName);
                    if (realtime) o.AddInterceptors(sp.GetRequiredService<RealtimeChangeInterceptor>());
                });
                if (remoteIp is not null) services.AddSingleton<IStartupFilter>(new RemoteIpFilter(remoteIp));
            });
        });
        _ = f.Services;
        return f;
    }

    private static async Task<(WebApplicationFactory<Program> F, User U)> SeedUserAsync(bool realtime = false, string env = "Development", string? remoteIp = null, string? mailboxPath = null)
    {
        var f = MakeFactory($"m5-{Guid.NewGuid()}", realtime, env, remoteIp, mailboxPath);
        var user = new User
        {
            Id = Guid.NewGuid(), DisplayName = "M5 User",
            Email = $"m5{Guid.NewGuid():N}@test.dev",
            PasswordHash = new PasswordHasher().HashPassword(Password), IsActive = true
        };
        await using var scope = f.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return (f, user);
    }

    private static async Task<(string Access, string Refresh, Guid Sid)> LoginAsync(
        WebApplicationFactory<Program> f, string email, string password = Password, string? userAgent = null)
    {
        using var client = f.CreateClient();
        if (userAgent is not null) client.DefaultRequestHeaders.UserAgent.ParseAdd(userAgent);
        var r = await client.PostAsJsonAsync("/api/auth/login", new { email, password });
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        using var doc = JsonDocument.Parse(await r.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        var access = data.GetProperty("accessToken").GetString()!;
        var refresh = data.GetProperty("refreshToken").GetString()!;
        var sid = Guid.Parse(new JwtSecurityTokenHandler().ReadJwtToken(access).Claims
            .Single(c => c.Type == TokenService.SessionIdClaim).Value);
        return (access, refresh, sid);
    }

    private static HttpClient Client(WebApplicationFactory<Program> f, string? bearer = null)
    {
        var c = f.CreateClient();
        if (bearer is not null) c.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", bearer);
        return c;
    }

    // ─────────────── A1: sessions ───────────────

    [Fact]
    public async Task TwoLogins_TwoSessions_ListShowsMaskedIpDeviceAndCurrent()
    {
        var (f, u) = await SeedUserAsync(remoteIp: "203.0.113.77");
        await using var _ = f;
        var ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0";
        var (a1, _, sid1) = await LoginAsync(f, u.Email, userAgent: ua);
        var (a2, _, sid2) = await LoginAsync(f, u.Email, userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15");

        var sessions = await Client(f, a1).GetFromJsonAsync<JsonElement>("/api/me/sessions");
        var items = sessions.GetProperty("data").EnumerateArray().ToList();
        Assert.Equal(2, items.Count);
        Assert.Equal(sid1, items[0].GetProperty("id").GetGuid());
        Assert.True(items[0].GetProperty("isCurrent").GetBoolean());
        Assert.False(items[1].GetProperty("isCurrent").GetBoolean());
        Assert.Equal("203.0.113.0", items[0].GetProperty("ipAddress").GetString());
        Assert.Equal("Edge", items[0].GetProperty("browser").GetString());
        Assert.Equal("Windows", items[0].GetProperty("os").GetString());
        Assert.Equal("Edge trên Windows", items[0].GetProperty("deviceLabel").GetString());
        Assert.Equal(sid2, items[1].GetProperty("id").GetGuid());
        Assert.Equal("Safari", items[1].GetProperty("browser").GetString());
        Assert.Equal("macOS", items[1].GetProperty("os").GetString());
    }

    [Fact]
    public async Task Refresh_RotatesInPlace_SameSid_OldRefresh401()
    {
        var (f, u) = await SeedUserAsync();
        await using var _ = f;
        var (_, refresh, sid) = await LoginAsync(f, u.Email);
        using var client = f.CreateClient();
        var rotated = await client.PostAsJsonAsync("/api/auth/refresh", new { refreshToken = refresh });
        Assert.Equal(HttpStatusCode.OK, rotated.StatusCode);
        using var doc = JsonDocument.Parse(await rotated.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        var newAccess = data.GetProperty("accessToken").GetString()!;
        var newRefresh = data.GetProperty("refreshToken").GetString()!;
        var newSid = Guid.Parse(new JwtSecurityTokenHandler().ReadJwtToken(newAccess).Claims
            .Single(c => c.Type == TokenService.SessionIdClaim).Value);
        Assert.Equal(sid, newSid);
        Assert.NotEqual(refresh, newRefresh);
        Assert.Equal(HttpStatusCode.OK, (await Client(f, newAccess).GetAsync("/api/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await f.CreateClient().PostAsJsonAsync("/api/auth/refresh", new { refreshToken = refresh })).StatusCode);
    }

    [Fact]
    public async Task RevokeOther_KillsThatSession_CurrentKeepsWorking()
    {
        var (f, u) = await SeedUserAsync();
        await using var _ = f;
        var (a1, r1, sid1) = await LoginAsync(f, u.Email);
        var (a2, r2, sid2) = await LoginAsync(f, u.Email);

        Assert.Equal(HttpStatusCode.OK,
            (await Client(f, a1).DeleteAsync($"/api/me/sessions/{sid2}")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Client(f, a2).GetAsync("/api/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await f.CreateClient().PostAsJsonAsync("/api/auth/refresh", new { refreshToken = r2 })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Client(f, a1).GetAsync("/api/me")).StatusCode);

        // revoke-others from session 1 → also 200 and reports nothing left besides expired/revoked
        var res = await Client(f, a1).PostAsync("/api/me/sessions/revoke-others", null);
        var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        Assert.Equal(0, doc.RootElement.GetProperty("data").GetProperty("revoked").GetInt32());

        // unknown / other user's session id → 404
        Assert.Equal(HttpStatusCode.NotFound,
            (await Client(f, a1).DeleteAsync($"/api/me/sessions/{Guid.NewGuid()}")).StatusCode);
        // sid1 was not touched
        Assert.Equal(HttpStatusCode.OK, (await Client(f, a1).GetAsync("/api/me")).StatusCode);
        // revoked r1 unused — delete current session = logout
        Assert.Equal(HttpStatusCode.OK,
            (await Client(f, a1).DeleteAsync($"/api/me/sessions/{sid1}")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Client(f, a1).GetAsync("/api/me")).StatusCode);
    }

    [Fact]
    public async Task RevokeOthers_RevokesAllButCurrent()
    {
        var (f, u) = await SeedUserAsync();
        await using var _ = f;
        var (a1, r1, _) = await LoginAsync(f, u.Email);
        var (a2, r2, _) = await LoginAsync(f, u.Email);
        var (a3, r3, _) = await LoginAsync(f, u.Email);

        var res = await Client(f, a1).PostAsync("/api/me/sessions/revoke-others", null);
        var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        Assert.Equal(2, doc.RootElement.GetProperty("data").GetProperty("revoked").GetInt32());
        Assert.Equal(HttpStatusCode.Unauthorized, (await Client(f, a2).GetAsync("/api/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Client(f, a3).GetAsync("/api/me")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Client(f, a1).GetAsync("/api/me")).StatusCode);
    }

    [Fact]
    public async Task EleventhLogin_RevokesLeastRecentlyUsed()
    {
        var (f, u) = await SeedUserAsync();
        await using var _ = f;
        var tokens = new List<string>();
        for (var i = 0; i < 11; i++)
            tokens.Add((await LoginAsync(f, u.Email)).Access);

        var sessions = await Client(f, tokens[^1]).GetFromJsonAsync<JsonElement>("/api/me/sessions");
        Assert.Equal(10, sessions.GetProperty("data").GetArrayLength());
        Assert.Equal(HttpStatusCode.Unauthorized, (await Client(f, tokens[0]).GetAsync("/api/me")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Client(f, tokens[^1]).GetAsync("/api/me")).StatusCode);
    }

    [Fact]
    public async Task PasswordChange_RevokesAllSessions()
    {
        var (f, u) = await SeedUserAsync();
        await using var _ = f;
        var (a1, _, _) = await LoginAsync(f, u.Email);
        var (a2, _, _) = await LoginAsync(f, u.Email);
        Assert.Equal(HttpStatusCode.OK, (await Client(f, a1).PatchAsJsonAsync("/api/me/password",
            new { currentPassword = Password, newPassword = "NewPass123!", confirmPassword = "NewPass123!" })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Client(f, a1).GetAsync("/api/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Client(f, a2).GetAsync("/api/me")).StatusCode);
    }

    [Fact]
    public async Task TokenWithoutSid_Fails_And_AbsoluteExpiryEndsSession()
    {
        var (f, u) = await SeedUserAsync();
        await using var _ = f;
        var (access, _, sid) = await LoginAsync(f, u.Email);

        // No sid claim at all → 401
        var config = TestSessionTokens.JwtConfig(Secret);
        var legacy = new TokenService(config).GenerateAccessToken(u); // sessionId omitted → no sid
        Assert.Equal(HttpStatusCode.Unauthorized, (await Client(f, legacy).GetAsync("/api/me")).StatusCode);

        // Absolute expiry in the past → 401 even though sliding window is fresh
        await using (var scope = f.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var s = await db.UserSessions.FindAsync(sid);
            s!.AbsoluteExpiresAt = DateTime.UtcNow.AddMinutes(-1);
            await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.Unauthorized, (await Client(f, access).GetAsync("/api/me")).StatusCode);
    }

    // ─────────────── A1: pure parsers ───────────────

    [Theory]
    [InlineData("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0", "Edge", "Windows", "Edge trên Windows")]
    [InlineData("Mozilla/5.0 (Windows NT 10.0) Chrome/124.0 Safari/537.36 OPR/110.0.0.0", "Opera", "Windows", "Opera trên Windows")]
    [InlineData("Mozilla/5.0 (X11; Linux x86_64) Chrome/124.0.0.0 Safari/537.36", "Chrome", "Linux", "Chrome trên Linux")]
    [InlineData("Mozilla/5.0 (Android 14; Mobile) Gecko/124.0 Firefox/124.0", "Firefox", "Android", "Firefox trên Android")]
    [InlineData("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Version/17.4 Safari/605.1.15", "Safari", "macOS", "Safari trên macOS")]
    [InlineData("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Safari/604.1", "Safari", "iOS", "Safari trên iOS")]
    [InlineData("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) CriOS/124.0.0.0 Safari/604.1", "Chrome", "iOS", "Chrome trên iOS")]
    [InlineData("curl/8.0", "Trình duyệt không xác định", "hệ điều hành không xác định", "Thiết bị không xác định")]
    [InlineData("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Trình duyệt không xác định", "Windows", "Trình duyệt trên Windows")]
    [InlineData("Firefox/128.0", "Firefox", "hệ điều hành không xác định", "Firefox")]
    public void UserAgentParser_BrowserAndOs(string ua, string browser, string os, string label)
    {
        var (b, o) = UserAgentParser.Parse(ua);
        Assert.Equal(browser, b);
        Assert.Equal(os, o);
        Assert.Equal(label, UserAgentParser.DeviceLabel(ua));
    }

    [Theory]
    [InlineData("203.0.113.77", "203.0.113.0")]
    [InlineData("10.20.30.40", "10.20.30.0")]
    [InlineData("2001:db8:85a3:1234:5678:9abc:def0:1234", "2001:db8:85a3::")]
    [InlineData("::1", "localhost")]
    [InlineData("127.0.0.1", "localhost")]
    [InlineData("::ffff:127.0.0.1", "localhost")]
    [InlineData("::ffff:203.0.113.7", "203.0.113.0")]
    [InlineData("not-an-ip", null)]
    [InlineData(null, null)]
    public void ClientIpMask_MasksCorrectly(string? ip, string? expected)
        => Assert.Equal(expected, ClientIpMask.Mask(ip));

    // ─────────────── A2: preferences ───────────────

    [Fact]
    public async Task Preferences_DefaultsAllTrue_PutPersists()
    {
        var (f, u) = await SeedUserAsync();
        await using var _ = f;
        var (access, _, _) = await LoginAsync(f, u.Email);

        var get = await Client(f, access).GetFromJsonAsync<JsonElement>("/api/me/notification-preferences");
        var d = get.GetProperty("data");
        Assert.True(d.GetProperty("reminder3Days").GetBoolean());
        Assert.True(d.GetProperty("reminder1Day").GetBoolean());
        Assert.True(d.GetProperty("reminder3Hours").GetBoolean());
        Assert.True(d.GetProperty("overdueAlert").GetBoolean());

        var put = await Client(f, access).PutAsJsonAsync("/api/me/notification-preferences",
            new { reminder3Days = true, reminder1Day = false, reminder3Hours = true, overdueAlert = false });
        Assert.Equal(HttpStatusCode.OK, put.StatusCode);

        var again = await Client(f, access).GetFromJsonAsync<JsonElement>("/api/me/notification-preferences");
        var d2 = again.GetProperty("data");
        Assert.True(d2.GetProperty("reminder3Days").GetBoolean());
        Assert.False(d2.GetProperty("reminder1Day").GetBoolean());
        Assert.False(d2.GetProperty("overdueAlert").GetBoolean());
    }

    [Fact]
    public async Task ReminderWorker_SkipsDisabledWindow_StillSendsEnabled()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"m5-rem-{Guid.NewGuid()}").Options;
        await using var db = new ApplicationDbContext(options);
        var now = DateTime.UtcNow;
        var user = new User { Id = Guid.NewGuid(), DisplayName = "U", Email = "u@t.dev", PasswordHash = "x", IsActive = true };
        var group = new Group { Id = Guid.NewGuid(), Name = "G", CreatedByUserId = user.Id };
        var project = new Project { Id = Guid.NewGuid(), GroupId = group.Id, Name = "P", CreatedByUserId = user.Id };
        // t1 due in ~20h → inside the 1-day window (disabled); t2 due in ~50h → inside the 3-day window (enabled)
        var t1 = new TaskEntity { Id = Guid.NewGuid(), ProjectId = project.Id, Title = "t1", AssigneeUserId = user.Id, DeadlineAt = now.AddHours(20), Status = TaskStatus.InProgress, CreatedByUserId = user.Id };
        var t2 = new TaskEntity { Id = Guid.NewGuid(), ProjectId = project.Id, Title = "t2", AssigneeUserId = user.Id, DeadlineAt = now.AddHours(50), Status = TaskStatus.InProgress, CreatedByUserId = user.Id };
        db.Users.Add(user); db.Groups.Add(group); db.Projects.Add(project); db.Tasks.AddRange(t1, t2);
        db.NotificationPreferences.Add(new NotificationPreference
        { Id = Guid.NewGuid(), UserId = user.Id, Reminder1Day = false });
        await db.SaveChangesAsync();

        await ReminderProcessor.ProcessRemindersAsync(db, now, default);

        var deliveries = await db.ReminderDeliveries.ToListAsync();
        Assert.DoesNotContain(deliveries, d => d.TaskId == t1.Id && d.ReminderType == ReminderType.OneDayBefore);
        Assert.Contains(deliveries, d => d.TaskId == t2.Id && d.ReminderType == ReminderType.ThreeDaysBefore);
        Assert.DoesNotContain(await db.Notifications.ToListAsync(), n => n.RelatedEntityId == t1.Id);
    }

    // ─────────────── A3: cursor page ───────────────

    private static NotificationService NotifSvc(ApplicationDbContext db) => new(db);

    private static async Task<(ApplicationDbContext db, User me, Group g)> SeedNotifDbAsync()
    {
        var db = new ApplicationDbContext(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"m5-np-{Guid.NewGuid()}").Options);
        var me = new User { Id = Guid.NewGuid(), DisplayName = "Me", Email = "me@t.dev", PasswordHash = "x", IsActive = true };
        var other = new User { Id = Guid.NewGuid(), DisplayName = "O", Email = "o@t.dev", PasswordHash = "x", IsActive = true };
        var g = new Group { Id = Guid.NewGuid(), Name = "G", CreatedByUserId = me.Id };
        db.Users.AddRange(me, other); db.Groups.Add(g);
        db.GroupMembers.Add(new GroupMember { Id = Guid.NewGuid(), GroupId = g.Id, UserId = me.Id, Role = Role.Member, IsActive = true });
        await db.SaveChangesAsync();
        return (db, me, g);
    }

    private static Notification MakeNotif(Guid userId, Guid? groupId, DateTime createdAt, bool read = false)
        => new()
        {
            Id = Guid.NewGuid(), RecipientUserId = userId, GroupId = groupId,
            Type = NotificationType.TaskUpdated, Title = "t", Body = "b",
            CreatedAt = createdAt, ReadAt = read ? createdAt.AddMinutes(1) : null
        };

    [Fact]
    public async Task CursorPage_IdenticalTimestamps_NoDuplicatesNoSkips()
    {
        var (db, me, g) = await SeedNotifDbAsync();
        await using var _ = db;
        var stamp = new DateTime(2026, 11, 20, 10, 0, 0, DateTimeKind.Utc);
        // 3 notifications sharing CreatedAt, straddling a take=2 page boundary
        db.Notifications.AddRange(
            MakeNotif(me.Id, g.Id, stamp), MakeNotif(me.Id, g.Id, stamp), MakeNotif(me.Id, g.Id, stamp),
            MakeNotif(me.Id, g.Id, stamp.AddMinutes(-5)));
        await db.SaveChangesAsync();
        var svc = NotifSvc(db);

        var p1 = await svc.GetPageAsync(me.Id, false, null, 2, default);
        Assert.Equal(2, p1.Items.Count);
        Assert.NotNull(p1.NextCursor);
        var p2 = await svc.GetPageAsync(me.Id, false, p1.NextCursor, 2, default);
        Assert.Equal(2, p2.Items.Count);
        var all = p1.Items.Concat(p2.Items).Select(i => i.Id).ToList();
        Assert.Equal(4, all.Distinct().Count()); // no duplicates, no skips
    }

    [Fact]
    public async Task CursorPage_NewNotificationBetweenPages_DoesNotShiftPage2()
    {
        var (db, me, g) = await SeedNotifDbAsync();
        await using var _ = db;
        var stamp = DateTime.UtcNow;
        var n1 = MakeNotif(me.Id, g.Id, stamp);
        var n2 = MakeNotif(me.Id, g.Id, stamp.AddMinutes(-10));
        var n3 = MakeNotif(me.Id, g.Id, stamp.AddMinutes(-20));
        db.Notifications.AddRange(n1, n2, n3);
        await db.SaveChangesAsync();
        var svc = NotifSvc(db);

        var p1 = await svc.GetPageAsync(me.Id, false, null, 1, default);
        Assert.Equal(n1.Id, p1.Items[0].Id);

        // A newer notification arrives between pages
        db.Notifications.Add(MakeNotif(me.Id, g.Id, DateTime.UtcNow));
        await db.SaveChangesAsync();

        var p2 = await svc.GetPageAsync(me.Id, false, p1.NextCursor, 10, default);
        Assert.Equal(new[] { n2.Id, n3.Id }, p2.Items.Select(i => i.Id).ToArray());
        Assert.DoesNotContain(p2.Items, i => i.Id == n1.Id);
    }

    [Fact]
    public async Task CursorPage_UnreadOnly_MarkingPage1Read_DoesNotSkip()
    {
        var (db, me, g) = await SeedNotifDbAsync();
        await using var _ = db;
        var stamp = DateTime.UtcNow;
        var items = Enumerable.Range(0, 4)
            .Select(i => MakeNotif(me.Id, g.Id, stamp.AddMinutes(-i))).ToList();
        db.Notifications.AddRange(items);
        await db.SaveChangesAsync();
        var svc = NotifSvc(db);

        var p1 = await svc.GetPageAsync(me.Id, true, null, 2, default);
        Assert.Equal(2, p1.Items.Count);
        foreach (var item in p1.Items) await svc.MarkReadAsync(me.Id, item.Id, default);

        var p2 = await svc.GetPageAsync(me.Id, true, p1.NextCursor, 10, default);
        Assert.Equal(2, p2.Items.Count);
        Assert.All(p2.Items, i => Assert.False(i.IsRead));
        Assert.Equal(items.Skip(2).Select(x => x.Id), p2.Items.Select(x => x.Id));
    }

    [Fact]
    public async Task CursorPage_BadCursor_400_And_OtherUsersExcluded()
    {
        var (f, u) = await SeedUserAsync();
        await using var _ = f;
        var (access, _, _) = await LoginAsync(f, u.Email);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await Client(f, access).GetAsync("/api/notifications/page?cursor=%%%bad%%%")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await Client(f, access).GetAsync("/api/notifications/page?cursor=aGVsbG8")).StatusCode);

        // other user's notifications never appear
        await using (var scope = f.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            db.Notifications.Add(MakeNotif(Guid.NewGuid(), null, DateTime.UtcNow));
            await db.SaveChangesAsync();
        }
        var page = await Client(f, access).GetFromJsonAsync<JsonElement>("/api/notifications/page");
        Assert.Equal(0, page.GetProperty("data").GetProperty("items").GetArrayLength());
    }

    // ─────────────── A4: email change (service level) ───────────────

    private sealed class RecordingSender : IEmailSender
    {
        public bool IsAvailable { get; set; } = true;
        public List<EmailMessage> Sent { get; } = new();
        public Task SendAsync(EmailMessage m, CancellationToken ct = default) { Sent.Add(m); return Task.CompletedTask; }
        public string? TokenFor(string to) => Sent.LastOrDefault(m => m.To == to)?.Links.FirstOrDefault() is { } l
            ? Uri.UnescapeDataString(l.Url.Split("#token=")[1]) : null;
    }

    private static (AuthService svc, RecordingSender sender, ApplicationDbContext db, IConfiguration cfg) NewAuth()
    {
        var db = new ApplicationDbContext(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"m5-ec-{Guid.NewGuid()}").Options);
        var cfg = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:Secret"] = Secret, ["Jwt:Issuer"] = "GMindTests", ["Jwt:Audience"] = "GMindTests",
            ["Jwt:ExpiryMinutes"] = "60", ["Jwt:RefreshTokenExpiryDays"] = "7",
            ["Auth:FrontendUrl"] = "http://localhost:5173"
        }).Build();
        var sender = new RecordingSender();
        var svc = new AuthService(db, new PasswordHasher(), new TokenService(cfg), cfg,
            NullLogger<AuthService>.Instance, emailSender: sender);
        return (svc, sender, db, cfg);
    }

    [Fact]
    public async Task EmailChange_ErrorBranches()
    {
        var (svc, sender, db, _) = NewAuth();
        await using var _ = db;
        var user = await svc.RegisterAsync("U", "ec@test.dev", Password);

        // sender unavailable
        sender.IsAvailable = false;
        var ex = await Assert.ThrowsAsync<BadRequestException>(() =>
            svc.RequestEmailChangeAsync(user.Id, "new@test.dev", Password));
        Assert.Equal("Tính năng gửi email chưa được cấu hình.", ex.Message);
        sender.IsAvailable = true;

        // wrong password
        ex = await Assert.ThrowsAsync<BadRequestException>(() =>
            svc.RequestEmailChangeAsync(user.Id, "new@test.dev", "WrongPass1!"));
        Assert.Equal("Mật khẩu hiện tại không đúng.", ex.Message);

        // same as current (normalized)
        ex = await Assert.ThrowsAsync<BadRequestException>(() =>
            svc.RequestEmailChangeAsync(user.Id, "  EC@test.dev ", Password));
        Assert.Equal("Email mới phải khác email hiện tại.", ex.Message);

        // used by another user
        await svc.RegisterAsync("Other", "taken@test.dev", Password);
        var c = await Assert.ThrowsAsync<ConflictException>(() =>
            svc.RequestEmailChangeAsync(user.Id, "TAKEN@test.dev", Password));
        Assert.Equal("Email này đã được sử dụng cho tài khoản khác.", c.Message);
    }

    [Fact]
    public async Task EmailChange_FullFlow_PendingVerifyLogin()
    {
        var (svc, sender, db, _) = NewAuth();
        await using var _ = db;
        var user = await svc.RegisterAsync("U", "old@test.dev", Password);
        var login = await svc.LoginAsync("old@test.dev", Password); // sessions must survive

        var pending = await svc.RequestEmailChangeAsync(user.Id, "New@Test.dev", Password);
        Assert.Equal("new@test.dev", pending.PendingEmail);
        Assert.True(pending.ExpiresAt > DateTime.UtcNow.AddMinutes(55));

        var got = await svc.GetPendingEmailChangeAsync(user.Id, default);
        Assert.NotNull(got);
        Assert.Equal("new@test.dev", got!.PendingEmail);

        var token = sender.TokenFor("new@test.dev")!;
        Assert.False(string.IsNullOrEmpty(token));
        Assert.Contains("/verify-email#token=", sender.Sent.Last(m => m.To == "new@test.dev").Links[0].Url);

        var newEmail = await svc.VerifyEmailChangeAsync(token, default);
        Assert.Equal("new@test.dev", newEmail);

        // pending cleared, notification written, sessions untouched
        Assert.Null(await svc.GetPendingEmailChangeAsync(user.Id, default));
        var notif = await db.Notifications.SingleAsync();
        Assert.Equal(NotificationType.EmailChanged, notif.Type);
        Assert.Contains("new@test.dev", notif.Body);
        Assert.True(await db.UserSessions.AllAsync(s => s.RevokedAt == null));

        // notice mailed to the OLD address
        var notice = Assert.Single(sender.Sent, m => m.To == "old@test.dev");
        Assert.Equal("Email đăng nhập GMind đã được đổi", notice.Subject);

        // login with new email works; old fails
        var re = await svc.LoginAsync("new@test.dev", Password);
        Assert.False(string.IsNullOrEmpty(re.AccessToken));
        await Assert.ThrowsAsync<UnauthorizedException>(() => svc.LoginAsync("old@test.dev", Password));
    }

    [Fact]
    public async Task EmailChange_TokenSingleUse_Expired_Superseded()
    {
        var (svc, sender, db, _) = NewAuth();
        await using var _ = db;
        var user = await svc.RegisterAsync("U", "x@test.dev", Password);

        // superseded: request A, then request B cancels it
        await svc.RequestEmailChangeAsync(user.Id, "a@test.dev", Password);
        var tokenA = sender.TokenFor("a@test.dev")!;
        await svc.RequestEmailChangeAsync(user.Id, "b@test.dev", Password);
        var tokenB = sender.TokenFor("b@test.dev")!;
        var bad = await Assert.ThrowsAsync<BadRequestException>(() => svc.VerifyEmailChangeAsync(tokenA, default));
        Assert.Equal("Liên kết xác minh không hợp lệ hoặc đã hết hạn.", bad.Message);

        // consume B then replay → single use
        Assert.Equal("b@test.dev", await svc.VerifyEmailChangeAsync(tokenB, default));
        bad = await Assert.ThrowsAsync<BadRequestException>(() => svc.VerifyEmailChangeAsync(tokenB, default));
        Assert.Equal("Liên kết xác minh không hợp lệ hoặc đã hết hạn.", bad.Message);

        // expired
        await svc.RequestEmailChangeAsync(user.Id, "c@test.dev", Password);
        var tokenC = sender.TokenFor("c@test.dev")!;
        var req = await db.EmailChangeRequests.SingleAsync(r => r.NewEmail == "c@test.dev");
        req.ExpiresAt = DateTime.UtcNow.AddMinutes(-1);
        await db.SaveChangesAsync();
        bad = await Assert.ThrowsAsync<BadRequestException>(() => svc.VerifyEmailChangeAsync(tokenC, default));
        Assert.Equal("Liên kết xác minh không hợp lệ hoặc đã hết hạn.", bad.Message);

        // garbage token
        bad = await Assert.ThrowsAsync<BadRequestException>(() => svc.VerifyEmailChangeAsync("garbage", default));
        Assert.Equal("Liên kết xác minh không hợp lệ hoặc đã hết hạn.", bad.Message);
    }

    [Fact]
    public async Task EmailChange_TakenAtConfirm_409()
    {
        var (svc, sender, db, _) = NewAuth();
        await using var _ = db;
        var user = await svc.RegisterAsync("U", "y@test.dev", Password);
        await svc.RequestEmailChangeAsync(user.Id, "grab@test.dev", Password);
        var token = sender.TokenFor("grab@test.dev")!;
        await svc.RegisterAsync("Thief", "grab@test.dev", Password);
        var c = await Assert.ThrowsAsync<ConflictException>(() => svc.VerifyEmailChangeAsync(token, default));
        Assert.Equal("Email này đã được sử dụng cho tài khoản khác.", c.Message);
    }

    [Fact]
    public async Task EmailChange_Api_EndToEnd_ViaMailbox()
    {
        var mailbox = Path.Combine(Path.GetTempPath(), $"gm-m5box-{Guid.NewGuid():N}");
        try
        {
            var (f, u) = await SeedUserAsync(mailboxPath: mailbox);
            await using var _ = f;
            var (access, _, _) = await LoginAsync(f, u.Email);
            var client = Client(f, access);
            var newEmail = $"new{Guid.NewGuid():N}@test.dev";

            // invalid format → 400
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/me/email-change",
                new { newEmail = "not-an-email", currentPassword = Password })).StatusCode);

            var res = await client.PostAsJsonAsync("/api/me/email-change",
                new { newEmail, currentPassword = Password });
            Assert.Equal(HttpStatusCode.OK, res.StatusCode);

            // read token from the dev mailbox json
            var meta = await WaitForMailboxJsonAsync(mailbox, newEmail);
            var url = meta.GetProperty("links")[0].GetProperty("url").GetString()!;
            var token = Uri.UnescapeDataString(url.Split("#token=")[1]);

            var verify = await f.CreateClient().PostAsJsonAsync("/api/auth/verify-email-change", new { token });
            Assert.Equal(HttpStatusCode.OK, verify.StatusCode);

            Assert.Equal(HttpStatusCode.OK, (await f.CreateClient().PostAsJsonAsync("/api/auth/login",
                new { email = newEmail, password = Password })).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await f.CreateClient().PostAsJsonAsync("/api/auth/login",
                new { email = u.Email, password = Password })).StatusCode);

            // notice to old address is also in the mailbox
            await WaitForMailboxJsonAsync(mailbox, u.Email);
        }
        finally
        {
            if (Directory.Exists(mailbox)) Directory.Delete(mailbox, true);
        }
    }

    private static async Task<JsonElement> WaitForMailboxJsonAsync(string dir, string to)
    {
        for (var i = 0; i < 50; i++)
        {
            if (Directory.Exists(dir))
            {
                foreach (var file in Directory.GetFiles(dir, "*.json"))
                {
                    using var doc = JsonDocument.Parse(await File.ReadAllTextAsync(file));
                    if (doc.RootElement.GetProperty("to").GetString() == to)
                        return doc.RootElement.Clone();
                }
            }
            await Task.Delay(100);
        }
        throw new InvalidOperationException($"No mailbox json for {to} in {dir}");
    }

    // ─────────────── A4: dev mailbox endpoints ───────────────

    [Fact]
    public async Task DevMailbox_Loopback_ListAndDetail()
    {
        var mailbox = Path.Combine(Path.GetTempPath(), $"gm-m5box-{Guid.NewGuid():N}");
        try
        {
            var (f, u) = await SeedUserAsync(remoteIp: "127.0.0.1", mailboxPath: mailbox);
            await using var _ = f;
            // send a mail through the real flow
            await f.CreateClient().PostAsJsonAsync("/api/auth/forgot-password", new { email = u.Email });
            await WaitForMailboxJsonAsync(mailbox, u.Email);

            var client = f.CreateClient();
            var list = await client.GetFromJsonAsync<JsonElement>("/api/dev/mailbox");
            var items = list.EnumerateArray().ToList();
            var item = items.First(i => i.GetProperty("to").GetString() == u.Email);
            var id = item.GetProperty("id").GetString()!;

            var detail = await client.GetFromJsonAsync<JsonElement>($"/api/dev/mailbox/{id}");
            Assert.Equal(u.Email, detail.GetProperty("meta").GetProperty("to").GetString());
            Assert.Contains("/reset-password#token=", detail.GetProperty("html").GetString());

            Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/dev/mailbox/nothex")).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound,
                (await client.GetAsync($"/api/dev/mailbox/../{id}")).StatusCode);
        }
        finally
        {
            if (Directory.Exists(mailbox)) Directory.Delete(mailbox, true);
        }
    }

    [Fact]
    public async Task DevMailbox_NonLoopback_404()
    {
        var mailbox = Path.Combine(Path.GetTempPath(), $"gm-m5box-{Guid.NewGuid():N}");
        var (f, _) = await SeedUserAsync(remoteIp: "203.0.113.9", mailboxPath: mailbox);
        await using var __ = f;
        var client = f.CreateClient();
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/dev/mailbox")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.GetAsync($"/api/dev/mailbox/{Guid.NewGuid():N}")).StatusCode);
    }

    [Fact]
    public async Task DevMailbox_Production_NotMapped()
    {
        var (f, _) = await SeedUserAsync(env: "Production", remoteIp: "127.0.0.1");
        await using var __ = f;
        var client = f.CreateClient();
        // https scheme bypasses the Production https-redirect so we hit routing directly
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.GetAsync("https://localhost/api/dev/mailbox")).StatusCode);
    }

    // ─────────────── A5: realtime ───────────────

    private sealed class ThrowOnSave : SaveChangesInterceptor
    {
        public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
            DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
            => throw new InvalidOperationException("boom");
    }

    [Fact]
    public async Task Interceptor_BatchesNotificationAndChangeIds_NothingOnFailure()
    {
        var outbox = new RealtimeOutbox(NullLogger<RealtimeOutbox>.Instance);
        var interceptor = new RealtimeChangeInterceptor(outbox);
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"m5-ic-{Guid.NewGuid()}")
            .AddInterceptors(interceptor)
            .Options;
        await using (var db = new ApplicationDbContext(options))
        {
            var u = new User { Id = Guid.NewGuid(), DisplayName = "U", Email = "u@t.dev", PasswordHash = "x" };
            var g = new Group { Id = Guid.NewGuid(), Name = "G", CreatedByUserId = u.Id };
            var p = new Project { Id = Guid.NewGuid(), GroupId = g.Id, Name = "P", CreatedByUserId = u.Id };
            var t = new TaskEntity { Id = Guid.NewGuid(), ProjectId = p.Id, Title = "T", CreatedByUserId = u.Id };
            db.Users.Add(u); db.Groups.Add(g); db.Projects.Add(p); db.Tasks.Add(t);
            db.Notifications.Add(new Notification
            {
                Id = Guid.NewGuid(), RecipientUserId = u.Id, GroupId = g.Id,
                Type = NotificationType.TaskAssigned, Title = "ti", Body = "bo"
            });
            await db.SaveChangesAsync();

            Assert.True(outbox.Reader.TryRead(out var batch));
            var n = Assert.Single(batch!.Notifications);
            Assert.Equal(u.Id, n.RecipientUserId);
            Assert.Equal(NotificationType.TaskAssigned, n.Type);
            Assert.Contains(t.Id, batch.TaskIds);
            Assert.Contains(p.Id, batch.ProjectIds);
            Assert.Contains(g.Id, batch.GroupIds);
        }

        // failed save → nothing enqueued
        var outbox2 = new RealtimeOutbox(NullLogger<RealtimeOutbox>.Instance);
        var interceptor2 = new RealtimeChangeInterceptor(outbox2);
        var options2 = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"m5-ic2-{Guid.NewGuid()}")
            .AddInterceptors(new ThrowOnSave(), interceptor2)
            .Options;
        await using (var db = new ApplicationDbContext(options2))
        {
            db.Notifications.Add(new Notification
            {
                Id = Guid.NewGuid(), RecipientUserId = Guid.NewGuid(),
                Type = NotificationType.TaskAssigned, Title = "x", Body = "x"
            });
            await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
            Assert.False(outbox2.Reader.TryRead(out _));
        }
    }

    private sealed class FakeClientProxy(FakeHubContext owner, string kind, string key) : IClientProxy
    {
        public Task SendCoreAsync(string method, object?[] args, CancellationToken cancellationToken = default)
        {
            owner.Sent.Add((kind, key, method, args.FirstOrDefault()));
            return Task.CompletedTask;
        }
    }

    private sealed class FakeHubClients(FakeHubContext owner) : IHubClients
    {
        public IClientProxy All => new FakeClientProxy(owner, "all", "");
        public IClientProxy AllExcept(IReadOnlyList<string> excludedConnectionIds) => All;
        public IClientProxy Client(string connectionId) => new FakeClientProxy(owner, "client", connectionId);
        public IClientProxy Clients(IReadOnlyList<string> connectionIds) => new FakeClientProxy(owner, "clients", string.Join(',', connectionIds));
        public IClientProxy Group(string groupName) => new FakeClientProxy(owner, "group", groupName);
        public IClientProxy GroupExcept(string groupName, IReadOnlyList<string> excludedConnectionIds) => Group(groupName);
        public IClientProxy Groups(IReadOnlyList<string> groupNames) => new FakeClientProxy(owner, "groups", string.Join(',', groupNames));
        public IClientProxy User(string userId) => new FakeClientProxy(owner, "user", userId);
        public IClientProxy Users(IReadOnlyList<string> userIds) => new FakeClientProxy(owner, "users", string.Join(',', userIds));
    }

    private sealed class FakeHubContext : IHubContext<RealtimeHub>
    {
        public List<(string Kind, string Key, string Method, object? Arg)> Sent { get; } = new();
        public IHubClients Clients => new FakeHubClients(this);
        public IGroupManager Groups => throw new NotImplementedException();
    }

    [Fact]
    public async Task Dispatcher_RecipientResolution_And_UnreadCounts()
    {
        var dbName = $"m5-dsp-{Guid.NewGuid()}";
        var services = new ServiceCollection()
            .AddDbContext<ApplicationDbContext>(o => o.UseInMemoryDatabase(dbName))
            .BuildServiceProvider();

        Guid memberId = Guid.NewGuid(), outsiderId = Guid.NewGuid(), archivedUserId = Guid.NewGuid();
        var member = new User { Id = memberId, DisplayName = "M", Email = "m@t.dev", PasswordHash = "x", IsActive = true };
        var outsider = new User { Id = outsiderId, DisplayName = "O", Email = "o@t.dev", PasswordHash = "x", IsActive = true };
        var archivedUser = new User { Id = archivedUserId, DisplayName = "AU", Email = "au@t.dev", PasswordHash = "x", IsActive = true };
        var g = new Group { Id = Guid.NewGuid(), Name = "G", CreatedByUserId = memberId };
        var gArchived = new Group { Id = Guid.NewGuid(), Name = "GA", CreatedByUserId = memberId, IsArchived = true, ArchivedAt = DateTime.UtcNow };
        var p = new Project { Id = Guid.NewGuid(), GroupId = g.Id, Name = "P", CreatedByUserId = memberId };
        var t = new TaskEntity { Id = Guid.NewGuid(), ProjectId = p.Id, Title = "T", CreatedByUserId = memberId };
        await using (var scope = services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            db.Users.AddRange(member, outsider, archivedUser);
            db.Groups.AddRange(g, gArchived); db.Projects.Add(p); db.Tasks.Add(t);
            db.GroupMembers.AddRange(
                new GroupMember { Id = Guid.NewGuid(), GroupId = g.Id, UserId = memberId, IsActive = true },
                new GroupMember { Id = Guid.NewGuid(), GroupId = gArchived.Id, UserId = archivedUserId, IsActive = true },
                new GroupMember { Id = Guid.NewGuid(), GroupId = g.Id, UserId = outsiderId, IsActive = false });
            // two unread visible notifications for the member → unreadCount 3 after the pushed one
            db.Notifications.AddRange(
                MakeNotif(memberId, g.Id, DateTime.UtcNow),
                MakeNotif(memberId, g.Id, DateTime.UtcNow));
            await db.SaveChangesAsync();
        }

        var outbox = new RealtimeOutbox(NullLogger<RealtimeOutbox>.Instance);
        var hub = new FakeHubContext();
        var dispatcher = new RealtimeDispatcher(services, outbox, hub, NullLogger<RealtimeDispatcher>.Instance);
        var pushed = new Notification
        {
            Id = Guid.NewGuid(), RecipientUserId = memberId, GroupId = g.Id,
            Type = NotificationType.TaskAssigned, Title = "ti", Body = "bo", CreatedAt = DateTime.UtcNow
        };
        var invisibleToOutsider = new Notification
        {
            Id = Guid.NewGuid(), RecipientUserId = outsiderId, GroupId = g.Id,
            Type = NotificationType.TaskAssigned, Title = "ti", Body = "bo", CreatedAt = DateTime.UtcNow
        };
        outbox.Enqueue(new RealtimeBatch(
            [
                new RealtimeAddedNotification(pushed.Id, memberId, g.Id, pushed.Type, pushed.Title, pushed.Body, null, null, pushed.CreatedAt),
                new RealtimeAddedNotification(invisibleToOutsider.Id, outsiderId, g.Id, invisibleToOutsider.Type, invisibleToOutsider.Title, invisibleToOutsider.Body, null, null, invisibleToOutsider.CreatedAt)
            ],
            [t.Id], [p.Id], [gArchived.Id], [gArchived.Id], []));

        await dispatcher.StartAsync(default);
        var deadline = DateTime.UtcNow.AddSeconds(10);
        while (hub.Sent.Count < 3 && DateTime.UtcNow < deadline) await Task.Delay(50);
        await dispatcher.StopAsync(default);

        // changed: member gets it; archived member gets it (group was just archived); outsider is inactive → never
        var changed = hub.Sent.Where(s => s.Method == "changed").ToList();
        Assert.Contains(changed, s => s.Key.Split(',').Contains(memberId.ToString()));
        Assert.Contains(changed, s => s.Key.Split(',').Contains(archivedUserId.ToString()));
        Assert.DoesNotContain(changed, s => s.Key.Contains(outsiderId.ToString()));

        // notification: member gets it with unreadCount=3 (2 seeded + this one not yet stored — counted from seeded only)
        var notif = hub.Sent.Where(s => s.Method == "notification").ToList();
        var toMember = Assert.Single(notif, s => s.Key == memberId.ToString());
        var unread = toMember.Arg!.GetType().GetProperty("unreadCount")!.GetValue(toMember.Arg);
        Assert.Equal(2, unread);
        // outsider's notification was not visible (inactive membership) → not pushed
        Assert.DoesNotContain(notif, s => s.Key == outsiderId.ToString());
    }

    [Fact]
    public async Task Hub_Negotiate401_ThenConnects_And_ReceivesNotificationAndRevoked()
    {
        var (f, u) = await SeedUserAsync(realtime: true);
        await using var _ = f;
        var (access, _, _) = await LoginAsync(f, u.Email);

        // negotiate without a token → 401
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await f.CreateClient().PostAsync("/hubs/realtime/negotiate?negotiateVersion=1", null)).StatusCode);

        var notified = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        var revoked2 = new TaskCompletionSource<object?>(TaskCreationOptions.RunContinuationsAsynchronously);
        var connection = new HubConnectionBuilder()
            .WithUrl(new Uri(f.Server.BaseAddress, $"/hubs/realtime?access_token={Uri.EscapeDataString(access)}"), o =>
            {
                o.HttpMessageHandlerFactory = _ => f.Server.CreateHandler();
                o.Transports = HttpTransportType.LongPolling;
            })
            .Build();
        connection.On<JsonElement>("notification", n => notified.TrySetResult(n));
        connection.On<JsonElement>("session-revoked", p => revoked2.TrySetResult(p));
        await connection.StartAsync();

        // trigger a notification through the same (intercepted) context
        await using (var scope = f.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            db.Notifications.Add(new Notification
            {
                Id = Guid.NewGuid(), RecipientUserId = u.Id, GroupId = null,
                Type = NotificationType.TaskAssigned, Title = "ping", Body = "body"
            });
            await db.SaveChangesAsync();
        }
        var received = await notified.Task.WaitAsync(TimeSpan.FromSeconds(15));
        Assert.Equal("TaskAssigned", received.GetProperty("type").GetString());
        Assert.Equal("ping", received.GetProperty("title").GetString());
        Assert.Equal(1, received.GetProperty("unreadCount").GetInt32());

        // logout → session-revoked pushed to this connection's session group
        Assert.Equal(HttpStatusCode.OK, (await Client(f, access).PostAsync("/api/auth/logout", null)).StatusCode);
        var rv = await revoked2.Task.WaitAsync(TimeSpan.FromSeconds(15));
        Assert.NotNull(rv);
        await connection.DisposeAsync();
    }
}
