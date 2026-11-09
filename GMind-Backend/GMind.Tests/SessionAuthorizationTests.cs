using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using GMind.Application.Services.Auth;
using GMind.Domain.Entities;
using GMind.Infrastructure.Persistence;
using GMind.Infrastructure.Workers;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.IdentityModel.Tokens;
using Xunit;
using Task = System.Threading.Tasks.Task;

namespace GMind.Tests;

public class SessionAuthorizationTests
{
    private const string Secret = "test-secret-key-minimum-32-chars-long!";
    private const string Password = "Password123!";

    private sealed class SaveGate : SaveChangesInterceptor
    {
        private int _entered;
        private volatile bool _armed;
        private readonly TaskCompletionSource _enteredSignal = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly TaskCompletionSource _releaseSignal = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public void Arm() => _armed = true;
        public Task WaitForTwoSavesAsync() => _enteredSignal.Task.WaitAsync(TimeSpan.FromSeconds(10));
        public void Release() => _releaseSignal.TrySetResult();

        public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(
            DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            if (_armed)
            {
                if (Interlocked.Increment(ref _entered) >= 2) _enteredSignal.TrySetResult();
                await _releaseSignal.Task.WaitAsync(TimeSpan.FromSeconds(10), cancellationToken);
            }
            return await base.SavingChangesAsync(eventData, result, cancellationToken);
        }
    }

    private sealed class Fixture : IAsyncDisposable
    {
        public required WebApplicationFactory<Program> Factory { get; init; }
        public required SaveGate Gate { get; init; }
        public required User User { get; init; }

        public HttpClient Client(string? bearer = null)
        {
            var client = Factory.CreateClient();
            if (bearer is not null)
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", bearer);
            return client;
        }

        public async Task<(string accessToken, string refreshToken)> LoginAsync(string password = Password)
        {
            using var client = Client();
            var response = await client.PostAsJsonAsync("/api/auth/login", new { email = User.Email, password });
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var data = doc.RootElement.GetProperty("data");
            return (data.GetProperty("accessToken").GetString()!, data.GetProperty("refreshToken").GetString()!);
        }

        public string BuildToken(IEnumerable<Claim> claims)
        {
            var token = new JwtSecurityToken(
                issuer: "GMindTests", audience: "GMindTests", claims: claims,
                expires: DateTime.UtcNow.AddMinutes(60),
                signingCredentials: new SigningCredentials(
                    new SymmetricSecurityKey(Encoding.UTF8.GetBytes(Secret)), SecurityAlgorithms.HmacSha256));
            return new JwtSecurityTokenHandler().WriteToken(token);
        }

        public async Task<int> AuthVersionAsync()
        {
            await using var scope = Factory.Services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            return await db.Users.Where(u => u.Id == User.Id).Select(u => u.AuthVersion).SingleAsync();
        }

        public async Task SetResetTokenAsync(string tokenHash, DateTime? expiry)
        {
            await using var scope = Factory.Services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var user = await db.Users.SingleAsync(u => u.Id == User.Id);
            user.PasswordResetToken = tokenHash;
            user.PasswordResetTokenExpiry = expiry;
            await db.SaveChangesAsync();
        }

        public async Task SetActiveAsync(bool active)
        {
            await using var scope = Factory.Services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var user = await db.Users.SingleAsync(u => u.Id == User.Id);
            user.IsActive = active;
            await db.SaveChangesAsync();
        }

        public async ValueTask DisposeAsync() => await Factory.DisposeAsync();
    }

    private static async Task<Fixture> SeedAsync(bool active = true)
    {
        var gate = new SaveGate();
        var dbName = $"session-{Guid.NewGuid()}";
        var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
            builder.ConfigureAppConfiguration((_, config) =>
            {
                config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["Jwt:Issuer"] = "GMindTests",
                    ["Jwt:Audience"] = "GMindTests",
                    ["Jwt:Secret"] = Secret,
                    ["ConnectionStrings:DefaultConnection"] =
                        "Server=(localdb)\\mssqllocaldb;Database=GMind_SessionTests_NeverUsed;Trusted_Connection=True;TrustServerCertificate=True;"
                });
            });
            builder.ConfigureServices(services =>
            {
                var worker = services.SingleOrDefault(d => d.ImplementationType == typeof(ReminderWorker));
                if (worker is not null) services.Remove(worker);
                services.RemoveAll<DbContextOptions<ApplicationDbContext>>();
                services.RemoveAll<Microsoft.EntityFrameworkCore.Infrastructure.IDbContextOptionsConfiguration<ApplicationDbContext>>();
                services.AddDbContext<ApplicationDbContext>(o => o.UseInMemoryDatabase(dbName).AddInterceptors(gate));
            });
        });
        _ = factory.Services;

        var user = new User
        {
            Id = Guid.NewGuid(), DisplayName = "Session User", Email = $"s{Guid.NewGuid():N}@test.dev",
            PasswordHash = new PasswordHasher().HashPassword(Password), IsActive = active
        };
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            db.Users.Add(user);
            await db.SaveChangesAsync();
        }
        return new Fixture { Factory = factory, Gate = gate, User = user };
    }

    private static string HashToken(string token)
        => Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    [Fact]
    public async Task Logout_RevokesAccessAndRefreshToken_AndBumpsAuthVersion()
    {
        await using var f = await SeedAsync();
        var (access, refresh) = await f.LoginAsync();
        Assert.Equal(HttpStatusCode.OK, (await f.Client(access).GetAsync("/api/me")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await f.Client(access).PostAsync("/api/auth/logout", null)).StatusCode);

        Assert.Equal(HttpStatusCode.Unauthorized, (await f.Client(access).GetAsync("/api/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await f.Client().PostAsJsonAsync("/api/auth/refresh", new { refreshToken = refresh })).StatusCode);
        Assert.Equal(1, await f.AuthVersionAsync());

        var (access2, _) = await f.LoginAsync();
        Assert.Equal(HttpStatusCode.OK, (await f.Client(access2).GetAsync("/api/me")).StatusCode);
    }

    [Fact]
    public async Task ChangePassword_RevokesOldSession_AllowsNewLogin()
    {
        await using var f = await SeedAsync();
        var (access, refresh) = await f.LoginAsync();
        var change = await f.Client(access).PatchAsJsonAsync("/api/me/password",
            new { currentPassword = Password, newPassword = "NewPass123!", confirmPassword = "NewPass123!" });
        Assert.Equal(HttpStatusCode.OK, change.StatusCode);

        Assert.Equal(HttpStatusCode.Unauthorized, (await f.Client(access).GetAsync("/api/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await f.Client().PostAsJsonAsync("/api/auth/refresh", new { refreshToken = refresh })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await f.Client().PostAsJsonAsync("/api/auth/login", new { email = f.User.Email, password = Password })).StatusCode);
        using var client = f.Client();
        Assert.Equal(HttpStatusCode.OK,
            (await client.PostAsJsonAsync("/api/auth/login", new { email = f.User.Email, password = "NewPass123!" })).StatusCode);
    }

    [Fact]
    public async Task ChangePassword_WrongCurrent_DoesNotRevokeSession()
    {
        await using var f = await SeedAsync();
        var (access, _) = await f.LoginAsync();
        var change = await f.Client(access).PatchAsJsonAsync("/api/me/password",
            new { currentPassword = "WrongPass1!", newPassword = "NewPass123!", confirmPassword = "NewPass123!" });
        Assert.Equal(HttpStatusCode.BadRequest, change.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await f.Client(access).GetAsync("/api/me")).StatusCode);
    }

    [Fact]
    public async Task ResetPassword_RevokesOldSession_TokenSingleUse()
    {
        await using var f = await SeedAsync();
        var (access, refresh) = await f.LoginAsync();
        var resetToken = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
        await f.SetResetTokenAsync(HashToken(resetToken), DateTime.UtcNow.AddHours(1));

        var reset = await f.Client().PostAsJsonAsync("/api/auth/reset-password",
            new { token = resetToken, newPassword = "ResetPass123!", confirmPassword = "ResetPass123!" });
        Assert.Equal(HttpStatusCode.OK, reset.StatusCode);

        Assert.Equal(HttpStatusCode.Unauthorized, (await f.Client(access).GetAsync("/api/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await f.Client().PostAsJsonAsync("/api/auth/refresh", new { refreshToken = refresh })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await f.Client().PostAsJsonAsync("/api/auth/reset-password",
                new { token = resetToken, newPassword = "Other123!", confirmPassword = "Other123!" })).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await f.Client().PostAsJsonAsync("/api/auth/login",
                new { email = f.User.Email, password = "ResetPass123!" })).StatusCode);
    }

    [Fact]
    public async Task ResetPassword_ExpiredOrInactiveUser_Returns400()
    {
        await using var f = await SeedAsync();
        var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
        await f.SetResetTokenAsync(HashToken(token), DateTime.UtcNow.AddHours(-1));
        Assert.Equal(HttpStatusCode.BadRequest,
            (await f.Client().PostAsJsonAsync("/api/auth/reset-password",
                new { token, newPassword = "ResetPass123!", confirmPassword = "ResetPass123!" })).StatusCode);

        await f.SetResetTokenAsync(HashToken(token), DateTime.UtcNow.AddHours(1));
        await f.SetActiveAsync(false);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await f.Client().PostAsJsonAsync("/api/auth/reset-password",
                new { token, newPassword = "ResetPass123!", confirmPassword = "ResetPass123!" })).StatusCode);
    }

    [Fact]
    public async Task TokenWithoutVersionClaim_OrWrongVersion_OrInactiveUser_Returns401()
    {
        await using var f = await SeedAsync();
        var (access, _) = await f.LoginAsync();

        var legacy = f.BuildToken(new[] { new Claim(ClaimTypes.NameIdentifier, f.User.Id.ToString()) });
        Assert.Equal(HttpStatusCode.Unauthorized, (await f.Client(legacy).GetAsync("/api/me")).StatusCode);

        var wrongVersion = f.BuildToken(new[]
        {
            new Claim(ClaimTypes.NameIdentifier, f.User.Id.ToString()),
            new Claim(TokenService.AuthVersionClaim, "999")
        });
        Assert.Equal(HttpStatusCode.Unauthorized, (await f.Client(wrongVersion).GetAsync("/api/me")).StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await f.Client(access).GetAsync("/api/me")).StatusCode);

        await f.SetActiveAsync(false);
        Assert.Equal(HttpStatusCode.Unauthorized, (await f.Client(access).GetAsync("/api/me")).StatusCode);
    }

    [Fact]
    public async Task RefreshRotation_OldTokenReplayed_Returns401_NewTokenWorks()
    {
        await using var f = await SeedAsync();
        var (_, refresh) = await f.LoginAsync();
        using var client = f.Client();

        var rotated = await client.PostAsJsonAsync("/api/auth/refresh", new { refreshToken = refresh });
        Assert.Equal(HttpStatusCode.OK, rotated.StatusCode);
        using var doc = JsonDocument.Parse(await rotated.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        var newAccess = data.GetProperty("accessToken").GetString()!;
        var newRefresh = data.GetProperty("refreshToken").GetString()!;

        Assert.Equal(HttpStatusCode.OK, (await f.Client(newAccess).GetAsync("/api/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await f.Client().PostAsJsonAsync("/api/auth/refresh", new { refreshToken = refresh })).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await f.Client().PostAsJsonAsync("/api/auth/refresh", new { refreshToken = newRefresh })).StatusCode);
    }

    [Fact]
    public async Task ConcurrentRefresh_SameToken_ExactlyOneWinner()
    {
        await using var f = await SeedAsync();
        var (_, refresh) = await f.LoginAsync();
        f.Gate.Arm();

        var r1 = f.Client().PostAsJsonAsync("/api/auth/refresh", new { refreshToken = refresh });
        var r2 = f.Client().PostAsJsonAsync("/api/auth/refresh", new { refreshToken = refresh });
        try { await f.Gate.WaitForTwoSavesAsync(); }
        finally { f.Gate.Release(); }
        var responses = await Task.WhenAll(r1, r2);

        var codes = responses.Select(r => (int)r.StatusCode).OrderBy(c => c).ToArray();
        Assert.Equal(new[] { 200, 401 }, codes);

        var winner = responses.Single(r => r.StatusCode == HttpStatusCode.OK);
        using var doc = JsonDocument.Parse(await winner.Content.ReadAsStringAsync());
        var winnerRefresh = doc.RootElement.GetProperty("data").GetProperty("refreshToken").GetString()!;
        Assert.Equal(HttpStatusCode.OK,
            (await f.Client().PostAsJsonAsync("/api/auth/refresh", new { refreshToken = winnerRefresh })).StatusCode);
    }

    [Fact]
    public async Task RefreshRacingLogout_LogoutAlwaysRevokes()
    {
        await using var f = await SeedAsync();
        var (access, refresh) = await f.LoginAsync();
        f.Gate.Arm();

        var refreshTask = f.Client().PostAsJsonAsync("/api/auth/refresh", new { refreshToken = refresh });
        var logoutTask = f.Client(access).PostAsync("/api/auth/logout", null);
        try { await f.Gate.WaitForTwoSavesAsync(); }
        finally { f.Gate.Release(); }
        var (refreshResponse, logoutResponse) = (await refreshTask, await logoutTask);

        Assert.Equal(HttpStatusCode.OK, logoutResponse.StatusCode);
        Assert.Equal(1, await f.AuthVersionAsync());
        Assert.Equal(HttpStatusCode.Unauthorized, (await f.Client(access).GetAsync("/api/me")).StatusCode);

        if (refreshResponse.StatusCode == HttpStatusCode.OK)
        {
            using var doc = JsonDocument.Parse(await refreshResponse.Content.ReadAsStringAsync());
            var data = doc.RootElement.GetProperty("data");
            var racedAccess = data.GetProperty("accessToken").GetString()!;
            var racedRefresh = data.GetProperty("refreshToken").GetString()!;
            Assert.Equal(HttpStatusCode.Unauthorized, (await f.Client(racedAccess).GetAsync("/api/me")).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized,
                (await f.Client().PostAsJsonAsync("/api/auth/refresh", new { refreshToken = racedRefresh })).StatusCode);
        }
        else
        {
            Assert.Equal(HttpStatusCode.Unauthorized, refreshResponse.StatusCode);
        }
    }
}
