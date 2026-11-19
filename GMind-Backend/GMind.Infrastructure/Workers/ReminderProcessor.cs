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

    public static async System.Threading.Tasks.Task ProcessStaleTasksAsync(
        ApplicationDbContext db, DateTime nowUtc, CancellationToken ct)
    {
        var stale = await db.Tasks
            .Include(t => t.Project)
            .Where(t => t.Status == TaskStatus.InProgress && t.UpdatedAt < nowUtc.AddDays(-3)
                && t.Project.ArchivedAt == null && !t.Project.Group.IsArchived)
            .ToListAsync(ct);

        // Skip groups with no active Leader — never write Guid.Empty as recipient.
        var leaderGroups = await db.GroupMembers
            .Where(m => stale.Select(t => t.Project.GroupId).Contains(m.GroupId)
                && m.Role == Role.Leader && m.IsActive)
            .Select(m => new { m.GroupId, m.UserId })
            .ToListAsync(ct);
        var leadersByGroup = leaderGroups.GroupBy(g => g.GroupId).ToDictionary(g => g.Key, g => g.Select(x => x.UserId).ToList());

        foreach (var task in stale)
        {
            if (!leadersByGroup.TryGetValue(task.Project.GroupId, out var leaders) || leaders.Count == 0)
                continue;
            var dedupKey = $"stale:{task.Id}:{nowUtc:yyyyMMdd}";
            if (await db.ReminderDeliveries.AnyAsync(r => r.DeduplicationKey == dedupKey, ct))
                continue;
            foreach (var leaderId in leaders)
            {
                db.Notifications.Add(new Notification
                {
                    Id = Guid.NewGuid(), RecipientUserId = leaderId,
                    GroupId = task.Project.GroupId,
                    Type = NotificationType.StaleTaskWarning,
                    Title = "Task bị đình trệ",
                    Body = $"Task '{task.Title}' không có cập nhật hơn 3 ngày",
                    RelatedEntityType = "Task", RelatedEntityId = task.Id
                });
            }
            db.ReminderDeliveries.Add(new ReminderDelivery
            {
                Id = Guid.NewGuid(), TaskId = task.Id,
                RecipientUserId = leaders[0],
                ReminderType = ReminderType.Overdue,
                ScheduledFor = nowUtc, SentAt = nowUtc,
                DeduplicationKey = dedupKey, Status = "StaleWarning"
            });
        }
        await db.SaveChangesAsync(ct);
    }
}
