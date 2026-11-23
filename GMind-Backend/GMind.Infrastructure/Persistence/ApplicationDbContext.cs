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
    public DbSet<TaskSubmission> TaskSubmissions { get; set; }
    public DbSet<Notification> Notifications { get; set; }
    public DbSet<ReminderDelivery> ReminderDeliveries { get; set; }
    public DbSet<ActivityLog> ActivityLogs { get; set; }
    public DbSet<MarketplaceRequest> MarketplaceRequests { get; set; }
    public DbSet<NotificationPreference> NotificationPreferences { get; set; }
    public DbSet<GroupSettings> GroupSettings { get; set; }
    public DbSet<ContributionCredit> ContributionCredits { get; set; }
    public DbSet<TaskHelper> TaskHelpers { get; set; }
    public DbSet<UserSession> UserSessions { get; set; }
    public DbSet<EmailChangeRequest> EmailChangeRequests { get; set; }
    public DbSet<StoredFile> StoredFiles { get; set; }
    public DbSet<ProjectMessage> ProjectMessages { get; set; }
    public DbSet<ProjectMessageMention> ProjectMessageMentions { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // User: unique email
        modelBuilder.Entity<User>(entity =>
        {
            entity.HasIndex(e => e.Email).IsUnique();
            entity.Property(u => u.AuthVersion).HasDefaultValue(0).IsConcurrencyToken();
            entity.Property(u => u.PasswordResetToken).IsConcurrencyToken();
        });

        // UserSession: one row per login; the refresh hash is the rotation concurrency token.
        modelBuilder.Entity<UserSession>(entity =>
        {
            entity.HasIndex(s => s.RefreshTokenHash).IsUnique();
            entity.HasIndex(s => new { s.UserId, s.RevokedAt });
            entity.Property(s => s.RefreshTokenHash).IsConcurrencyToken();
            entity.HasOne(s => s.User)
                .WithMany()
                .HasForeignKey(s => s.UserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // EmailChangeRequest
        modelBuilder.Entity<EmailChangeRequest>(entity =>
        {
            entity.HasIndex(r => r.TokenHash).IsUnique();
            entity.HasIndex(r => new { r.UserId, r.ConsumedAt, r.CancelledAt });
            entity.HasOne(r => r.User)
                .WithMany()
                .HasForeignKey(r => r.UserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // Group -> creator
        modelBuilder.Entity<Group>(entity =>
        {
            entity.HasOne(g => g.CreatedBy)
                .WithMany(u => u.CreatedGroups)
                .HasForeignKey(g => g.CreatedByUserId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(g => g.ArchivedBy)
                .WithMany()
                .HasForeignKey(g => g.ArchivedByUserId)
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

        // TaskSubmission
        modelBuilder.Entity<TaskSubmission>(entity =>
        {
            entity.HasIndex(s => new { s.TaskId, s.Version }).IsUnique();
            entity.HasOne(s => s.Task)
                .WithMany(t => t.Submissions)
                .HasForeignKey(s => s.TaskId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(s => s.SubmittedBy)
                .WithMany()
                .HasForeignKey(s => s.SubmittedByUserId)
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

        // GroupSettings: one optional row per group (PK = GroupId)
        modelBuilder.Entity<GroupSettings>(entity =>
        {
            entity.HasOne(s => s.Group)
                .WithOne()
                .HasForeignKey<GroupSettings>(s => s.GroupId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(s => s.UpdatedBy)
                .WithMany()
                .HasForeignKey(s => s.UpdatedByUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // ContributionCredit: one credit per task (append-only ledger)
        modelBuilder.Entity<ContributionCredit>(entity =>
        {
            entity.HasIndex(c => c.TaskId).IsUnique();
            entity.HasIndex(c => new { c.ProjectId, c.UserId });
            entity.HasOne(c => c.Task)
                .WithMany()
                .HasForeignKey(c => c.TaskId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(c => c.Project)
                .WithMany()
                .HasForeignKey(c => c.ProjectId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(c => c.Group)
                .WithMany()
                .HasForeignKey(c => c.GroupId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(c => c.User)
                .WithMany()
                .HasForeignKey(c => c.UserId)
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

        // MarketplaceRequest — Status is the concurrency token for every transition.
        modelBuilder.Entity<MarketplaceRequest>(entity =>
        {
            entity.Property(m => m.Status).IsConcurrencyToken();
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

        // TaskHelper: at most one active helper row per (task, user)
        modelBuilder.Entity<TaskHelper>(entity =>
        {
            entity.HasIndex(h => new { h.TaskId, h.HelperUserId })
                .IsUnique()
                .HasFilter("[EndedAt] IS NULL");
            entity.HasIndex(h => h.HelperUserId);
            entity.HasOne(h => h.Task)
                .WithMany()
                .HasForeignKey(h => h.TaskId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(h => h.Helper)
                .WithMany()
                .HasForeignKey(h => h.HelperUserId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(h => h.MarketplaceRequest)
                .WithMany()
                .HasForeignKey(h => h.MarketplaceRequestId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(h => h.EndedBy)
                .WithMany()
                .HasForeignKey(h => h.EndedByUserId)
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

        // StoredFile: no cascade paths — every scope FK is NoAction and code nulls TaskId itself.
        modelBuilder.Entity<StoredFile>(entity =>
        {
            entity.ToTable(t => t.HasCheckConstraint("CK_StoredFiles_Scope",
                "([Kind] = 4 AND [GroupId] IS NULL AND [ProjectId] IS NULL) OR ([Kind] <> 4 AND [GroupId] IS NOT NULL AND [ProjectId] IS NOT NULL)"));
            entity.HasIndex(f => f.StorageKey).IsUnique();
            entity.HasIndex(f => new { f.ProjectId, f.Kind });
            entity.HasIndex(f => f.TaskId);
            entity.HasIndex(f => f.MessageId);
            entity.HasIndex(f => new { f.GroupId, f.DeletedAt });
            entity.HasOne(f => f.Group).WithMany().HasForeignKey(f => f.GroupId).OnDelete(DeleteBehavior.NoAction);
            entity.HasOne(f => f.Project).WithMany().HasForeignKey(f => f.ProjectId).OnDelete(DeleteBehavior.NoAction);
            entity.HasOne(f => f.Task).WithMany().HasForeignKey(f => f.TaskId).OnDelete(DeleteBehavior.NoAction);
            entity.HasOne(f => f.Message).WithMany().HasForeignKey(f => f.MessageId).OnDelete(DeleteBehavior.NoAction);
            entity.HasOne(f => f.UploadedBy).WithMany().HasForeignKey(f => f.UploadedByUserId).OnDelete(DeleteBehavior.NoAction);
        });

        // ProjectMessage: replies point inside the same project; mention rows cascade with the message.
        modelBuilder.Entity<ProjectMessage>(entity =>
        {
            entity.HasIndex(m => new { m.ProjectId, m.CreatedAt, m.Id });
            entity.HasOne(m => m.Project).WithMany().HasForeignKey(m => m.ProjectId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(m => m.Author).WithMany().HasForeignKey(m => m.AuthorUserId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(m => m.ReplyTo).WithMany().HasForeignKey(m => m.ReplyToMessageId).OnDelete(DeleteBehavior.NoAction);
            entity.HasOne(m => m.DeletedBy).WithMany().HasForeignKey(m => m.DeletedByUserId).OnDelete(DeleteBehavior.NoAction);
        });

        modelBuilder.Entity<ProjectMessageMention>(entity =>
        {
            entity.HasKey(m => new { m.MessageId, m.UserId });
            entity.HasOne(m => m.Message).WithMany(p => p.Mentions).HasForeignKey(m => m.MessageId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(m => m.User).WithMany().HasForeignKey(m => m.UserId).OnDelete(DeleteBehavior.NoAction);
        });

        modelBuilder.Entity<User>(entity =>
        {
            entity.HasOne(u => u.AvatarFile)
                .WithMany()
                .HasForeignKey(u => u.AvatarFileId)
                .OnDelete(DeleteBehavior.NoAction);
        });
    }
}
