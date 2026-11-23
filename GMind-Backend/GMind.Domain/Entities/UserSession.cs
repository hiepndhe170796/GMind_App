using System.ComponentModel.DataAnnotations;

namespace GMind.Domain.Entities;

public static class SessionRevokedReason
{
    public const string Logout = "Logout";
    public const string Revoked = "Revoked";
    public const string RevokedOthers = "RevokedOthers";
    public const string PasswordChanged = "PasswordChanged";
    public const string PasswordReset = "PasswordReset";
    public const string Limit = "Limit";
}

public class UserSession
{
    [Key]
    public Guid Id { get; set; }

    [Required]
    public Guid UserId { get; set; }

    [Required]
    [MaxLength(256)]
    public string RefreshTokenHash { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime LastSeenAt { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAt { get; set; }
    public DateTime AbsoluteExpiresAt { get; set; }
    public DateTime? RevokedAt { get; set; }

    [MaxLength(30)]
    public string? RevokedReason { get; set; }

    [MaxLength(256)]
    public string? UserAgent { get; set; }

    [MaxLength(64)]
    public string? IpAddress { get; set; }

    // Navigation properties
    public User User { get; set; } = null!;
}
