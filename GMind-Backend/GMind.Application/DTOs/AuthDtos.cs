namespace GMind.Application.DTOs;

public record UserDto(Guid Id, string DisplayName, string Email, string? AvatarUrl);

public record AuthResult(
    string AccessToken,
    string RefreshToken,
    DateTime ExpiresAt,
    UserDto User);

public record SessionDto(
    Guid Id,
    string DeviceLabel,
    string Browser,
    string Os,
    string? IpAddress,
    DateTime CreatedAt,
    DateTime LastSeenAt,
    DateTime ExpiresAt,
    bool IsCurrent);

public record EmailChangePendingDto(string PendingEmail, DateTime ExpiresAt);
