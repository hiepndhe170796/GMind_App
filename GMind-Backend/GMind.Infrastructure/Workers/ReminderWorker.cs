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
                using var scope = _services.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var now = DateTime.UtcNow;
                await ReminderProcessor.ProcessRemindersAsync(db, now, stoppingToken);
                await ReminderProcessor.ProcessRiskAsync(db, now, stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "ReminderWorker failed");
            }
            await System.Threading.Tasks.Task.Delay(Interval, stoppingToken);
        }
    }
}
