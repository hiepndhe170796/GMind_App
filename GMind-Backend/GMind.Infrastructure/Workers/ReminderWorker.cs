using GMind.Domain.Entities;
using GMind.Domain.Enums;
using GMind.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using TaskEntity = GMind.Domain.Entities.Task;
using TaskStatus = GMind.Domain.Enums.TaskStatus;

namespace GMind.Infrastructure.Workers;

/// <summary>
/// Background worker that sends deduplicated deadline reminders:
/// 3 days, 1 day, 3 hours before deadline, and overdue — per BA defaults.
/// </summary>
public class ReminderWorker : BackgroundService
{
    private readonly IServiceProvider _services;
    private readonly ILogger<ReminderWorker> _logger;
    private static readonly TimeSpan Interval = TimeSpan.FromMinutes(15);

    public ReminderWorker(IServiceProvider services, ILogger<ReminderWorker> logger)
    {
        _services = services;
        _logger = logger;
    }

    protected override async System.Threading.Tasks.Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ProcessRemindersAsync(stoppingToken);
                await ProcessStaleTasksAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "ReminderWorker failed");
            }
            await System.Threading.Tasks.Task.Delay(Interval, stoppingToken);
        }
    }

    private async System.Threading.Tasks.Task ProcessRemindersAsync(CancellationToken ct)
    {
        using var scope = _services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var now = DateTime.UtcNow;

        // Tasks with a deadline, not completed, in active groups
        var tasks = await db.Tasks
            .Include(t => t.Project)
            .Where(t => t.DeadlineAt != null && t.Status != TaskStatus.Completed
                && t.AssigneeUserId != null && t.Project.ArchivedAt == null)
            .ToListAsync(ct);

        foreach (var task in tasks)
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
                if (now < from || now >= to) continue;

                var dedupKey = $"{task.Id}:{task.AssigneeUserId}:{type}";
                if (await db.ReminderDeliveries.AnyAsync(r => r.DeduplicationKey == dedupKey, ct))
                    continue;

                var title = type == ReminderType.Overdue ? "Task quá hạn" : "Task sắp đến hạn";
                var body = type == ReminderType.Overdue
                    ? $"Task '{task.Title}' đã quá hạn ({due:dd/MM/yyyy HH:mm} UTC)"
                    : $"Task '{task.Title}' sẽ đến hạn lúc {due:dd/MM/yyyy HH:mm} UTC";

                db.Notifications.Add(new Notification
                {
                    Id = Guid.NewGuid(),
                    RecipientUserId = task.AssigneeUserId!.Value,
                    GroupId = task.Project.GroupId,
                    Type = type == ReminderType.Overdue ? NotificationType.OverdueAlert : NotificationType.DeadlineReminder,
                    Title = title,
                    Body = body,
                    RelatedEntityType = "Task",
                    RelatedEntityId = task.Id
                });

                db.ReminderDeliveries.Add(new ReminderDelivery
                {
                    Id = Guid.NewGuid(),
                    TaskId = task.Id,
                    RecipientUserId = task.AssigneeUserId!.Value,
                    ReminderType = type,
                    ScheduledFor = from,
                    SentAt = now,
                    DeduplicationKey = dedupKey,
                    Status = "Sent"
                });
            }
        }

        await db.SaveChangesAsync(ct);
        _logger.LogInformation("ReminderWorker processed {Count} tasks", tasks.Count);
    }

    /// <summary>Risk alert: notify leaders about tasks InProgress with no update for 3+ days (dedup once/day/task).</summary>
    private async System.Threading.Tasks.Task ProcessStaleTasksAsync(CancellationToken ct)
    {
        using var scope = _services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var now = DateTime.UtcNow;
        var staleThreshold = now.AddDays(-3);

        var stale = await db.Tasks
            .Include(t => t.Project)
            .Where(t => t.Status == TaskStatus.InProgress && t.UpdatedAt < staleThreshold && t.Project.ArchivedAt == null)
            .ToListAsync(ct);

        foreach (var task in stale)
        {
            var dedupKey = $"stale:{task.Id}:{now:yyyyMMdd}";
            if (await db.ReminderDeliveries.AnyAsync(r => r.DeduplicationKey == dedupKey, ct))
                continue;

            var leaders = await db.GroupMembers
                .Where(m => m.GroupId == task.Project.GroupId && m.Role == Role.Leader && m.IsActive)
                .Select(m => m.UserId).ToListAsync(ct);

            foreach (var leaderId in leaders)
            {
                db.Notifications.Add(new Notification
                {
                    Id = Guid.NewGuid(),
                    RecipientUserId = leaderId,
                    GroupId = task.Project.GroupId,
                    Type = NotificationType.StaleTaskWarning,
                    Title = "Task bị đình trệ",
                    Body = $"Task '{task.Title}' không có cập nhật hơn 3 ngày",
                    RelatedEntityType = "Task",
                    RelatedEntityId = task.Id
                });
            }

            db.ReminderDeliveries.Add(new ReminderDelivery
            {
                Id = Guid.NewGuid(),
                TaskId = task.Id,
                RecipientUserId = leaders.FirstOrDefault(),
                ReminderType = ReminderType.Overdue,
                ScheduledFor = now,
                SentAt = now,
                DeduplicationKey = dedupKey,
                Status = "StaleWarning"
            });
        }

        await db.SaveChangesAsync(ct);
    }
}
