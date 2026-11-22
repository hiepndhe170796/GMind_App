using System.Text.Json;
using GMind.API.Common;
using GMind.Application.Common;
using GMind.Application.Common.Exceptions;
using GMind.Application.Services.Auth;
using GMind.Domain.Enums;
using GMind.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;
using TaskEntity = GMind.Domain.Entities.Task;
using TaskStatusEnum = GMind.Domain.Enums.TaskStatus;

namespace GMind.Tests;

public class AuthServiceTests : IDisposable
{
    private readonly ApplicationDbContext _db;
    private readonly AuthService _service;

    public AuthServiceTests()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _db = new ApplicationDbContext(options);
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Secret"] = "test-secret-key-minimum-32-chars-long!",
                ["Jwt:Issuer"] = "GMind",
                ["Jwt:Audience"] = "GMind",
                ["Jwt:ExpiryMinutes"] = "60",
                ["Jwt:RefreshTokenExpiryDays"] = "7"
            })
            .Build();
        _service = new AuthService(_db, new PasswordHasher(), new TokenService(config), config, NullLogger<AuthService>.Instance);
    }

    [Fact]
    public async Task Register_Then_Login_ReturnsTokens()
    {
        await _service.RegisterAsync("User One", "one@test.dev", "Password123!");
        var result = await _service.LoginAsync("one@test.dev", "Password123!");

        Assert.False(string.IsNullOrEmpty(result.AccessToken));
        Assert.False(string.IsNullOrEmpty(result.RefreshToken));
        Assert.Equal("one@test.dev", result.User.Email);
    }

    [Fact]
    public async Task Register_DuplicateEmail_ThrowsConflict()
    {
        await _service.RegisterAsync("User One", "dup@test.dev", "Password123!");
        await Assert.ThrowsAsync<ConflictException>(() =>
            _service.RegisterAsync("User Two", "DUP@test.dev", "Password123!"));
    }

    [Fact]
    public async Task Login_WrongPassword_ThrowsUnauthorized()
    {
        await _service.RegisterAsync("User One", "wp@test.dev", "Password123!");
        await Assert.ThrowsAsync<UnauthorizedException>(() =>
            _service.LoginAsync("wp@test.dev", "WrongPass999!"));
    }

    [Fact]
    public async Task Login_NonexistentEmail_ThrowsUnauthorized()
        => await Assert.ThrowsAsync<UnauthorizedException>(() =>
            _service.LoginAsync("nobody@test.dev", "Password123!"));

    [Fact]
    public async Task RefreshToken_Rotation_IssuesNewTokensAndRevokesOld()
    {
        await _service.RegisterAsync("User", "rt@test.dev", "Password123!");
        var login = await _service.LoginAsync("rt@test.dev", "Password123!");
        var refreshed = await _service.RefreshTokenAsync(login.RefreshToken);

        Assert.NotEqual(login.RefreshToken, refreshed.RefreshToken);
        await Assert.ThrowsAsync<UnauthorizedException>(() =>
            _service.RefreshTokenAsync(login.RefreshToken)); // old token revoked
    }

    [Fact]
    public async Task ResetPassword_InvalidToken_ThrowsBadRequest()
        => await Assert.ThrowsAsync<BadRequestException>(() =>
            _service.ResetPasswordAsync("fake-token", "NewPassword123!"));

    [Fact]
    public async Task ChangePassword_Then_OldPasswordFails()
    {
        var user = await _service.RegisterAsync("User", "cp@test.dev", "Password123!");
        await _service.ChangePasswordAsync(user.Id, "Password123!", "NewPassword456!");
        await Assert.ThrowsAsync<UnauthorizedException>(() =>
            _service.LoginAsync("cp@test.dev", "Password123!"));
        var login = await _service.LoginAsync("cp@test.dev", "NewPassword456!");
        Assert.NotNull(login.AccessToken);
    }

    public void Dispose() => _db.Dispose();
}

public class PasswordResetDeliveryTests : IDisposable
{
    internal sealed class RecordingSender : IEmailSender
    {
        public bool IsAvailable { get; set; } = true;
        public List<EmailMessage> Sent { get; } = new();
        public string? Email => Sent.LastOrDefault()?.To;
        public string? Token => Sent.LastOrDefault()?.Links.FirstOrDefault() is { } link
            ? Uri.UnescapeDataString(link.Url.Split("#token=")[1])
            : null;
        public Task SendAsync(EmailMessage message, CancellationToken ct = default)
        {
            Sent.Add(message);
            return Task.CompletedTask;
        }
    }

    private readonly ApplicationDbContext _db;
    private readonly AuthService _service;
    private readonly RecordingSender _delivery = new();

    public PasswordResetDeliveryTests()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        _db = new ApplicationDbContext(options);
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Secret"] = "test-secret-key-minimum-32-chars-long!",
                ["Jwt:Issuer"] = "GMind", ["Jwt:Audience"] = "GMind",
                ["Jwt:ExpiryMinutes"] = "60", ["Jwt:RefreshTokenExpiryDays"] = "7",
                ["Auth:FrontendUrl"] = "http://localhost:5173"
            }).Build();
        _service = new AuthService(_db, new PasswordHasher(), new TokenService(config), config,
            NullLogger<AuthService>.Instance, emailSender: _delivery);
    }

    public void Dispose() => _db.Dispose();

    [Fact]
    public async Task Forgot_UnknownEmail_ReturnsSuccessButNoDelivery()
    {
        await _service.ForgotPasswordAsync("ghost@test.dev");
        Assert.Null(_delivery.Email);
    }

    [Fact]
    public async Task Forgot_KnownEmail_DeliversTokenAndStoresHash()
    {
        await _service.RegisterAsync("U", "u@test.dev", "Password123!");
        await _service.ForgotPasswordAsync("u@test.dev");
        var user = await _db.Users.FirstAsync(u => u.Email == "u@test.dev");
        Assert.Equal("u@test.dev", _delivery.Email);
        Assert.False(string.IsNullOrEmpty(_delivery.Token));
        Assert.NotEqual(_delivery.Token, user.PasswordResetToken);
        Assert.True(user.PasswordResetTokenExpiry > DateTime.UtcNow);
    }

    [Fact]
    public async Task Forgot_NewRequest_InvalidatesPriorToken()
    {
        await _service.RegisterAsync("U", "u2@test.dev", "Password123!");
        await _service.ForgotPasswordAsync("u2@test.dev");
        var first = _delivery.Token!;
        await _service.ForgotPasswordAsync("u2@test.dev");
        var second = _delivery.Token!;
        Assert.NotEqual(first, second);
        await Assert.ThrowsAsync<BadRequestException>(() => _service.ResetPasswordAsync(first, "NewPass123!", default));
    }

    [Fact]
    public async Task Reset_ChangesPassword_IncrementsAuthVersion_RevokesSession()
    {
        await _service.RegisterAsync("U", "u3@test.dev", "Password123!");
        var login = await _service.LoginAsync("u3@test.dev", "Password123!");
        var before = await _db.Users.FirstAsync(u => u.Email == "u3@test.dev");
        var version = before.AuthVersion;
        await _service.ForgotPasswordAsync("u3@test.dev");
        await _service.ResetPasswordAsync(_delivery.Token!, "NewPass123!", default);
        var user = await _db.Users.FirstAsync(u => u.Email == "u3@test.dev");
        Assert.Equal(version + 1, user.AuthVersion);
        Assert.Null(user.PasswordResetToken);
        Assert.True(await _db.UserSessions.AllAsync(s => s.RevokedAt != null));
        await Assert.ThrowsAsync<UnauthorizedException>(() => _service.RefreshTokenAsync(login.RefreshToken));
        await Assert.ThrowsAsync<UnauthorizedException>(() => _service.LoginAsync("u3@test.dev", "Password123!"));
        var reLogin = await _service.LoginAsync("u3@test.dev", "NewPass123!");
        Assert.False(string.IsNullOrEmpty(reLogin.AccessToken));
    }

    [Fact]
    public async Task Reset_TokenSingleUse_And_ExpiredFails()
    {
        await _service.RegisterAsync("U", "u4@test.dev", "Password123!");
        await _service.ForgotPasswordAsync("u4@test.dev");
        var token = _delivery.Token!;
        await _service.ResetPasswordAsync(token, "NewPass123!", default);
        await Assert.ThrowsAsync<BadRequestException>(() => _service.ResetPasswordAsync(token, "Other123!", default));

        await _service.ForgotPasswordAsync("u4@test.dev");
        var expiredToken = _delivery.Token!;
        var user = await _db.Users.FirstAsync(u => u.Email == "u4@test.dev");
        user.PasswordResetTokenExpiry = DateTime.UtcNow.AddMinutes(-5);
        await _db.SaveChangesAsync();
        await Assert.ThrowsAsync<BadRequestException>(() => _service.ResetPasswordAsync(expiredToken, "Other123!", default));
    }

    [Fact]
    public async Task Forgot_UnavailableDelivery_RejectsBeforeMinting()
    {
        _delivery.IsAvailable = false;
        await _service.RegisterAsync("U", "u5@test.dev", "Password123!");
        await Assert.ThrowsAsync<BadRequestException>(() => _service.ForgotPasswordAsync("u5@test.dev"));
        await Assert.ThrowsAsync<BadRequestException>(() => _service.ForgotPasswordAsync("nobody@test.dev"));
        var user = await _db.Users.FirstAsync(u => u.Email == "u5@test.dev");
        Assert.Null(user.PasswordResetToken);
    }

    [Fact]
    public async Task AuthenticatedChange_InvalidatesOutstandingReset_OnlyAfterCorrectCurrentPassword()
    {
        var registered = await _service.RegisterAsync("Account", "change-reset@test.dev", "Password123!");
        await _service.ForgotPasswordAsync("change-reset@test.dev");
        var oldToken = _delivery.Token!;
        var user = await _db.Users.SingleAsync(u => u.Id == registered.Id);
        var hash = user.PasswordResetToken;
        var version = user.AuthVersion;
        await Assert.ThrowsAsync<BadRequestException>(() =>
            _service.ChangePasswordAsync(user.Id, "Incorrect123!", "NewPass123!"));
        Assert.Equal(hash, user.PasswordResetToken);
        Assert.Equal(version, user.AuthVersion);
        await _service.ChangePasswordAsync(user.Id, "Password123!", "NewPass123!");
        Assert.Null(user.PasswordResetToken);
        Assert.Null(user.PasswordResetTokenExpiry);
        Assert.Equal(version + 1, user.AuthVersion);
        await Assert.ThrowsAsync<BadRequestException>(() => _service.ResetPasswordAsync(oldToken, "Attacker123!"));
        Assert.NotNull(await _service.LoginAsync("change-reset@test.dev", "NewPass123!"));
    }
}

public class DevelopmentMailboxTests : IDisposable
{
    private sealed class FakeEnv(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "GMind.Tests";
        public string ContentRootPath { get; set; } = "";
        public IFileProvider ContentRootFileProvider { get; set; } = null!;
    }

    private readonly string _mailbox = Path.Combine(Path.GetTempPath(), $"gm-mbd-{Guid.NewGuid():N}");

    public void Dispose()
    {
        if (Directory.Exists(_mailbox)) Directory.Delete(_mailbox, true);
    }

    [Fact]
    public async Task Development_WritesHtmlAndJson_Atomically()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Auth:LocalMailboxPath"] = _mailbox,
                ["Auth:FrontendUrl"] = "http://localhost:5173"
            }).Build();
        var sender = new DevelopmentMailbox(new FakeEnv("Development"), config);
        Assert.True(sender.IsAvailable);

        var link = "http://localhost:5173/reset-password#token=tok%2B%2F%3D";
        var html = "<html><body><p>escaped u+&lt;&amp;&gt;@test.dev</p>"
            + $"<a href=\"{link}\">Đặt lại mật khẩu</a></body></html>";
        await sender.SendAsync(new EmailMessage("u@test.dev", "GMind — Đặt lại mật khẩu", html,
            [new EmailLink("Đặt lại mật khẩu", link)]));

        var htmlFile = Assert.Single(Directory.GetFiles(_mailbox, "*.html"));
        Assert.Equal(html, await File.ReadAllTextAsync(htmlFile));
        var jsonFile = Assert.Single(Directory.GetFiles(_mailbox, "*.json"));
        Assert.Empty(Directory.GetFiles(_mailbox, "*.tmp"));
        using var doc = JsonDocument.Parse(await File.ReadAllTextAsync(jsonFile));
        var meta = doc.RootElement;
        Assert.Equal(Path.GetFileNameWithoutExtension(htmlFile), meta.GetProperty("id").GetString());
        Assert.Equal("u@test.dev", meta.GetProperty("to").GetString());
        Assert.Equal("GMind — Đặt lại mật khẩu", meta.GetProperty("subject").GetString());
        Assert.Equal(link, meta.GetProperty("links")[0].GetProperty("url").GetString());
    }

    [Fact]
    public async Task Production_NotAvailable_NoFile()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Auth:LocalMailboxPath"] = _mailbox }).Build();
        var sender = new DevelopmentMailbox(new FakeEnv("Production"), config);
        Assert.False(sender.IsAvailable);
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            sender.SendAsync(new EmailMessage("u@test.dev", "s", "h", [])));
        Assert.False(Directory.Exists(_mailbox));
    }
}
