using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GMind.Domain.Enums;

namespace GMind.Domain.Entities;

/// <summary>One stored object. GroupId/ProjectId are required for every kind except Avatar (check constraint).</summary>
public class StoredFile
{
    [Key]
    public Guid Id { get; set; }

    [Required]
    public FileKind Kind { get; set; }

    public Guid? GroupId { get; set; }
    public Guid? ProjectId { get; set; }
    public Guid? TaskId { get; set; }
    public Guid? MessageId { get; set; }

    [Required]
    public Guid UploadedByUserId { get; set; }

    [Required]
    [MaxLength(200)]
    public string OriginalName { get; set; } = string.Empty;

    [Required]
    [MaxLength(10)]
    public string Extension { get; set; } = string.Empty;

    [Required]
    [MaxLength(150)]
    public string ContentType { get; set; } = string.Empty;

    public long SizeBytes { get; set; }

    [Required]
    [MaxLength(100)]
    public string StorageKey { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? DeletedAt { get; set; }

    // Navigation properties
    public Group? Group { get; set; }
    public Project? Project { get; set; }
    public Task? Task { get; set; }
    public ProjectMessage? Message { get; set; }
    public User UploadedBy { get; set; } = null!;
}
