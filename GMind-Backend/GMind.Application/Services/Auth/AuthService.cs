using System.Net;
using System.Security.Cryptography;
using System.Text;
using GMind.Application.Common;
using Task = System.Threading.Tasks.Task;
using GMind.Application.Common.Exceptions;
using GMind.Application.DTOs;
using GMind.Domain.Entities;
using GMind.Domain.Enums;
using GMind.Domain.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace GMind.Application.Services.Auth;

public class AuthService : IAuthService
{
    private const int MaxActiveSessions = 10;
    private const string SessionExpiredMessage = "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
    private const string EmailTakenMessage = "Email này đã được sử dụng cho tài khoản khác.";

    private readonly IApplicationDbContext _context;
    private readonly IPasswordHasher _passwordHasher;
    private readonly ITokenService _tokenService;
    private readonly IConfiguration _configuration;
    private readonly ILogger<AuthService> _logger;
    private readonly IClientInfo? _clientInfo;
    private readonly IEmailSender? _emailSender;
    private readonly IRealtimeSessions? _realtimeSessions;

    public AuthService(
        IApplicationDbContext context,
        IPasswordHasher passwordHasher,
        ITokenService tokenService,
        IConfiguration configuration,
        ILogger<AuthService> logger,
        IClientInfo? clientInfo = null,
        IEmailSender? emailSender = null,
        IRealtimeSessions? realtimeSessions = null)
    {
        _context = context;
        _passwordHasher = passwordHasher;
        _tokenService = tokenService;
        _configuration = configuration;
        _logger = logger;
        _clientInfo = clientInfo;
        _emailSender = emailSender;
        _realtimeSessions = realtimeSessions;
    }

    public async Task<UserDto> RegisterAsync(string displayName, string email, string password, CancellationToken ct = default)
    {
        var normalizedEmail = email.Trim().ToLowerInvariant();

        if (await _context.Users.AnyAsync(u => u.Email == normalizedEmail, ct))
            throw new ConflictException("Email này đã được đăng ký. Hãy đăng nhập hoặc dùng email khác.");

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
            throw new UnauthorizedException("Email hoặc mật khẩu không đúng.");

        return await CreateSessionAsync(user, ct);
    }

    public async Task<AuthResult> RefreshTokenAsync(string refreshToken, CancellationToken ct = default)
    {
        var tokenHash = HashToken(refreshToken);
        var now = DateTime.UtcNow;
        var session = await _context.UserSessions
            .Include(s => s.User)
            .FirstOrDefaultAsync(s => s.RefreshTokenHash == tokenHash && s.RevokedAt == null
                && s.ExpiresAt > now && s.AbsoluteExpiresAt > now && s.User.IsActive, ct);

        if (session is null)
            throw new UnauthorizedException(SessionExpiredMessage);

        // Rotate the refresh hash in place and slide the expiry (never beyond the absolute cap)
        var refreshDays = int.Parse(_configuration["Jwt:RefreshTokenExpiryDays"] ?? "7");
        var newRefreshToken = _tokenService.GenerateRefreshToken();
        session.RefreshTokenHash = HashToken(newRefreshToken);
        session.LastSeenAt = now;
        session.ExpiresAt = now.AddDays(refreshDays) < session.AbsoluteExpiresAt
            ? now.AddDays(refreshDays)
            : session.AbsoluteExpiresAt;

        try
        {
            await _context.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            // A concurrent rotation won — this copy is stale
            throw new UnauthorizedException(SessionExpiredMessage);
        }

        var expiryMinutes = int.Parse(_configuration["Jwt:ExpiryMinutes"] ?? "60");
        var accessToken = _tokenService.GenerateAccessToken(session.User, session.Id);
        return new AuthResult(accessToken, newRefreshToken, now.AddMinutes(expiryMinutes), ToDto(session.User));
    }

    public async Task LogoutAsync(Guid userId, Guid? sessionId, CancellationToken ct = default)
    {
        if (sessionId is not Guid sid) return;
        var revoked = await RevokeWhereAsync(s => s.Id == sid && s.UserId == userId, SessionRevokedReason.Logout, ct);
        await PublishRevokedAsync(revoked, ct);
    }

    public async Task ForgotPasswordAsync(string email, CancellationToken ct = default)
    {
        if (_emailSender is not { IsAvailable: true })
            throw new BadRequestException("Tính năng khôi phục mật khẩu chưa được cấu hình.");

        var normalizedEmail = email.Trim().ToLowerInvariant();
        var user = await _context.Users.FirstOrDefaultAsync(u => u.Email == normalizedEmail && u.IsActive, ct);

        // Do not leak whether the account exists
        if (user is null) return;

        var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64));
        user.PasswordResetToken = HashToken(token);
        user.PasswordResetTokenExpiry = DateTime.UtcNow.AddHours(1);
        user.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync(ct);

        var resetLink = FrontendBaseUri() + "reset-password#token=" + Uri.EscapeDataString(token);
        await _emailSender.SendAsync(new EmailMessage(normalizedEmail, "GMind — Đặt lại mật khẩu",
            PasswordResetHtml(normalizedEmail, resetLink, user.PasswordResetTokenExpiry.Value),
            [new EmailLink("Đặt lại mật khẩu", resetLink)]), ct);
        _logger.LogInformation("Password reset email sent");
    }

    public async Task ResetPasswordAsync(string token, string newPassword, CancellationToken ct = default)
    {
        var tokenHash = HashToken(token);
        List<Guid> revoked;
        for (var attempt = 0; ; attempt++)
        {
            var user = await _context.Users.FirstOrDefaultAsync(
                u => u.PasswordResetToken == tokenHash && u.PasswordResetTokenExpiry > DateTime.UtcNow && u.IsActive, ct);

            if (user is null)
                throw new BadRequestException("Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.");

            user.PasswordHash = _passwordHasher.HashPassword(newPassword);
            user.AuthVersion = checked(user.AuthVersion + 1);
            user.PasswordResetToken = null;
            user.PasswordResetTokenExpiry = null;
            user.UpdatedAt = DateTime.UtcNow;

            try
            {
                revoked = await RevokeAllAndSaveAsync(user.Id, SessionRevokedReason.PasswordReset, ct);
                break;
            }
            catch (DbUpdateConcurrencyException exception) when (attempt < 2)
            {
                foreach (var entry in exception.Entries) await entry.ReloadAsync(ct);
            }
        }
        await PublishRevokedAsync(revoked, ct);
    }

    public async Task<UserDto> GetProfileAsync(Guid userId, CancellationToken ct = default)
    {
        var user = await _context.Users.FindAsync(new object[] { userId }, ct)
            ?? throw new NotFoundException("Không tìm thấy người dùng này.");
        return ToDto(user);
    }

    public async Task<UserDto> UpdateProfileAsync(Guid userId, string displayName, string? avatarUrl, CancellationToken ct = default)
    {
        var user = await _context.Users.FindAsync(new object[] { userId }, ct)
            ?? throw new NotFoundException("Không tìm thấy người dùng này.");

        user.DisplayName = displayName.Trim();
        user.AvatarUrl = avatarUrl?.Trim();
        user.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync(ct);
        return ToDto(user);
    }

    public async Task ChangePasswordAsync(Guid userId, string currentPassword, string newPassword, CancellationToken ct = default)
    {
        List<Guid> revoked;
        for (var attempt = 0; ; attempt++)
        {
            var user = await _context.Users.FindAsync(new object[] { userId }, ct)
                ?? throw new NotFoundException("Không tìm thấy người dùng này.");

            if (!_passwordHasher.VerifyPassword(currentPassword, user.PasswordHash))
                throw new BadRequestException("Mật khẩu hiện tại không đúng.");

            user.PasswordHash = _passwordHasher.HashPassword(newPassword);
            user.UpdatedAt = DateTime.UtcNow;
            // Invalidate all sessions + any outstanding reset token
            user.PasswordResetToken = null;
            user.PasswordResetTokenExpiry = null;
            user.AuthVersion = checked(user.AuthVersion + 1);

            try
            {
                revoked = await RevokeAllAndSaveAsync(user.Id, SessionRevokedReason.PasswordChanged, ct);
                break;
            }
            catch (DbUpdateConcurrencyException exception) when (attempt < 2)
            {
                foreach (var entry in exception.Entries) await entry.ReloadAsync(ct);
            }
        }
        await PublishRevokedAsync(revoked, ct);
    }

    public async Task<List<SessionDto>> GetSessionsAsync(Guid userId, Guid? currentSessionId, CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;
        var sessions = await _context.UserSessions.AsNoTracking()
            .Where(s => s.UserId == userId && s.RevokedAt == null && s.ExpiresAt > now && s.AbsoluteExpiresAt > now)
            .OrderByDescending(s => s.LastSeenAt)
            .ToListAsync(ct);

        return sessions
            .OrderByDescending(s => s.Id == currentSessionId)
            .Select(s =>
            {
                var (browser, os) = UserAgentParser.Parse(s.UserAgent);
                return new SessionDto(s.Id, UserAgentParser.DeviceLabel(s.UserAgent), browser, os,
                    s.IpAddress, s.CreatedAt, s.LastSeenAt, s.ExpiresAt, s.Id == currentSessionId);
            })
            .ToList();
    }

    public async Task RevokeSessionAsync(Guid userId, Guid sessionId, CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;
        var revoked = await RevokeWhereAsync(
            s => s.Id == sessionId && s.UserId == userId && s.ExpiresAt > now && s.AbsoluteExpiresAt > now,
            SessionRevokedReason.Revoked, ct);
        if (revoked.Count == 0)
            throw new NotFoundException("Không tìm thấy phiên đăng nhập này.");
        await PublishRevokedAsync(revoked, ct);
    }

    public async Task<int> RevokeOtherSessionsAsync(Guid userId, Guid? currentSessionId, CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;
        var revoked = await RevokeWhereAsync(
            s => s.UserId == userId && s.Id != currentSessionId && s.ExpiresAt > now && s.AbsoluteExpiresAt > now,
            SessionRevokedReason.RevokedOthers, ct);
        await PublishRevokedAsync(revoked, ct);
        return revoked.Count;
    }

    public async Task<EmailChangePendingDto> RequestEmailChangeAsync(Guid userId, string newEmail, string currentPassword, CancellationToken ct = default)
    {
        if (_emailSender is not { IsAvailable: true })
            throw new BadRequestException("Tính năng gửi email chưa được cấu hình.");

        var user = await _context.Users.FindAsync(new object[] { userId }, ct)
            ?? throw new NotFoundException("Không tìm thấy người dùng này.");

        if (!_passwordHasher.VerifyPassword(currentPassword, user.PasswordHash))
            throw new BadRequestException("Mật khẩu hiện tại không đúng.");

        var normalized = newEmail.Trim().ToLowerInvariant();
        if (normalized == user.Email)
            throw new BadRequestException("Email mới phải khác email hiện tại.");
        if (await _context.Users.AnyAsync(u => u.Email == normalized && u.Id != userId, ct))
            throw new ConflictException(EmailTakenMessage);

        var now = DateTime.UtcNow;
        var pending = await _context.EmailChangeRequests
            .Where(r => r.UserId == userId && r.ConsumedAt == null && r.CancelledAt == null)
            .ToListAsync(ct);
        foreach (var r in pending) r.CancelledAt = now;

        var token = Base64Url(RandomNumberGenerator.GetBytes(32));
        var request = new EmailChangeRequest
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            NewEmail = normalized,
            TokenHash = HashToken(token),
            CreatedAt = now,
            ExpiresAt = now.AddMinutes(60)
        };
        _context.EmailChangeRequests.Add(request);
        await _context.SaveChangesAsync(ct);

        var link = FrontendBaseUri() + "verify-email#token=" + Uri.EscapeDataString(token);
        await _emailSender.SendAsync(new EmailMessage(normalized, "Xác minh email mới cho GMind",
            VerifyEmailHtml(normalized, link, request.ExpiresAt),
            [new EmailLink("Xác minh email", link)]), ct);

        return new EmailChangePendingDto(normalized, request.ExpiresAt);
    }

    public async Task<EmailChangePendingDto?> GetPendingEmailChangeAsync(Guid userId, CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;
        var request = await _context.EmailChangeRequests.AsNoTracking()
            .Where(r => r.UserId == userId && r.ConsumedAt == null && r.CancelledAt == null && r.ExpiresAt > now)
            .OrderByDescending(r => r.CreatedAt)
            .FirstOrDefaultAsync(ct);
        return request is null ? null : new EmailChangePendingDto(request.NewEmail, request.ExpiresAt);
    }

    public async Task CancelEmailChangeAsync(Guid userId, CancellationToken ct = default)
    {
        var pending = await _context.EmailChangeRequests
            .Where(r => r.UserId == userId && r.ConsumedAt == null && r.CancelledAt == null)
            .ToListAsync(ct);
        if (pending.Count == 0) return;
        foreach (var r in pending) r.CancelledAt = DateTime.UtcNow;
        await _context.SaveChangesAsync(ct);
    }

    public async Task<string> VerifyEmailChangeAsync(string token, CancellationToken ct = default)
    {
        var tokenHash = HashToken(token);
        var now = DateTime.UtcNow;
        var request = await _context.EmailChangeRequests
            .Include(r => r.User)
            .FirstOrDefaultAsync(r => r.TokenHash == tokenHash, ct);

        if (request is null || request.ConsumedAt != null || request.CancelledAt != null
            || request.ExpiresAt <= now || !request.User.IsActive)
            throw new BadRequestException("Liên kết xác minh không hợp lệ hoặc đã hết hạn.");

        var user = request.User;
        if (await _context.Users.AnyAsync(u => u.Email == request.NewEmail && u.Id != user.Id, ct))
            throw new ConflictException(EmailTakenMessage);

        var oldEmail = user.Email;
        user.Email = request.NewEmail;
        user.UpdatedAt = now;
        request.ConsumedAt = now;

        var others = await _context.EmailChangeRequests
            .Where(r => r.UserId == user.Id && r.Id != request.Id && r.ConsumedAt == null && r.CancelledAt == null)
            .ToListAsync(ct);
        foreach (var r in others) r.CancelledAt = now;

        _context.Notifications.Add(new Notification
        {
            Id = Guid.NewGuid(),
            RecipientUserId = user.Id,
            GroupId = null,
            Type = NotificationType.EmailChanged,
            Title = "Email đã thay đổi",
            Body = $"Email đăng nhập đã đổi thành {request.NewEmail}.",
            RelatedEntityType = null,
            RelatedEntityId = null
        });
        await _context.SaveChangesAsync(ct);

        if (_emailSender is { IsAvailable: true })
        {
            await _emailSender.SendAsync(new EmailMessage(oldEmail, "Email đăng nhập GMind đã được đổi",
                EmailChangedNoticeHtml(oldEmail, request.NewEmail), []), ct);
        }

        return request.NewEmail;
    }

    // ---- sessions internals ----

    private async Task<AuthResult> CreateSessionAsync(User user, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var expiryMinutes = int.Parse(_configuration["Jwt:ExpiryMinutes"] ?? "60");
        var refreshDays = int.Parse(_configuration["Jwt:RefreshTokenExpiryDays"] ?? "7");

        var refreshToken = _tokenService.GenerateRefreshToken();
        var userAgent = _clientInfo?.UserAgent;
        var session = new UserSession
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            RefreshTokenHash = HashToken(refreshToken),
            CreatedAt = now,
            LastSeenAt = now,
            ExpiresAt = now.AddDays(refreshDays),
            AbsoluteExpiresAt = now.AddDays(30),
            UserAgent = userAgent is { Length: > 256 } ? userAgent[..256] : userAgent,
            IpAddress = _clientInfo?.IpAddress
        };
        _context.UserSessions.Add(session);

        // Cap: keep at most MaxActiveSessions live sessions; revoke the least recently used.
        var active = await _context.UserSessions
            .Where(s => s.UserId == user.Id && s.RevokedAt == null)
            .OrderBy(s => s.LastSeenAt)
            .ToListAsync(ct);
        var over = active.Count + 1 - MaxActiveSessions;
        List<Guid> limitRevoked = [];
        if (over > 0)
        {
            foreach (var s in active.Take(over))
            {
                s.RevokedAt = now;
                s.RevokedReason = SessionRevokedReason.Limit;
                limitRevoked.Add(s.Id);
            }
        }

        await _context.SaveChangesAsync(ct);
        await PublishRevokedAsync(limitRevoked, ct);

        var accessToken = _tokenService.GenerateAccessToken(user, session.Id);
        return new AuthResult(accessToken, refreshToken, now.AddMinutes(expiryMinutes), ToDto(user));
    }

    /// <summary>Marks matching unrevoked sessions revoked, with reload-retry on concurrent writes.</summary>
    private async Task<List<Guid>> RevokeWhereAsync(
        System.Linq.Expressions.Expression<Func<UserSession, bool>> predicate, string reason, CancellationToken ct)
    {
        List<Guid> revoked = [];
        for (var attempt = 0; ; attempt++)
        {
            var sessions = await _context.UserSessions.Where(s => s.RevokedAt == null).Where(predicate).ToListAsync(ct);
            if (sessions.Count == 0) return revoked;
            var now = DateTime.UtcNow;
            foreach (var s in sessions)
            {
                s.RevokedAt = now;
                s.RevokedReason = reason;
            }
            try
            {
                await _context.SaveChangesAsync(ct);
                revoked = sessions.Select(s => s.Id).ToList();
                return revoked;
            }
            catch (DbUpdateConcurrencyException exception) when (attempt < 2)
            {
                foreach (var entry in exception.Entries) await entry.ReloadAsync(ct);
            }
        }
    }

    /// <summary>Revokes every unrevoked session of the user and saves (caller may add more changes first).</summary>
    private async Task<List<Guid>> RevokeAllAndSaveAsync(Guid userId, string reason, CancellationToken ct)
    {
        var sessions = await _context.UserSessions
            .Where(s => s.UserId == userId && s.RevokedAt == null)
            .ToListAsync(ct);
        var now = DateTime.UtcNow;
        foreach (var s in sessions)
        {
            s.RevokedAt = now;
            s.RevokedReason = reason;
        }
        await _context.SaveChangesAsync(ct);
        return sessions.Select(s => s.Id).ToList();
    }

    private async Task PublishRevokedAsync(IReadOnlyCollection<Guid> sessionIds, CancellationToken ct)
    {
        if (sessionIds.Count == 0 || _realtimeSessions is null) return;
        try
        {
            await _realtimeSessions.RevokedAsync(sessionIds, ct);
        }
        catch (Exception exception)
        {
            _logger.LogWarning(exception, "Failed to publish session-revoked for {Count} session(s)", sessionIds.Count);
        }
    }

    // ---- email helpers ----

    private string FrontendBaseUri()
    {
        var frontendBase = _configuration["Auth:FrontendUrl"] ?? "http://localhost:5173";
        if (!Uri.TryCreate(frontendBase, UriKind.Absolute, out var baseUri)
            || (baseUri.Scheme != Uri.UriSchemeHttp && baseUri.Scheme != Uri.UriSchemeHttps))
            throw new InvalidOperationException("Auth:FrontendUrl must be an absolute http/https URI");
        return baseUri.AbsoluteUri.TrimEnd('/') + "/";
    }

    private static string PasswordResetHtml(string email, string resetLink, DateTime expiresAtUtc)
        => string.Concat(
            "<!DOCTYPE html>\n<html lang=\"vi\">\n",
            "<head><meta charset=\"utf-8\"><meta name=\"referrer\" content=\"no-referrer\"><title>GMind — Đặt lại mật khẩu</title></head>\n",
            "<body style=\"font-family:'Segoe UI',Arial,sans-serif;background:#f5f7fb;padding:24px\">\n",
            "  <div style=\"max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e7ecf4;border-radius:16px;padding:32px\">\n",
            "    <h1 style=\"font-size:22px;margin:0 0 8px\">GMind</h1>\n",
            "    <h2 style=\"font-size:18px;margin:0 0 16px\">Đặt lại mật khẩu</h2>\n",
            $"    <p>Xin chào {WebUtility.HtmlEncode(email)},</p>\n",
            "    <p>Bạn vừa yêu cầu đặt lại mật khẩu GMind. Nhấn liên kết dưới đây để đặt mật khẩu mới:</p>\n",
            $"    <p><a href=\"{WebUtility.HtmlEncode(resetLink)}\">Đặt lại mật khẩu</a></p>\n",
            $"    <p>Liên kết hết hạn lúc {expiresAtUtc:yyyy-MM-dd HH:mm} UTC.</p>\n",
            "    <p>Nếu bạn không yêu cầu thay đổi này, hãy bỏ qua thư.</p>\n",
            "  </div>\n</body>\n</html>\n");

    private static string VerifyEmailHtml(string newEmail, string link, DateTime expiresAtUtc)
        => string.Concat(
            "<!DOCTYPE html>\n<html lang=\"vi\">\n",
            "<head><meta charset=\"utf-8\"><meta name=\"referrer\" content=\"no-referrer\"><title>GMind — Xác minh email mới</title></head>\n",
            "<body style=\"font-family:'Segoe UI',Arial,sans-serif;background:#f5f7fb;padding:24px\">\n",
            "  <div style=\"max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e7ecf4;border-radius:16px;padding:32px\">\n",
            "    <h1 style=\"font-size:22px;margin:0 0 8px\">GMind</h1>\n",
            "    <h2 style=\"font-size:18px;margin:0 0 16px\">Xác minh email mới</h2>\n",
            $"    <p>Bạn vừa yêu cầu đổi email đăng nhập GMind sang {WebUtility.HtmlEncode(newEmail)}.</p>\n",
            $"    <p><a href=\"{WebUtility.HtmlEncode(link)}\">Xác minh email</a></p>\n",
            $"    <p>Liên kết hết hạn lúc {WebUtility.HtmlEncode(VnTime.Format(expiresAtUtc))} (giờ Việt Nam).</p>\n",
            "    <p>Nếu bạn không yêu cầu thay đổi này, hãy bỏ qua thư.</p>\n",
            "  </div>\n</body>\n</html>\n");

    private static string EmailChangedNoticeHtml(string oldEmail, string newEmail)
        => string.Concat(
            "<!DOCTYPE html>\n<html lang=\"vi\">\n",
            "<head><meta charset=\"utf-8\"><meta name=\"referrer\" content=\"no-referrer\"><title>GMind — Email đã được đổi</title></head>\n",
            "<body style=\"font-family:'Segoe UI',Arial,sans-serif;background:#f5f7fb;padding:24px\">\n",
            "  <div style=\"max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e7ecf4;border-radius:16px;padding:32px\">\n",
            "    <h1 style=\"font-size:22px;margin:0 0 8px\">GMind</h1>\n",
            "    <h2 style=\"font-size:18px;margin:0 0 16px\">Email đăng nhập đã được đổi</h2>\n",
            $"    <p>Email đăng nhập của tài khoản {WebUtility.HtmlEncode(oldEmail)} vừa được đổi sang {WebUtility.HtmlEncode(newEmail)}.</p>\n",
            "    <p>Nếu không phải bạn thực hiện, hãy liên hệ Trưởng nhóm hoặc đặt lại mật khẩu ngay.</p>\n",
            "  </div>\n</body>\n</html>\n");

    private static string HashToken(string token)
        => Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    private static string Base64Url(byte[] bytes)
        => Convert.ToBase64String(bytes).Replace('+', '-').Replace('/', '_').TrimEnd('=');

    private static UserDto ToDto(User user)
        => new(user.Id, user.DisplayName, user.Email, user.AvatarUrl);
}
