using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace GMind.Domain.Entities;

/// <summary>Points credited to the assignee when a top-level task is approved. Append-only.</summary>
public class ContributionCredit
{
    [Key]
    public Guid Id { get; set; }

    [Required]
    public Guid TaskId { get; set; }

    [Required]
    public Guid ProjectId { get; set; }

    [Required]
    public Guid GroupId { get; set; }

    [Required]
    public Guid UserId { get; set; }

    public int Points { get; set; }

    public DateTime CreditedAt { get; set; } = DateTime.UtcNow;

    // Navigation properties
    public Task Task { get; set; } = null!;
    public Project Project { get; set; } = null!;
    public Group Group { get; set; } = null!;
    public User User { get; set; } = null!;
}
