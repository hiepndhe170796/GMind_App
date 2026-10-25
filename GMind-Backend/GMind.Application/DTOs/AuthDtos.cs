namespace GMind.Application.DTOs;

public record UserDto(Guid Id, string DisplayName, string Email, string? AvatarUrl);

public record AuthResult(
    string AccessToken,
    string RefreshToken,
    DateTime ExpiresAt,
    UserDto User);
