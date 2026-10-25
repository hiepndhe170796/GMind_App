using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GMind.Domain.Enums;

namespace GMind.Domain.Entities;

public class ReminderDelivery
{
    [Key]
    public Guid Id { get; set; }

    [Required]
    public Guid TaskId { get; set; }

    [Required]
    public Guid RecipientUserId { get; set; }

    [Required]
    public ReminderType ReminderType { get; set; }

    public DateTime ScheduledFor { get; set; }

    public DateTime? SentAt { get; set; }

    [Required]
    [MaxLength(200)]
    public string DeduplicationKey { get; set; } = string.Empty;

    public string? Status { get; set; }

    // Navigation properties
    public Task Task { get; set; } = null!;
    public User Recipient { get; set; } = null!;
}
