using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using GMind.Application.Services.Auth;
using GMind.Domain.Entities;
using GMind.Infrastructure.Persistence;
using GMind.Infrastructure.Workers;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Task = System.Threading.Tasks.Task;

namespace GMind.Tests;

public class AccountAuthorizationTests
{
    private const string Password = "AccountTest123!";

    private sealed class Fixture : IAsyncDisposable
    {
        public required WebApplicationFactory<Program> Factory { get; init; }
        public required User A { get; init; }
        public required User B { get; init; }
        public HttpClient Anonymous() => Factory.CreateClient();

        public async Task<HttpClient> ClientAsync()
        {
            var client = Anonymous();
            var login = await client.PostAsJsonAsync("/api/auth/login", new { email = A.Email, password = Password });
            Assert.Equal(HttpStatusCode.OK, login.StatusCode);
            using var json = JsonDocument.Parse(await login.Content.ReadAsStringAsync());
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer",
                json.RootElement.GetProperty("data").GetProperty("accessToken").GetString());
            return client;
        }

        public async Task<User> ReadAsync(Guid id)
        {
            await using var scope = Factory.Services.CreateAsyncScope();
            return await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().Users.AsNoTracking().SingleAsync(u => u.Id == id);
        }

        public async Task DeactivateAsync()
        {
            await using var scope = Factory.Services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await db.Users.SingleAsync(u => u.Id == A.Id)).IsActive = false;
            await db.SaveChangesAsync();
        }

        public ValueTask DisposeAsync() => Factory.DisposeAsync();
    }

    private static async Task<Fixture> SeedAsync()
    {
        var dbName = $"account-{Guid.NewGuid()}";
        var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Issuer"] = "AccountTests", ["Jwt:Audience"] = "AccountTests",
                ["Jwt:Secret"] = "account-test-signing-key-at-least-32-characters!",
                ["ConnectionStrings:DefaultConnection"] = "Server=(localdb)\\mssqllocaldb;Database=AccountTests_NeverUsed;Trusted_Connection=True;TrustServerCertificate=True;"
            }));
            builder.ConfigureServices(services =>
            {
                var worker = services.SingleOrDefault(d => d.ImplementationType == typeof(ReminderWorker));
                if (worker is not null) services.Remove(worker);
                services.RemoveAll<DbContextOptions<ApplicationDbContext>>();
                services.RemoveAll<Microsoft.EntityFrameworkCore.Infrastructure.IDbContextOptionsConfiguration<ApplicationDbContext>>();
                services.AddDbContext<ApplicationDbContext>(options => options.UseInMemoryDatabase(dbName));
            });
        });
        var a = new User { Id = Guid.NewGuid(), DisplayName = "Account A", Email = $"a{Guid.NewGuid():N}@test.dev",
            PasswordHash = new PasswordHasher().HashPassword(Password), AvatarUrl = "https://example.com/old.png" };
        var b = new User { Id = Guid.NewGuid(), DisplayName = "Account B", Email = $"b{Guid.NewGuid():N}@test.dev",
            PasswordHash = new PasswordHasher().HashPassword(Password) };
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        db.Users.AddRange(a, b);
        await db.SaveChangesAsync();
        return new Fixture { Factory = factory, A = a, B = b };
    }

    [Fact]
    public async Task Profile_UsesClaimIdentity_IgnoresEmailRoleAndUserId_ReturnsOnlySafeInfo()
    {
        await using var f = await SeedAsync();
        using var client = await f.ClientAsync();
        var before = await f.ReadAsync(f.A.Id);
        var response = await client.PatchAsJsonAsync("/api/me", new
        {
            displayName = " Updated A ", avatarUrl = " https://example.com/a@b.png?x=y@z ",
            userId = f.B.Id, email = f.B.Email, role = "Leader"
        });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = json.RootElement.GetProperty("data");
        Assert.Equal(f.A.Id, data.GetProperty("id").GetGuid());
        Assert.Equal("Updated A", data.GetProperty("displayName").GetString());
        Assert.Equal(f.A.Email, data.GetProperty("email").GetString());
        Assert.False(data.TryGetProperty("passwordHash", out _));
        Assert.False(data.TryGetProperty("refreshToken", out _));
        var saved = await f.ReadAsync(f.A.Id);
        Assert.Equal("https://example.com/a@b.png?x=y@z", saved.AvatarUrl);
        Assert.Equal(before.AuthVersion, saved.AuthVersion);
        Assert.Equal(before.PasswordHash, saved.PasswordHash);
        Assert.Equal(before.RefreshToken, saved.RefreshToken);
        var other = await f.ReadAsync(f.B.Id);
        Assert.Equal("Account B", other.DisplayName);
        Assert.Equal(f.B.Email, other.Email);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/me")).StatusCode);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("ftp://example.com/a.png")]
    [InlineData("javascript:alert(1)")]
    [InlineData("https://user:password@example.com/a.png")]
    [InlineData("https://example.com/a\nb")]
    [InlineData("\t\n")]
    public async Task InvalidAvatar_IsRejectedWithoutMutation(string url)
    {
        await using var f = await SeedAsync();
        using var client = await f.ClientAsync();
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PatchAsJsonAsync("/api/me", new { displayName = "Bad", avatarUrl = url })).StatusCode);
        var user = await f.ReadAsync(f.A.Id);
        Assert.Equal(f.A.DisplayName, user.DisplayName);
        Assert.Equal(f.A.AvatarUrl, user.AvatarUrl);
    }

    [Fact]
    public async Task RequiredAndLengthBoundaries_AreEnforced_AndNullRemovesAvatar()
    {
        await using var f = await SeedAsync();
        using var client = await f.ClientAsync();
        foreach (var name in new[] { "", "   ", new string('a', 101) })
            Assert.Equal(HttpStatusCode.BadRequest,
                (await client.PatchAsJsonAsync("/api/me", new { displayName = name, avatarUrl = (string?)null })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PatchAsJsonAsync("/api/me", new { displayName = "A", avatarUrl = "https://example.com/" + new string('x', 500) })).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await client.PatchAsJsonAsync("/api/me", new { displayName = new string('a', 100), avatarUrl = (string?)null })).StatusCode);
        Assert.Null((await f.ReadAsync(f.A.Id)).AvatarUrl);
    }

    [Theory]
    [InlineData("short", "short")]
    [InlineData("NewTest123!", "Different123!")]
    [InlineData("", "")]
    public async Task InvalidNewPassword_DoesNotChangeCredentials(string next, string confirm)
    {
        await using var f = await SeedAsync();
        using var client = await f.ClientAsync();
        var before = await f.ReadAsync(f.A.Id);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PatchAsJsonAsync("/api/me/password",
            new { currentPassword = Password, newPassword = next, confirmPassword = confirm })).StatusCode);
        var after = await f.ReadAsync(f.A.Id);
        Assert.Equal(before.PasswordHash, after.PasswordHash);
        Assert.Equal(before.AuthVersion, after.AuthVersion);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/me")).StatusCode);
    }

    [Fact]
    public async Task AnonymousAndInactiveSessions_CannotModifyProfileOrPassword()
    {
        await using var f = await SeedAsync();
        using var anonymous = f.Anonymous();
        using var current = await f.ClientAsync();
        foreach (var client in new[] { anonymous, current })
        {
            if (client == current) await f.DeactivateAsync();
            Assert.Equal(HttpStatusCode.Unauthorized,
                (await client.PatchAsJsonAsync("/api/me", new { displayName = "Denied", avatarUrl = (string?)null })).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await client.PatchAsJsonAsync("/api/me/password",
                new { currentPassword = Password, newPassword = "NewTest123!", confirmPassword = "NewTest123!" })).StatusCode);
        }
    }
}
