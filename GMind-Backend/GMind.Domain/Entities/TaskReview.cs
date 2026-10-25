using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GMind.Domain.Enums;
using TaskStatusEnum = GMind.Domain.Enums.TaskStatus;

namespace GMind.Domain.Entities;

public class TaskReview
{
    [Key]
    public Guid Id { get; set; }

    [Required]
    public Guid TaskId { get; set; }

    [Required]
    public Guid ReviewerUserId { get; set; }

    [Required]
    public TaskStatusEnum Decision { get; set; }

    [MaxLength(2000)]
    public string? Comment { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public int SubmissionVersion { get; set; } = 1;

    // Navigation properties
    public Task Task { get; set; } = null!;
    public User Reviewer { get; set; } = null!;
}
