using GMind.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Task = GMind.Domain.Entities.Task;

namespace GMind.Application.Common;

public interface IApplicationDbContext
{
    DbSet<User> Users { get; }
    DbSet<Group> Groups { get; }
    DbSet<GroupMember> GroupMembers { get; }
    DbSet<GroupInvite> GroupInvites { get; }
    DbSet<Project> Projects { get; }
    DbSet<Task> Tasks { get; }
    DbSet<TaskLink> TaskLinks { get; }
    DbSet<TaskComment> TaskComments { get; }
    DbSet<TaskReview> TaskReviews { get; }
    DbSet<Notification> Notifications { get; }
    DbSet<ReminderDelivery> ReminderDeliveries { get; }
    DbSet<ActivityLog> ActivityLogs { get; }
    DbSet<MarketplaceRequest> MarketplaceRequests { get; }
    DbSet<NotificationPreference> NotificationPreferences { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
