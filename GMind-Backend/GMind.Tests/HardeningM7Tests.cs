using System.Net;
using System.Text.Json;
using GMind.Infrastructure.Persistence;
using GMind.Infrastructure.Workers;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;
using Task = System.Threading.Tasks.Task;

namespace GMind.Tests;

/// <summary>Stage 2 M7 — startup config validation, security headers, HSTS, exception hygiene.</summary>
public class HardeningM7Tests
{
    private const string StrongSecret = "m7-hardening-secret-7f3b9c1e4a5d8f20b6c1e9a4d7f3";
    private const string DevPlaceholder = "GMind_Dev_Only_Secret_Change_Me_In_Production_MinLen32";

    // ---------- StartupConfigurationValidator unit tests ----------

    private sealed class TestEnv(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "GMind.Tests";
        public string ContentRootPath { get; set; } = "";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private static IConfiguration Cfg(Dictionary<string, string?> values)
        => new ConfigurationBuilder().AddInMemoryCollection(values).Build();

    private static Dictionary<string, string?> ValidJwt() => new()
    {
        ["Jwt:Secret"] = StrongSecret,
        ["Jwt:Issuer"] = "GMind",
        ["Jwt:Audience"] = "GMind",
        ["Jwt:ExpiryMinutes"] = "60",
        ["Jwt:RefreshTokenExpiryDays"] = "7",
    };

    private static void AssertValid(string env, Dictionary<string, string?> overrides)
    {
        var cfg = Cfg(overrides);
        GMind.API.Common.StartupConfigurationValidator.Validate(cfg, new TestEnv(env));
    }

    private static InvalidOperationException AssertInvalid(string env, Dictionary<string, string?> overrides)
        => Assert.Throws<InvalidOperationException>(() => AssertValid(env, overrides));

    [Fact]
    public void Validator_ValidConfig_Passes_DevAndProd()
    {
        AssertValid("Development", ValidJwt());
        AssertValid("Production", ValidJwt());
    }

    [Fact]
    public void Validator_MissingSecret_Throws()
    {
        var v = ValidJwt(); v.Remove("Jwt:Secret");
        var ex = AssertInvalid("Production", v);
        Assert.Contains("Jwt:Secret", ex.Message);
    }

    [Fact]
    public void Validator_WhitespaceSecret_Throws()
    {
        var v = ValidJwt(); v["Jwt:Secret"] = "   ";
        Assert.Contains("Jwt:Secret", AssertInvalid("Development", v).Message);
    }

    [Fact]
    public void Validator_ShortSecret_Throws_At32ByteBoundary()
    {
        var v = ValidJwt(); v["Jwt:Secret"] = new string('a', 31);
        Assert.Contains("Jwt:Secret", AssertInvalid("Development", v).Message);
        v["Jwt:Secret"] = new string('a', 32);
        AssertValid("Development", v);
    }

    [Fact]
    public void Validator_DevPlaceholder_AllowedInDev_RejectedInProd()
    {
        var v = ValidJwt(); v["Jwt:Secret"] = DevPlaceholder;
        AssertValid("Development", v);
        var ex = AssertInvalid("Production", v);
        Assert.Contains("Jwt:Secret", ex.Message);
        Assert.DoesNotContain(DevPlaceholder, ex.Message);
    }

    [Fact]
    public void Validator_ChangeMe_CaseInsensitive_RejectedInProd()
    {
        var v = ValidJwt(); v["Jwt:Secret"] = "prod-real-secret-change_me-1234567890ab";
        Assert.Contains("Jwt:Secret", AssertInvalid("Production", v).Message);
        v["Jwt:Secret"] = "prod-real-secret-CHANGE_ME-1234567890ab";
        Assert.Contains("Jwt:Secret", AssertInvalid("Production", v).Message);
        // Same value is fine in Development.
        AssertValid("Development", v);
    }

    [Fact]
    public void Validator_MissingIssuerAudience_Throws()
    {
        var v = ValidJwt(); v.Remove("Jwt:Issuer");
        Assert.Contains("Jwt:Issuer", AssertInvalid("Development", v).Message);
        v = ValidJwt(); v.Remove("Jwt:Audience");
        Assert.Contains("Jwt:Audience", AssertInvalid("Production", v).Message);
    }

    [Fact]
    public void Validator_InvalidExpiry_Throws_Absent_IsOk()
    {
        foreach (var bad in new[] { "abc", "0", "-3", "1.5" })
        {
            var v = ValidJwt(); v["Jwt:ExpiryMinutes"] = bad;
            Assert.Contains("Jwt:ExpiryMinutes", AssertInvalid("Development", v).Message);
        }
        var v2 = ValidJwt(); v2["Jwt:RefreshTokenExpiryDays"] = "seven";
        Assert.Contains("Jwt:RefreshTokenExpiryDays", AssertInvalid("Development", v2).Message);
        // Absent keys are allowed (defaults handled elsewhere).
        var v3 = ValidJwt(); v3.Remove("Jwt:ExpiryMinutes"); v3.Remove("Jwt:RefreshTokenExpiryDays");
        AssertValid("Production", v3);
    }

    [Fact]
    public void Validator_AllProblems_ListedOnce_InSingleException()
    {
        var ex = AssertInvalid("Production", new Dictionary<string, string?>());
        Assert.Contains("Jwt:Secret", ex.Message);
        Assert.Contains("Jwt:Issuer", ex.Message);
        Assert.Contains("Jwt:Audience", ex.Message);
        Assert.Contains("[1]", ex.Message);
        Assert.Contains("[3]", ex.Message);
        Assert.Equal(3, ex.Message.Split("[").Length - 1);
    }

    // ---------- Host-start behaviour ----------

    private static WebApplicationFactory<Program> Factory(
        string env, string? jwtSecret = StrongSecret, string? jwtIssuer = "GMindTests")
    {
        var overrides = new Dictionary<string, string?>
        {
            ["Jwt:Issuer"] = "GMindTests", ["Jwt:Audience"] = "GMindTests", ["Jwt:Secret"] = StrongSecret,
            ["RateLimiting:LoginPermitLimit"] = "500", ["RateLimiting:RecoveryPermitLimit"] = "500",
            ["ConnectionStrings:DefaultConnection"] =
                "Server=(localdb)\\mssqllocaldb;Database=GMind_M7Tests_NeverUsed;Trusted_Connection=True;TrustServerCertificate=True;",
            ["Auth:LocalMailboxPath"] = Path.Combine(Path.GetTempPath(), $"gm-m7box-{Guid.NewGuid():N}"),
            ["Auth:FrontendUrl"] = "http://localhost:5173",
        };

        return new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment(env);
            // Host-level settings are visible during Program.cs top-level statements
            // (StartupConfigurationValidator); ConfigureAppConfiguration merges later.
            if (jwtSecret is not null) builder.UseSetting("Jwt:Secret", jwtSecret);
            if (jwtIssuer is not null) builder.UseSetting("Jwt:Issuer", jwtIssuer);
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(overrides));
            builder.ConfigureServices(services =>
            {
                var worker = services.SingleOrDefault(d => d.ImplementationType == typeof(ReminderWorker));
                if (worker is not null) services.Remove(worker);
                services.RemoveAll<DbContextOptions<ApplicationDbContext>>();
                services.RemoveAll<Microsoft.EntityFrameworkCore.Infrastructure.IDbContextOptionsConfiguration<ApplicationDbContext>>();
                services.AddDbContext<ApplicationDbContext>(o => o.UseInMemoryDatabase($"m7-{Guid.NewGuid()}"));
            });
        });
    }

    private static InvalidOperationException StartupError(WebApplicationFactory<Program> f)
    {
        var thrown = Assert.ThrowsAny<Exception>(() => _ = f.Services);
        for (Exception? e = thrown; e is not null; e = e.InnerException)
            if (e is InvalidOperationException ioe) return ioe;
        throw thrown;
    }

    [Fact]
    public void Host_Production_PlaceholderSecret_FailsFast()
    {
        using var f = Factory("Production", jwtSecret: DevPlaceholder);
        var ex = StartupError(f);
        Assert.Contains("Jwt:Secret", ex.Message);
        Assert.DoesNotContain(DevPlaceholder, ex.Message);
    }

    [Fact]
    public void Host_Production_MissingSecret_FailsFast()
    {
        using var f = Factory("Production", jwtSecret: null);
        Assert.Contains("Jwt:Secret", StartupError(f).Message);
    }

    [Fact]
    public void Host_Production_ShortSecret_FailsFast()
    {
        var short31 = new string('k', 31);
        using var f = Factory("Production", jwtSecret: short31);
        var ex = StartupError(f);
        Assert.Contains("Jwt:Secret", ex.Message);
        Assert.DoesNotContain(short31, ex.Message);
    }

    [Fact]
    public void Host_Development_MissingIssuer_FailsFast()
    {
        using var f = Factory("Development", jwtIssuer: "");
        Assert.Contains("Jwt:Issuer", StartupError(f).Message);
    }

    private static void AssertSecurityHeaders(HttpResponseMessage res, bool expectCsp = true)
    {
        Assert.Equal("nosniff", string.Join(',', res.Headers.GetValues("X-Content-Type-Options")));
        Assert.Equal("DENY", string.Join(',', res.Headers.GetValues("X-Frame-Options")));
        Assert.Equal("strict-origin-when-cross-origin", string.Join(',', res.Headers.GetValues("Referrer-Policy")));
        Assert.Equal(expectCsp, res.Headers.Contains("Content-Security-Policy"));
        if (expectCsp)
            Assert.Contains("default-src 'none'", string.Join(',', res.Headers.GetValues("Content-Security-Policy")));
    }

    [Fact]
    public async Task Host_Production_HealthLive_HasSecurityHeaders()
    {
        using var f = Factory("Production");
        using var client = f.CreateClient(new WebApplicationFactoryClientOptions
        {
            // HSTS skips localhost hosts by default; use a non-excluded host so the header is emitted.
            BaseAddress = new Uri("https://api.gmind.test"),
            AllowAutoRedirect = false,
        });
        var res = await client.GetAsync("/api/health/live");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        AssertSecurityHeaders(res);
        Assert.True(res.Headers.Contains("Strict-Transport-Security"));
    }

    [Fact]
    public async Task Host_Development_HealthLive_HasSecurityHeaders()
    {
        using var f = Factory("Development");
        using var client = f.CreateClient();
        var res = await client.GetAsync("/api/health/live");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        AssertSecurityHeaders(res);
    }

    [Fact]
    public async Task Host_Development_Swagger_NoCsp_StillNosniff()
    {
        using var f = Factory("Development");
        using var client = f.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var res = await client.GetAsync("/swagger/index.html");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.False(res.Headers.Contains("Content-Security-Policy"));
        Assert.Equal("nosniff", string.Join(',', res.Headers.GetValues("X-Content-Type-Options")));
        Assert.True(res.Headers.Contains("X-Frame-Options"));
    }

    [Fact]
    public async Task Handler_UnhandledException_ReturnsGeneric500_NoDetails()
    {
        var handler = new GMind.API.Common.GlobalExceptionHandler(
            NullLogger<GMind.API.Common.GlobalExceptionHandler>.Instance);
        var ctx = new DefaultHttpContext();
        ctx.Response.Body = new MemoryStream();
        var handled = await handler.TryHandleAsync(ctx,
            new InvalidOperationException("sensitive internal detail: column Foo"),
            default);
        Assert.True(handled);
        Assert.Equal(StatusCodes.Status500InternalServerError, ctx.Response.StatusCode);
        ctx.Response.Body.Seek(0, SeekOrigin.Begin);
        var body = await new StreamReader(ctx.Response.Body).ReadToEndAsync();
        Assert.DoesNotContain("sensitive internal detail", body);
        Assert.DoesNotContain("InvalidOperationException", body);
        var json = JsonDocument.Parse(body).RootElement;
        Assert.False(json.GetProperty("success").GetBoolean());
        Assert.Equal("Đã có lỗi xảy ra. Vui lòng thử lại sau.", json.GetProperty("message").GetString());
    }
}
