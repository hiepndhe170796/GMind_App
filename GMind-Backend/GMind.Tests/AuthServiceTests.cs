using GMind.Application.Common.Exceptions;
using GMind.Application.Services.Auth;
using GMind.Domain.Enums;
using GMind.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
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
