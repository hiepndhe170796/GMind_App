using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace GMind.Domain.Entities;

public class NotificationPreference
{
    [Key]
    public Guid Id { get; set; }

    [Required]
    public Guid UserId { get; set; }

    [MaxLength(50)]
    public string? Channel { get; set; }

    public bool Reminder3Days { get; set; } = true;

    public bool Reminder1Day { get; set; } = true;

    public bool Reminder3Hours { get; set; } = true;

    public bool OverdueAlert { get; set; } = true;

    // Navigation properties
    public User User { get; set; } = null!;
}
