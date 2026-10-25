using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GMind.Domain.Enums;

namespace GMind.Domain.Entities;

public class MarketplaceRequest
{
    [Key]
    public Guid Id { get; set; }

    [Required]
    public Guid GroupId { get; set; }

    public Guid? ProjectId { get; set; }

    public Guid? TaskId { get; set; }

    [Required]
    public MarketplaceRequestType RequestType { get; set; }

    [Required]
    public Guid RequestedByUserId { get; set; }

    public Guid? TargetUserId { get; set; }

    public Guid? RelatedTaskId { get; set; }

    [Required]
    [MaxLength(1000)]
    public string Reason { get; set; } = string.Empty;

    public MarketplaceRequestStatus Status { get; set; } = MarketplaceRequestStatus.Pending;

    public Guid? ReviewerUserId { get; set; }

    [MaxLength(1000)]
    public string? ReviewComment { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ReviewedAt { get; set; }

    // Navigation properties
    public Group Group { get; set; } = null!;
    public Project? Project { get; set; }
    public Task? Task { get; set; }
    public User RequestedBy { get; set; } = null!;
    public User? TargetUser { get; set; }
    public User? Reviewer { get; set; }
    public Task? RelatedTask { get; set; }
}
