using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GMind.Domain.Enums;
using TaskStatusEnum = GMind.Domain.Enums.TaskStatus;

namespace GMind.Domain.Entities;

public class Task
{
    [Key]
    public Guid Id { get; set; }

    [Required]
    public Guid ProjectId { get; set; }

    public Guid? ParentTaskId { get; set; }

    [Required]
    [MaxLength(200)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string? Description { get; set; }

    public Guid? AssigneeUserId { get; set; }

    public TaskStatusEnum Status { get; set; } = TaskStatusEnum.ToDo;

    public int ProgressPercent { get; set; } = 0;

    public Priority Priority { get; set; } = Priority.Medium;

    public decimal? EstimateHours { get; set; }

    public DateTime? DeadlineAt { get; set; }

    public int? Points { get; set; }

    public Guid CreatedByUserId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? SubmittedAt { get; set; }
    public DateTime? CompletedAt { get; set; }

    // Navigation properties
    public Project Project { get; set; } = null!;
    public Task? ParentTask { get; set; }
    public ICollection<Task> Subtasks { get; set; } = new List<Task>();
    public User? Assignee { get; set; }
    public User CreatedBy { get; set; } = null!;
    public ICollection<TaskComment> Comments { get; set; } = new List<TaskComment>();
    public ICollection<TaskReview> Reviews { get; set; } = new List<TaskReview>();
    public ICollection<TaskLink> Links { get; set; } = new List<TaskLink>();
    public ICollection<MarketplaceRequest> MarketplaceRequests { get; set; } = new List<MarketplaceRequest>();
    public ICollection<ReminderDelivery> ReminderDeliveries { get; set; } = new List<ReminderDelivery>();
    public ICollection<ActivityLog> ActivityLogs { get; set; } = new List<ActivityLog>();
}
