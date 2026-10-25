using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace GMind.Domain.Entities;

public class TaskLink
{
    [Key]
    public Guid Id { get; set; }

    [Required]
    public Guid ProjectId { get; set; }

    public Guid? TaskId { get; set; }

    [Required]
    [MaxLength(2000)]
    public string Url { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? DisplayName { get; set; }

    [MaxLength(50)]
    public string? Type { get; set; }

    public Guid CreatedByUserId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation properties
    public Project Project { get; set; } = null!;
    public Task? Task { get; set; }
    public User CreatedBy { get; set; } = null!;
}
