using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GMind.Domain.Enums;

namespace GMind.Domain.Entities;

public class GroupInvite
{
    [Key]
    public Guid Id { get; set; }

    [Required]
    public Guid GroupId { get; set; }

    [Required]
    [MaxLength(256)]
    public string TokenHash { get; set; } = string.Empty;

    [MaxLength(20)]
    public string? Code { get; set; }

    public Guid CreatedByUserId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ExpiresAt { get; set; }
    public int? MaxUses { get; set; }
    public int UsedCount { get; set; } = 0;
    public DateTime? RevokedAt { get; set; }

    // Navigation properties
    public Group Group { get; set; } = null!;
    public User CreatedBy { get; set; } = null!;
}
