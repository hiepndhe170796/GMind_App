using System.Security.Cryptography;
using System.Text;
using GMind.Application.Common;
using Task = System.Threading.Tasks.Task;
using GMind.Application.Common.Exceptions;
using GMind.Application.DTOs;
using GMind.Domain.Entities;
using GMind.Domain.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace GMind.Application.Services.Auth;

public class AuthService : IAuthService
{
    private readonly IApplicationDbContext _context;
    private readonly IPasswordHasher _passwordHasher;
    private readonly ITokenService _tokenService;
    private readonly IConfiguration _configuration;
    private readonly ILogger<AuthService> _logger;

    public AuthService(
        IApplicationDbContext context,
        IPasswordHasher passwordHasher,
        ITokenService tokenService,
        IConfiguration configuration,
        ILogger<AuthService> logger)
    {
        _context = context;
        _passwordHasher = passwordHasher;
        _tokenService = tokenService;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<UserDto> RegisterAsync(string displayName, string email, string password, CancellationToken ct = default)
    {
        var normalizedEmail = email.Trim().ToLowerInvariant();

        if (await _context.Users.AnyAsync(u => u.Email == normalizedEmail, ct))
            throw new ConflictException("Email is already registered");

        var user = new User
        {
            Id = Guid.NewGuid(),
            DisplayName = displayName.Trim(),
            Email = normalizedEmail,
            PasswordHash = _passwordHasher.HashPassword(password)
        };

        _context.Users.Add(user);
        await _context.SaveChangesAsync(ct);

        return ToDto(user);
    }

    public async Task<AuthResult> LoginAsync(string email, string password, CancellationToken ct = default)
    {
        var normalizedEmail = email.Trim().ToLowerInvariant();
        var user = await _context.Users.FirstOrDefaultAsync(u => u.Email == normalizedEmail && u.IsActive, ct);

        // Intentionally vague to avoid leaking which accounts exist
        if (user is null || !_passwordHasher.VerifyPassword(password, user.PasswordHash))
            throw new UnauthorizedException("Invalid email or password");

        return await IssueTokensAsync(user, ct);
    }

    public async Task<AuthResult> RefreshTokenAsync(string refreshToken, CancellationToken ct = default)
    {
        var tokenHash = HashToken(refreshToken);
        var user = await _context.Users.FirstOrDefaultAsync(
            u => u.RefreshToken == tokenHash && u.RefreshTokenExpiryTime > DateTime.UtcNow && u.IsActive, ct);

        if (user is null)
            throw new UnauthorizedException("Invalid or expired refresh token");

        // Rotate refresh token
        return await IssueTokensAsync(user, ct);
    }

    public async Task LogoutAsync(Guid userId, CancellationToken ct = default)
    {
        var user = await _context.Users.FindAsync(new object[] { userId }, ct);
        if (user is null) return;

        user.RefreshToken = null;
        user.RefreshTokenExpiryTime = null;
        user.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync(ct);
    }

    public async Task ForgotPasswordAsync(string email, CancellationToken ct = default)
    {
        var normalizedEmail = email.Trim().ToLowerInvariant();
        var user = await _context.Users.FirstOrDefaultAsync(u => u.Email == normalizedEmail && u.IsActive, ct);

        // Do not leak whether the account exists
        if (user is null) return;

        var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64));
        user.PasswordResetToken = HashToken(token);
        user.PasswordResetTokenExpiry = DateTime.UtcNow.AddHours(1);
        user.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync(ct);

        // Email delivery is out of scope for MVP milestone 1; log the token for dev reset flow.
        _logger.LogInformation("Password reset token generated for {Email}", normalizedEmail);
    }

    public async Task ResetPasswordAsync(string token, string newPassword, CancellationToken ct = default)
    {
        var tokenHash = HashToken(token);
        var user = await _context.Users.FirstOrDefaultAsync(
            u => u.PasswordResetToken == tokenHash && u.PasswordResetTokenExpiry > DateTime.UtcNow, ct);

        if (user is null)
            throw new BadRequestException("Invalid or expired reset token");

        user.PasswordHash = _passwordHasher.HashPassword(newPassword);
        user.PasswordResetToken = null;
        user.PasswordResetTokenExpiry = null;
        user.RefreshToken = null;
        user.RefreshTokenExpiryTime = null;
        user.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync(ct);
    }

    public async Task<UserDto> GetProfileAsync(Guid userId, CancellationToken ct = default)
    {
        var user = await _context.Users.FindAsync(new object[] { userId }, ct)
            ?? throw new NotFoundException("User not found");
        return ToDto(user);
    }

    public async Task<UserDto> UpdateProfileAsync(Guid userId, string displayName, string? avatarUrl, CancellationToken ct = default)
    {
        var user = await _context.Users.FindAsync(new object[] { userId }, ct)
            ?? throw new NotFoundException("User not found");

        user.DisplayName = displayName.Trim();
        user.AvatarUrl = avatarUrl;
        user.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync(ct);
        return ToDto(user);
    }

    public async Task ChangePasswordAsync(Guid userId, string currentPassword, string newPassword, CancellationToken ct = default)
    {
        var user = await _context.Users.FindAsync(new object[] { userId }, ct)
            ?? throw new NotFoundException("User not found");

        if (!_passwordHasher.VerifyPassword(currentPassword, user.PasswordHash))
            throw new UnauthorizedException("Current password is incorrect");

        user.PasswordHash = _passwordHasher.HashPassword(newPassword);
        user.UpdatedAt = DateTime.UtcNow;
        // Invalidate existing sessions
        user.RefreshToken = null;
        user.RefreshTokenExpiryTime = null;
        await _context.SaveChangesAsync(ct);
    }

    private async Task<AuthResult> IssueTokensAsync(User user, CancellationToken ct)
    {
        var accessToken = _tokenService.GenerateAccessToken(user);
        var expiryMinutes = int.Parse(_configuration["Jwt:ExpiryMinutes"] ?? "60");
        var refreshExpiryDays = int.Parse(_configuration["Jwt:RefreshTokenExpiryDays"] ?? "7");

        var refreshToken = _tokenService.GenerateRefreshToken();
        user.RefreshToken = HashToken(refreshToken);
        user.RefreshTokenExpiryTime = DateTime.UtcNow.AddDays(refreshExpiryDays);
        user.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync(ct);

        return new AuthResult(accessToken, refreshToken, DateTime.UtcNow.AddMinutes(expiryMinutes), ToDto(user));
    }

    private static string HashToken(string token)
        => Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    private static UserDto ToDto(User user)
        => new(user.Id, user.DisplayName, user.Email, user.AvatarUrl);
}
