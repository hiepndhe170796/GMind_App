using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GMind.Domain.Enums;

namespace GMind.Domain.Entities;

public class Notification
{
    [Key]
    public Guid Id { get; set; }

    [Required]
    public Guid RecipientUserId { get; set; }

    public Guid? GroupId { get; set; }

    [Required]
    public NotificationType Type { get; set; }

    [Required]
    [MaxLength(200)]
    public string Title { get; set; } = string.Empty;

    [Required]
    [MaxLength(1000)]
    public string Body { get; set; } = string.Empty;

    [MaxLength(50)]
    public string? RelatedEntityType { get; set; }

    public Guid? RelatedEntityId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ReadAt { get; set; }

    // Navigation properties
    public User Recipient { get; set; } = null!;
    public Group? Group { get; set; }
}
