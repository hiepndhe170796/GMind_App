using GMind.Domain.Entities;
using GMind.Domain.Enums;
using GMind.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using TaskEntity = GMind.Domain.Entities.Task;
using TaskStatus = GMind.Domain.Enums.TaskStatus;
using GMind.Application.Common;

namespace GMind.Infrastructure.Workers;

/// <summary>Testable reminder/stale processing — the worker loop just calls these.</summary>
public static class ReminderProcessor
{
    public static async System.Threading.Tasks.Task ProcessRemindersAsync(
        ApplicationDbContext db, DateTime nowUtc, CancellationToken ct)
    {
        // Candidates: deadline <= now + 3 days, not completed, assignee set, project & group active.
        var candidates = await db.Tasks
            .Include(t => t.Project)
            .Where(t => t.DeadlineAt != null && t.DeadlineAt <= nowUtc.AddDays(3)
                && t.Status != TaskStatus.Completed && t.AssigneeUserId != null
                && t.Project.ArchivedAt == null && !t.Project.Group.IsArchived)
            .ToListAsync(ct);

        var taskIds = candidates.Select(t => t.Id).ToList();
        var existingKeys = await db.ReminderDeliveries
            .Where(r => taskIds.Contains(r.TaskId))
            .Select(r => r.DeduplicationKey)
            .ToHashSetAsync(ct);

        foreach (var task in candidates)
        {
            var due = task.DeadlineAt!.Value;
            var windows = new[]
            {
                (ReminderType.ThreeDaysBefore, due.AddDays(-3), due.AddDays(-1)),
                (ReminderType.OneDayBefore, due.AddDays(-1), due.AddHours(-3)),
                (ReminderType.ThreeHoursBefore, due.AddHours(-3), due),
                (ReminderType.Overdue, due, DateTime.MaxValue),
            };
            foreach (var (type, from, to) in windows)
            {
                if (nowUtc < from || nowUtc >= to) continue;
                var dedupKey = $"{task.Id}:{task.AssigneeUserId}:{type}:{due.Ticks}";
                if (existingKeys.Contains(dedupKey)) continue;

                var vn = VnTime.Format(due);
                db.Notifications.Add(new Notification
                {
                    Id = Guid.NewGuid(),
                    RecipientUserId = task.AssigneeUserId!.Value,
                    GroupId = task.Project.GroupId,
                    Type = type == ReminderType.Overdue ? NotificationType.OverdueAlert : NotificationType.DeadlineReminder,
                    Title = type == ReminderType.Overdue ? "Task quá hạn" : "Task sắp đến hạn",
                    Body = type == ReminderType.Overdue
                        ? $"Task '{task.Title}' đã quá hạn ({vn})"
                        : $"Task '{task.Title}' sẽ đến hạn lúc {vn}",
                    RelatedEntityType = "Task",
                    RelatedEntityId = task.Id
                });
                db.ReminderDeliveries.Add(new ReminderDelivery
                {
                    Id = Guid.NewGuid(), TaskId = task.Id,
                    RecipientUserId = task.AssigneeUserId!.Value,
                    ReminderType = type, ScheduledFor = from, SentAt = nowUtc,
                    DeduplicationKey = dedupKey, Status = "Sent"
                });
            }
        }
        await db.SaveChangesAsync(ct);
    }

    /// <summary>RISK-02..04: at-risk, stale and leader-overdue warnings in a few batched queries.</summary>
    public static async System.Threading.Tasks.Task ProcessRiskAsync(
        ApplicationDbContext db, DateTime nowUtc, CancellationToken ct)
    {
        // Candidates: top-level, assigned, not completed, in active projects/groups —
        // deadline within the widest risk window OR InProgress old enough for the tightest stale window.
        var maxRiskHours = (await db.GroupSettings.Select(s => (int?)s.RiskHoursBeforeDeadline).MaxAsync(ct)) ?? 8;
        var minStaleHours = (await db.GroupSettings.Select(s => (int?)s.StaleAfterHours).MinAsync(ct)) ?? 24;
        var riskCutoff = nowUtc.AddHours(Math.Max(maxRiskHours, 8));
        var staleCutoff = nowUtc.AddHours(-Math.Min(minStaleHours, 24));

        var candidates = await db.Tasks
            .Where(t => t.ParentTaskId == null && t.AssigneeUserId != null
                && t.Status != TaskStatus.Completed
                && t.Project.ArchivedAt == null && !t.Project.Group.IsArchived
                && ((t.DeadlineAt != null && t.DeadlineAt <= riskCutoff)
                    || (t.Status == TaskStatus.InProgress && t.UpdatedAt <= staleCutoff)))
            .Select(t => new
            {
                t.Id, t.Title, t.Status, t.AssigneeUserId, t.DeadlineAt,
                t.ProgressPercent, t.UpdatedAt, t.Project.GroupId,
                AssigneeName = t.Assignee!.DisplayName
            })
            .ToListAsync(ct);
        if (candidates.Count == 0) return;

        var groupIds = candidates.Select(t => t.GroupId).Distinct().ToList();
        var thresholds = await GroupThresholdsLoader.ForGroupsAsync(db, groupIds, ct);
        var leadersByGroup = (await db.GroupMembers
                .Where(m => groupIds.Contains(m.GroupId) && m.Role == Role.Leader && m.IsActive)
                .Select(m => new { m.GroupId, m.UserId })
                .ToListAsync(ct))
            .GroupBy(m => m.GroupId).ToDictionary(g => g.Key, g => g.Select(x => x.UserId).ToList());

        var taskIds = candidates.Select(t => t.Id).ToList();
        var existingKeys = await db.ReminderDeliveries
            .Where(r => taskIds.Contains(r.TaskId))
            .Select(r => r.DeduplicationKey)
            .ToHashSetAsync(ct);

        foreach (var task in candidates)
        {
            var t = thresholds[task.GroupId];
            var flags = TaskRisk.Evaluate(task.Status, null, task.AssigneeUserId, task.DeadlineAt,
                task.ProgressPercent, task.UpdatedAt, t, nowUtc);
            var leaders = leadersByGroup.GetValueOrDefault(task.GroupId) ?? [];
            var assigneeId = task.AssigneeUserId!.Value;

            if (flags.IsAtRisk)
            {
                var key = $"risk:{task.Id}:{task.DeadlineAt!.Value.Ticks}";
                if (!existingKeys.Contains(key))
                {
                    var hoursLeft = Math.Max(0, (int)Math.Ceiling((task.DeadlineAt.Value - nowUtc).TotalHours));
                    var body = $"'{task.Title}' còn {hoursLeft} giờ đến hạn ({VnTime.Format(task.DeadlineAt.Value)}) nhưng tiến độ mới {task.ProgressPercent}%.";
                    foreach (var rid in LeadersPlus(leaders, assigneeId))
                        db.Notifications.Add(Make(rid, task.GroupId, NotificationType.AtRiskWarning,
                            "Công việc có nguy cơ trễ", body, task.Id));
                    db.ReminderDeliveries.Add(Delivery(task.Id, assigneeId, ReminderType.AtRisk, key, nowUtc));
                    existingKeys.Add(key);
                }
            }

            if (flags.IsStale)
            {
                var key = $"stale:{task.Id}:{task.UpdatedAt.Ticks}";
                if (!existingKeys.Contains(key))
                {
                    var hours = (int)Math.Floor((nowUtc - task.UpdatedAt).TotalHours);
                    var body = $"'{task.Title}' chưa có cập nhật trong {hours} giờ.";
                    foreach (var rid in LeadersPlus(leaders, assigneeId))
                        db.Notifications.Add(Make(rid, task.GroupId, NotificationType.StaleTaskWarning,
                            "Công việc bị đình trệ", body, task.Id));
                    db.ReminderDeliveries.Add(Delivery(task.Id, assigneeId, ReminderType.Stale, key, nowUtc));
                    existingKeys.Add(key);
                }
            }

            if (flags.IsOverdue)
            {
                var key = $"overdue-leaders:{task.Id}:{task.DeadlineAt!.Value.Ticks}";
                if (!existingKeys.Contains(key))
                {
                    var body = $"'{task.Title}' của {task.AssigneeName} đã quá hạn ({VnTime.Format(task.DeadlineAt.Value)}).";
                    foreach (var rid in leaders.Where(l => l != assigneeId))
                        db.Notifications.Add(Make(rid, task.GroupId, NotificationType.OverdueAlert,
                            "Công việc quá hạn", body, task.Id));
                    var recipient = leaders.FirstOrDefault(l => l != assigneeId, assigneeId);
                    db.ReminderDeliveries.Add(Delivery(task.Id, recipient, ReminderType.Overdue, key, nowUtc));
                    existingKeys.Add(key);
                }
            }
        }
        await db.SaveChangesAsync(ct);
    }

    private static IEnumerable<Guid> LeadersPlus(IEnumerable<Guid> leaders, Guid assigneeId)
        => leaders.Contains(assigneeId) ? leaders : leaders.Append(assigneeId);

    private static Notification Make(Guid recipient, Guid groupId, NotificationType type, string title, string body, Guid taskId)
        => new()
        {
            Id = Guid.NewGuid(), RecipientUserId = recipient, GroupId = groupId,
            Type = type, Title = title, Body = body,
            RelatedEntityType = "Task", RelatedEntityId = taskId
        };

    private static ReminderDelivery Delivery(Guid taskId, Guid recipient, ReminderType type, string key, DateTime nowUtc)
        => new()
        {
            Id = Guid.NewGuid(), TaskId = taskId, RecipientUserId = recipient,
            ReminderType = type, ScheduledFor = nowUtc, SentAt = nowUtc,
            DeduplicationKey = key, Status = "Sent"
        };
}
