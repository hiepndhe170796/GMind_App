using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace GMind.Domain.Entities;

public class GroupSettings
{
    [Key]
    public Guid GroupId { get; set; }

    public int RiskHoursBeforeDeadline { get; set; } = 8;
    public int RiskProgressBelowPercent { get; set; } = 70;
    public int StaleAfterHours { get; set; } = 24;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public Guid? UpdatedByUserId { get; set; }

    // Navigation properties
    public Group Group { get; set; } = null!;
    public User? UpdatedBy { get; set; }
}
