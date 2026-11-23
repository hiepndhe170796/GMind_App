using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace GMind.Domain.Entities;

public class ProjectMessage
{
    [Key]
    public Guid Id { get; set; }

    [Required]
    public Guid ProjectId { get; set; }

    [Required]
    public Guid AuthorUserId { get; set; }

    /// <summary>4000 chars max; emptied to "" when the message is deleted.</summary>
    [Required]
    [MaxLength(4000)]
    public string Body { get; set; } = string.Empty;

    public Guid? ReplyToMessageId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
    public DateTime? DeletedAt { get; set; }
    public Guid? DeletedByUserId { get; set; }

    // Navigation properties
    public Project Project { get; set; } = null!;
    public User Author { get; set; } = null!;
    public ProjectMessage? ReplyTo { get; set; }
    public User? DeletedBy { get; set; }
    public ICollection<ProjectMessageMention> Mentions { get; set; } = new List<ProjectMessageMention>();
}

public class ProjectMessageMention
{
    public Guid MessageId { get; set; }
    public Guid UserId { get; set; }

    public ProjectMessage Message { get; set; } = null!;
    public User User { get; set; } = null!;
}
