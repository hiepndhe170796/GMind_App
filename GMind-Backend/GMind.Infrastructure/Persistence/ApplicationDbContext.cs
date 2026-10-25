using GMind.Application.Common;
using GMind.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Task = GMind.Domain.Entities.Task;

namespace GMind.Infrastructure.Persistence;

public class ApplicationDbContext : DbContext, IApplicationDbContext
{
    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
        : base(options)
    {
    }

    public DbSet<User> Users { get; set; }
    public DbSet<Group> Groups { get; set; }
    public DbSet<GroupMember> GroupMembers { get; set; }
    public DbSet<GroupInvite> GroupInvites { get; set; }
    public DbSet<Project> Projects { get; set; }
    public DbSet<Task> Tasks { get; set; }
    public DbSet<TaskLink> TaskLinks { get; set; }
    public DbSet<TaskComment> TaskComments { get; set; }
    public DbSet<TaskReview> TaskReviews { get; set; }
    public DbSet<Notification> Notifications { get; set; }
    public DbSet<ReminderDelivery> ReminderDeliveries { get; set; }
    public DbSet<ActivityLog> ActivityLogs { get; set; }
    public DbSet<MarketplaceRequest> MarketplaceRequests { get; set; }
    public DbSet<NotificationPreference> NotificationPreferences { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // User: unique email
        modelBuilder.Entity<User>(entity =>
        {
            entity.HasIndex(e => e.Email).IsUnique();
        });

        // Group -> creator
        modelBuilder.Entity<Group>(entity =>
        {
            entity.HasOne(g => g.CreatedBy)
                .WithMany(u => u.CreatedGroups)
                .HasForeignKey(g => g.CreatedByUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // GroupMember: unique membership per group/user
        modelBuilder.Entity<GroupMember>(entity =>
        {
            entity.HasIndex(e => new { e.GroupId, e.UserId }).IsUnique();
            entity.HasOne(gm => gm.Group)
                .WithMany(g => g.Members)
                .HasForeignKey(gm => gm.GroupId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(gm => gm.User)
                .WithMany(u => u.GroupMemberships)
                .HasForeignKey(gm => gm.UserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // GroupInvite
        modelBuilder.Entity<GroupInvite>(entity =>
        {
            entity.HasOne(i => i.Group)
                .WithMany(g => g.Invites)
                .HasForeignKey(i => i.GroupId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(i => i.CreatedBy)
                .WithMany()
                .HasForeignKey(i => i.CreatedByUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // Project
        modelBuilder.Entity<Project>(entity =>
        {
            entity.HasOne(p => p.Group)
                .WithMany(g => g.Projects)
                .HasForeignKey(p => p.GroupId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(p => p.CreatedBy)
                .WithMany()
                .HasForeignKey(p => p.CreatedByUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // Task
        modelBuilder.Entity<Task>(entity =>
        {
            entity.HasOne(t => t.Project)
                .WithMany(p => p.Tasks)
                .HasForeignKey(t => t.ProjectId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(t => t.ParentTask)
                .WithMany(t => t.Subtasks)
                .HasForeignKey(t => t.ParentTaskId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(t => t.Assignee)
                .WithMany(u => u.AssignedTasks)
                .HasForeignKey(t => t.AssigneeUserId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(t => t.CreatedBy)
                .WithMany()
                .HasForeignKey(t => t.CreatedByUserId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.Property(t => t.EstimateHours).HasPrecision(5, 2);
            entity.HasIndex(t => new { t.ProjectId, t.Status, t.DeadlineAt });
            entity.HasIndex(t => new { t.AssigneeUserId, t.Status, t.DeadlineAt });
        });

        // TaskLink
        modelBuilder.Entity<TaskLink>(entity =>
        {
            entity.HasOne(l => l.Project)
                .WithMany(p => p.Links)
                .HasForeignKey(l => l.ProjectId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(l => l.Task)
                .WithMany(t => t.Links)
                .HasForeignKey(l => l.TaskId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(l => l.CreatedBy)
                .WithMany()
                .HasForeignKey(l => l.CreatedByUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // TaskComment
        modelBuilder.Entity<TaskComment>(entity =>
        {
            entity.HasOne(c => c.Task)
                .WithMany(t => t.Comments)
                .HasForeignKey(c => c.TaskId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(c => c.Author)
                .WithMany(u => u.Comments)
                .HasForeignKey(c => c.AuthorUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // TaskReview
        modelBuilder.Entity<TaskReview>(entity =>
        {
            entity.HasOne(r => r.Task)
                .WithMany(t => t.Reviews)
                .HasForeignKey(r => r.TaskId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(r => r.Reviewer)
                .WithMany(u => u.Reviews)
                .HasForeignKey(r => r.ReviewerUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // Notification
        modelBuilder.Entity<Notification>(entity =>
        {
            entity.HasOne(n => n.Recipient)
                .WithMany(u => u.Notifications)
                .HasForeignKey(n => n.RecipientUserId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(n => n.Group)
                .WithMany()
                .HasForeignKey(n => n.GroupId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(n => new { n.RecipientUserId, n.ReadAt, n.CreatedAt });
        });

        // ReminderDelivery: deduplication
        modelBuilder.Entity<ReminderDelivery>(entity =>
        {
            entity.HasIndex(e => e.DeduplicationKey).IsUnique();
            entity.HasOne(r => r.Task)
                .WithMany(t => t.ReminderDeliveries)
                .HasForeignKey(r => r.TaskId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(r => r.Recipient)
                .WithMany()
                .HasForeignKey(r => r.RecipientUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // ActivityLog
        modelBuilder.Entity<ActivityLog>(entity =>
        {
            entity.HasOne(a => a.Actor)
                .WithMany(u => u.ActivityLogs)
                .HasForeignKey(a => a.ActorUserId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(a => a.Group)
                .WithMany(g => g.ActivityLogs)
                .HasForeignKey(a => a.GroupId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(a => a.Project)
                .WithMany(p => p.ActivityLogs)
                .HasForeignKey(a => a.ProjectId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(a => new { a.GroupId, a.CreatedAt });
        });

        // MarketplaceRequest
        modelBuilder.Entity<MarketplaceRequest>(entity =>
        {
            entity.HasOne(m => m.Group)
                .WithMany(g => g.MarketplaceRequests)
                .HasForeignKey(m => m.GroupId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(m => m.Project)
                .WithMany()
                .HasForeignKey(m => m.ProjectId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(m => m.Task)
                .WithMany(t => t.MarketplaceRequests)
                .HasForeignKey(m => m.TaskId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(m => m.RelatedTask)
                .WithMany()
                .HasForeignKey(m => m.RelatedTaskId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(m => m.RequestedBy)
                .WithMany(u => u.MarketplaceRequests)
                .HasForeignKey(m => m.RequestedByUserId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(m => m.TargetUser)
                .WithMany()
                .HasForeignKey(m => m.TargetUserId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(m => m.Reviewer)
                .WithMany()
                .HasForeignKey(m => m.ReviewerUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // NotificationPreference: one per user
        modelBuilder.Entity<NotificationPreference>(entity =>
        {
            entity.HasIndex(e => e.UserId).IsUnique();
            entity.HasOne(p => p.User)
                .WithMany()
                .HasForeignKey(p => p.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
