using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GMind.Domain.Enums;

namespace GMind.Domain.Entities;

public class GroupMember
{
    [Key]
    public Guid Id { get; set; }

    [Required]
    public Guid GroupId { get; set; }

    [Required]
    public Guid UserId { get; set; }

    [Required]
    public Role Role { get; set; }

    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
    public bool IsActive { get; set; } = true;

    // Navigation properties
    public Group Group { get; set; } = null!;
    public User User { get; set; } = null!;
}
