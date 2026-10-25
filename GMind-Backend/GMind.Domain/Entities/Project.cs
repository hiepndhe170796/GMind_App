using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GMind.Domain.Enums;

namespace GMind.Domain.Entities;

public class Project
{
    [Key]
    public Guid Id { get; set; }

    [Required]
    public Guid GroupId { get; set; }

    [Required]
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string? Description { get; set; }

    [MaxLength(100)]
    public string? Subject { get; set; }

    public DateTime? DeadlineAt { get; set; }

    public ProjectStatus Status { get; set; } = ProjectStatus.NotStarted;

    public Guid CreatedByUserId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ArchivedAt { get; set; }

    // Navigation properties
    public Group Group { get; set; } = null!;
    public User CreatedBy { get; set; } = null!;
    public ICollection<Task> Tasks { get; set; } = new List<Task>();
    public ICollection<TaskLink> Links { get; set; } = new List<TaskLink>();
    public ICollection<ActivityLog> ActivityLogs { get; set; } = new List<ActivityLog>();
}
