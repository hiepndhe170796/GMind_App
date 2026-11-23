using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace GMind.Domain.Entities;

public class TaskSubmission
{
    [Key]
    public Guid Id { get; set; }

    [Required]
    public Guid TaskId { get; set; }

    [Required]
    public Guid SubmittedByUserId { get; set; }

    [MaxLength(2000)]
    public string? Note { get; set; }

    public int Version { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation properties
    public Task Task { get; set; } = null!;
    public User SubmittedBy { get; set; } = null!;
}
