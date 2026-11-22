using System.ComponentModel.DataAnnotations;

namespace GMind.Domain.Entities;

public class EmailChangeRequest
{
    [Key]
    public Guid Id { get; set; }

    [Required]
    public Guid UserId { get; set; }

    [Required]
    [MaxLength(256)]
    public string NewEmail { get; set; } = string.Empty;

    [Required]
    [MaxLength(256)]
    public string TokenHash { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAt { get; set; }
    public DateTime? ConsumedAt { get; set; }
    public DateTime? CancelledAt { get; set; }

    // Navigation properties
    public User User { get; set; } = null!;
}
