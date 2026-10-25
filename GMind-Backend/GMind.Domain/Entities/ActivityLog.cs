using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace GMind.Domain.Entities;

public class ActivityLog
{
    [Key]
    public Guid Id { get; set; }

    [Required]
    public Guid ActorUserId { get; set; }

    public Guid? GroupId { get; set; }

    public Guid? ProjectId { get; set; }

    [Required]
    [MaxLength(50)]
    public string EntityType { get; set; } = string.Empty;

    public Guid? EntityId { get; set; }

    [Required]
    [MaxLength(50)]
    public string Action { get; set; } = string.Empty;

    [Required]
    [MaxLength(500)]
    public string Summary { get; set; } = string.Empty;

    public string? BeforeJson { get; set; }

    public string? AfterJson { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation properties
    public User Actor { get; set; } = null!;
    public Group? Group { get; set; }
    public Project? Project { get; set; }
}
