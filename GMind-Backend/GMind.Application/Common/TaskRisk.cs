using GMind.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using TaskStatus = GMind.Domain.Enums.TaskStatus;

namespace GMind.Application.Common;

/// <summary>Per-group warning thresholds; defaults match the M3 decisions.</summary>
public record GroupThresholds(int RiskHoursBeforeDeadline = 8, int RiskProgressBelowPercent = 70, int StaleAfterHours = 24)
{
    public static readonly GroupThresholds Default = new();
}

public record TaskRiskFlags(bool IsOverdue, bool IsAtRisk, bool IsStale)
{
    public static readonly TaskRiskFlags None = new(false, false, false);
}

/// <summary>Single risk evaluator — used by the reminder worker, leader queue, my-tasks flags and member overview.</summary>
public static class TaskRisk
{
    public static TaskRiskFlags Evaluate(
        TaskStatus status, Guid? parentId, Guid? assigneeId, DateTime? deadlineUtc,
        int progress, DateTime updatedAtUtc, GroupThresholds t, DateTime nowUtc)
    {
        var topLevel = parentId == null && assigneeId != null;
        var isOverdue = topLevel && deadlineUtc != null && nowUtc > deadlineUtc && status != TaskStatus.Completed;
        var isAtRisk = topLevel
            && status is TaskStatus.ToDo or TaskStatus.InProgress or TaskStatus.ChangesRequested
            && deadlineUtc != null && deadlineUtc > nowUtc && deadlineUtc <= nowUtc.AddHours(t.RiskHoursBeforeDeadline)
            && progress < t.RiskProgressBelowPercent;
        var isStale = topLevel && status == TaskStatus.InProgress
            && updatedAtUtc <= nowUtc.AddHours(-t.StaleAfterHours);
        return new TaskRiskFlags(isOverdue, isAtRisk, isStale);
    }
}

/// <summary>Batch-loads per-group thresholds (defaults for groups without a row).</summary>
public static class GroupThresholdsLoader
{
    public static async System.Threading.Tasks.Task<Dictionary<Guid, GroupThresholds>> ForGroupsAsync(
        IApplicationDbContext db, IEnumerable<Guid> groupIds, CancellationToken ct = default)
    {
        var ids = groupIds.Distinct().ToList();
        var map = ids.ToDictionary(id => id, _ => GroupThresholds.Default);
        if (ids.Count == 0) return map;
        var rows = await db.GroupSettings.Where(s => ids.Contains(s.GroupId)).ToListAsync(ct);
        foreach (var r in rows)
            map[r.GroupId] = new GroupThresholds(r.RiskHoursBeforeDeadline, r.RiskProgressBelowPercent, r.StaleAfterHours);
        return map;
    }
}
