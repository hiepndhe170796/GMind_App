using System.ComponentModel.DataAnnotations;

namespace GMind.Domain.Entities;

/// <summary>An approved helper on a task (Need Help marketplace flow). View + comment only.</summary>
public class TaskHelper
{
    [Key]
    public Guid Id { get; set; }

    [Required]
    public Guid TaskId { get; set; }

    [Required]
    public Guid HelperUserId { get; set; }

    public Guid? MarketplaceRequestId { get; set; }

    [Required]
    [MaxLength(500)]
    public string Scope { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? EndedAt { get; set; }
    public Guid? EndedByUserId { get; set; }

    // Navigation properties
    public Task Task { get; set; } = null!;
    public User Helper { get; set; } = null!;
    public MarketplaceRequest? MarketplaceRequest { get; set; }
    public User? EndedBy { get; set; }
}
