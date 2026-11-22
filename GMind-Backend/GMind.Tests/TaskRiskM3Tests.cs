using GMind.Application.Common;
using GMind.Application.Common.Exceptions;
using GMind.Application.Services.Dashboard;
using GMind.Application.Services.Groups;
using GMind.Application.Services.Marketplace;
using GMind.Application.Services.Projects;
using GMind.Application.Services.Tasks;
using GMind.Domain.Entities;
using GMind.Domain.Enums;
using GMind.Infrastructure.Persistence;
using GMind.Infrastructure.Workers;
using Microsoft.EntityFrameworkCore;
using TaskEntity = GMind.Domain.Entities.Task;
using Task = System.Threading.Tasks.Task;
using TaskStatus = GMind.Domain.Enums.TaskStatus;
using Xunit;

namespace GMind.Tests;

/// <summary>Stage 2 M3 — risk thresholds, worker warnings, leader queue, member overview, reminders, contributions.</summary>
public class TaskRiskM3Tests
{
    private static ApplicationDbContext NewDb()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"m3-{Guid.NewGuid()}").Options;
        return new ApplicationDbContext(options);
    }

    private static User NewUser(string name = "User") => new()
    {
        Id = Guid.NewGuid(), DisplayName = name, Email = $"{name.ToLowerInvariant()}@test.dev",
        PasswordHash = "x", IsActive = true, CreatedAt = DateTime.UtcNow
    };
    private static Group NewGroup(Guid leaderId) => new()
    { Id = Guid.NewGuid(), Name = "Group", CreatedByUserId = leaderId, CreatedAt = DateTime.UtcNow };
    private static GroupMember Member(Guid groupId, Guid userId, Role role = Role.Member, bool active = true) => new()
    { Id = Guid.NewGuid(), GroupId = groupId, UserId = userId, Role = role, IsActive = active, JoinedAt = DateTime.UtcNow };
    private static Project NewProject(Guid groupId) => new()
    { Id = Guid.NewGuid(), GroupId = groupId, Name = "Proj", CreatedByUserId = Guid.NewGuid(), CreatedAt = DateTime.UtcNow };
    private static TaskEntity NewTask(Guid projectId, Guid? assignee, TaskStatus status = TaskStatus.ToDo,
        string title = "Task", DateTime? deadline = null, int? points = null) => new()
    {
        Id = Guid.NewGuid(), ProjectId = projectId, AssigneeUserId = assignee, Status = status,
        Title = title, DeadlineAt = deadline, Points = points, CreatedByUserId = Guid.NewGuid(),
        CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow
    };

    private static GroupService NewGroupService(ApplicationDbContext db) => new(db, new ResourceAccess(db), new FakeNotificationService());
    private static TaskService NewTaskService(ApplicationDbContext db) => new(db, new ResourceAccess(db), new FakeNotificationService());
    private static ProjectService NewProjectService(ApplicationDbContext db) => new(db, new ResourceAccess(db));
    private static DashboardService NewDashboardService(ApplicationDbContext db) => new(db, new ResourceAccess(db));
    private sealed class FakeNotificationService : Application.Services.Notifications.INotificationService
    {
        public List<(Guid Recipient, NotificationType Type, string Title, string Body)> Sent { get; } = new();
        public Task NotifyAsync(Guid recipient, Guid? groupId, NotificationType type, string title, string body,
            string? entityType, Guid? entityId, CancellationToken ct = default)
        { Sent.Add((recipient, type, title, body)); return Task.CompletedTask; }
        public Task<List<Application.Services.Notifications.NotificationDto>> GetMyAsync(Guid userId, bool unreadOnly, int take, CancellationToken ct = default) => Task.FromResult(new List<Application.Services.Notifications.NotificationDto>());
        public Task<int> GetUnreadCountAsync(Guid userId, CancellationToken ct = default) => Task.FromResult(0);
        public Task MarkReadAsync(Guid userId, Guid notificationId, CancellationToken ct = default) => Task.CompletedTask;
        public Task<int> MarkAllReadAsync(Guid userId, CancellationToken ct = default) => Task.FromResult(0);
        public Task<Application.Services.Notifications.NotificationPageDto> GetPageAsync(Guid userId, bool unreadOnly, string? cursor, int take, CancellationToken ct = default)
            => Task.FromResult(new Application.Services.Notifications.NotificationPageDto(new List<Application.Services.Notifications.NotificationDto>(), null));
        public Task<Application.Services.Notifications.NotificationPreferenceDto> GetPreferencesAsync(Guid userId, CancellationToken ct = default)
            => Task.FromResult(new Application.Services.Notifications.NotificationPreferenceDto(true, true, true, true));
        public Task<Application.Services.Notifications.NotificationPreferenceDto> UpdatePreferencesAsync(Guid userId, bool a, bool b, bool c, bool d, CancellationToken ct = default)
            => Task.FromResult(new Application.Services.Notifications.NotificationPreferenceDto(a, b, c, d));
    }

    // ── A2: TaskRisk evaluator ──
    [Fact] public void TaskRisk_Boundaries_And_Exclusions()
    {
        var now = new DateTime(2026, 6, 1, 12, 0, 0, DateTimeKind.Utc);
        var t = GroupThresholds.Default; // 8h / 70% / 24h
        var uid = Guid.NewGuid();
        // At-risk at exactly the boundary hour and below-threshold progress
        var f = TaskRisk.Evaluate(TaskStatus.InProgress, null, uid, now.AddHours(8), 69, now, t, now);
        Assert.False(f.IsOverdue); Assert.True(f.IsAtRisk); Assert.False(f.IsStale);
        // One minute past the window → not at risk
        Assert.False(TaskRisk.Evaluate(TaskStatus.InProgress, null, uid, now.AddHours(8).AddMinutes(1), 69, now, t, now).IsAtRisk);
        // Progress at threshold → not at risk
        Assert.False(TaskRisk.Evaluate(TaskStatus.InProgress, null, uid, now.AddHours(8), 70, now, t, now).IsAtRisk);
        // Deadline past → overdue, not at risk
        f = TaskRisk.Evaluate(TaskStatus.ToDo, null, uid, now.AddMinutes(-1), 0, now, t, now);
        Assert.True(f.IsOverdue); Assert.False(f.IsAtRisk);
        // Deadline exactly now → not yet overdue (overdue is strictly before now)
        Assert.False(TaskRisk.Evaluate(TaskStatus.InProgress, null, uid, now, 50, now, t, now).IsOverdue);
        // Stale at exactly 24h without update
        Assert.True(TaskRisk.Evaluate(TaskStatus.InProgress, null, uid, null, 50, now.AddHours(-24), t, now).IsStale);
        Assert.False(TaskRisk.Evaluate(TaskStatus.InProgress, null, uid, null, 50, now.AddHours(-23.9), t, now).IsStale);
        // Subtasks and unassigned tasks are excluded from all flags
        var sub = TaskRisk.Evaluate(TaskStatus.InProgress, Guid.NewGuid(), uid, now.AddMinutes(-1), 0, now.AddDays(-9), t, now);
        Assert.Equal(TaskRiskFlags.None, sub);
        var unassigned = TaskRisk.Evaluate(TaskStatus.InProgress, null, null, now.AddMinutes(-1), 0, now.AddDays(-9), t, now);
        Assert.Equal(TaskRiskFlags.None, unassigned);
        // Completed never flags
        Assert.Equal(TaskRiskFlags.None,
            TaskRisk.Evaluate(TaskStatus.Completed, null, uid, now.AddMinutes(-1), 100, now.AddDays(-9), t, now));
        // Submitted is not stale (only InProgress), ChangesRequested can be at risk
        Assert.False(TaskRisk.Evaluate(TaskStatus.Submitted, null, uid, null, 0, now.AddDays(-5), t, now).IsStale);
        Assert.True(TaskRisk.Evaluate(TaskStatus.ChangesRequested, null, uid, now.AddHours(2), 10, now, t, now).IsAtRisk);
    }

    // ── A3: group settings ──
    [Fact] public async Task Settings_Get_ReturnsDefaults_WithoutRow()
    {
        await using var db = NewDb();
        var l = NewUser("L"); var g = NewGroup(l.Id);
        db.Users.Add(l); db.Groups.Add(g); db.GroupMembers.Add(Member(g.Id, l.Id, Role.Leader));
        await db.SaveChangesAsync();
        var dto = await NewGroupService(db).GetSettingsAsync(l.Id, g.Id);
        Assert.True(dto.IsDefault);
        Assert.Equal(8, dto.RiskHoursBeforeDeadline);
        Assert.Equal(70, dto.RiskProgressBelowPercent);
        Assert.Equal(24, dto.StaleAfterHours);
        Assert.Empty(await db.GroupSettings.ToListAsync()); // GET must not write a row
    }

    [Fact] public async Task Settings_LeaderOnly()
    {
        await using var db = NewDb();
        var l = NewUser("L"); var m = NewUser("M"); var g = NewGroup(l.Id);
        db.Users.AddRange(l, m); db.Groups.Add(g);
        db.GroupMembers.AddRange(Member(g.Id, l.Id, Role.Leader), Member(g.Id, m.Id));
        await db.SaveChangesAsync();
        var svc = NewGroupService(db);
        await Assert.ThrowsAsync<ForbiddenException>(() => svc.GetSettingsAsync(m.Id, g.Id));
        await Assert.ThrowsAsync<ForbiddenException>(() => svc.UpdateSettingsAsync(m.Id, g.Id, 8, 70, 24));
    }

    [Fact] public async Task Settings_Put_Validates_AndPersists()
    {
        await using var db = NewDb();
        var l = NewUser("L"); var g = NewGroup(l.Id);
        db.Users.Add(l); db.Groups.Add(g); db.GroupMembers.Add(Member(g.Id, l.Id, Role.Leader));
        await db.SaveChangesAsync();
        var svc = NewGroupService(db);
        await Assert.ThrowsAsync<BadRequestException>(() => svc.UpdateSettingsAsync(l.Id, g.Id, 0, 70, 24));
        await Assert.ThrowsAsync<BadRequestException>(() => svc.UpdateSettingsAsync(l.Id, g.Id, 169, 70, 24));
        await Assert.ThrowsAsync<BadRequestException>(() => svc.UpdateSettingsAsync(l.Id, g.Id, 8, 0, 24));
        await Assert.ThrowsAsync<BadRequestException>(() => svc.UpdateSettingsAsync(l.Id, g.Id, 8, 101, 24));
        await Assert.ThrowsAsync<BadRequestException>(() => svc.UpdateSettingsAsync(l.Id, g.Id, 8, 70, 0));
        await Assert.ThrowsAsync<BadRequestException>(() => svc.UpdateSettingsAsync(l.Id, g.Id, 8, 70, 721));

        var dto = await svc.UpdateSettingsAsync(l.Id, g.Id, 12, 50, 48);
        Assert.False(dto.IsDefault);
        Assert.Equal(12, dto.RiskHoursBeforeDeadline);
        Assert.Equal("L", dto.UpdatedByName);
        var row = await db.GroupSettings.SingleAsync();
        Assert.Equal(l.Id, row.UpdatedByUserId);
        Assert.True(row.UpdatedAt > DateTime.UtcNow.AddMinutes(-1));
    }

    // ── A4: risk worker ──
    [Fact] public async Task Worker_AtRisk_Notifies_AssigneeAndLeaders_OncePerDeadline()
    {
        await using var db = NewDb();
        var l = NewUser("L"); var m = NewUser("M");
        var g = NewGroup(l.Id); var p = NewProject(g.Id);
        var now = DateTime.UtcNow;
        var task = NewTask(p.Id, m.Id, TaskStatus.InProgress, "T", now.AddHours(4));
        task.ProgressPercent = 10;
        db.Users.AddRange(l, m); db.Groups.Add(g); db.Projects.Add(p); db.Tasks.Add(task);
        db.GroupMembers.AddRange(Member(g.Id, l.Id, Role.Leader), Member(g.Id, m.Id));
        await db.SaveChangesAsync();

        await ReminderProcessor.ProcessRiskAsync(db, now, default);
        var notifs = await db.Notifications.Where(n => n.Type == NotificationType.AtRiskWarning).ToListAsync();
        Assert.Equal(2, notifs.Count); // assignee + leader
        Assert.Contains(notifs, n => n.RecipientUserId == m.Id);
        Assert.Contains(notifs, n => n.RecipientUserId == l.Id);
        var delivery = await db.ReminderDeliveries.SingleAsync();
        Assert.Equal(ReminderType.AtRisk, delivery.ReminderType);
        Assert.Equal($"risk:{task.Id}:{task.DeadlineAt!.Value.Ticks}", delivery.DeduplicationKey);

        // Second run same deadline → nothing new
        await ReminderProcessor.ProcessRiskAsync(db, now, default);
        Assert.Equal(2, await db.Notifications.CountAsync(n => n.Type == NotificationType.AtRiskWarning));
        // Deadline change → new key → warns again
        task.DeadlineAt = now.AddHours(3);
        await db.SaveChangesAsync();
        await ReminderProcessor.ProcessRiskAsync(db, now, default);
        Assert.Equal(4, await db.Notifications.CountAsync(n => n.Type == NotificationType.AtRiskWarning));
    }

    [Fact] public async Task Worker_Stale_OncePerEpisode_NewUpdateRearms()
    {
        await using var db = NewDb();
        var l = NewUser("L"); var m = NewUser("M");
        var g = NewGroup(l.Id); var p = NewProject(g.Id);
        var now = DateTime.UtcNow;
        var task = NewTask(p.Id, m.Id, TaskStatus.InProgress);
        task.UpdatedAt = now.AddHours(-30);
        db.Users.AddRange(l, m); db.Groups.Add(g); db.Projects.Add(p); db.Tasks.Add(task);
        db.GroupMembers.AddRange(Member(g.Id, l.Id, Role.Leader), Member(g.Id, m.Id));
        await db.SaveChangesAsync();

        await ReminderProcessor.ProcessRiskAsync(db, now, default);
        Assert.Equal(2, await db.Notifications.CountAsync(n => n.Type == NotificationType.StaleTaskWarning));
        var delivery = await db.ReminderDeliveries.SingleAsync();
        Assert.Equal(ReminderType.Stale, delivery.ReminderType); // M3 fix — was Overdue
        Assert.Equal($"stale:{task.Id}:{task.UpdatedAt.Ticks}", delivery.DeduplicationKey);

        await ReminderProcessor.ProcessRiskAsync(db, now, default);
        Assert.Equal(2, await db.Notifications.CountAsync(n => n.Type == NotificationType.StaleTaskWarning));
        // A new update re-arms the stale episode
        task.UpdatedAt = now.AddHours(-25);
        await db.SaveChangesAsync();
        await ReminderProcessor.ProcessRiskAsync(db, now, default);
        Assert.Equal(4, await db.Notifications.CountAsync(n => n.Type == NotificationType.StaleTaskWarning));
    }

    [Fact] public async Task Worker_Overdue_NotifiesLeaders_Once()
    {
        await using var db = NewDb();
        var l = NewUser("L"); var m = NewUser("M");
        var g = NewGroup(l.Id); var p = NewProject(g.Id);
        var now = DateTime.UtcNow;
        var task = NewTask(p.Id, m.Id, TaskStatus.InProgress, "T", now.AddHours(-2));
        db.Users.AddRange(l, m); db.Groups.Add(g); db.Projects.Add(p); db.Tasks.Add(task);
        db.GroupMembers.AddRange(Member(g.Id, l.Id, Role.Leader), Member(g.Id, m.Id));
        await db.SaveChangesAsync();

        await ReminderProcessor.ProcessRiskAsync(db, now, default);
        var notifs = await db.Notifications.Where(n => n.Type == NotificationType.OverdueAlert
            && n.RelatedEntityId == task.Id).ToListAsync();
        Assert.Single(notifs);
        Assert.Equal(l.Id, notifs[0].RecipientUserId); // leader only; assignee gets the deadline processor's own overdue flow
        await ReminderProcessor.ProcessRiskAsync(db, now, default);
        Assert.Single(await db.Notifications.Where(n => n.Type == NotificationType.OverdueAlert
            && n.RelatedEntityId == task.Id).ToListAsync());
    }

    [Fact] public async Task Worker_Skips_Subtask_Unassigned_Completed_ArchivedProject()
    {
        await using var db = NewDb();
        var l = NewUser("L"); var m = NewUser("M");
        var g = NewGroup(l.Id); var p = NewProject(g.Id);
        var now = DateTime.UtcNow;
        var parent = NewTask(p.Id, m.Id, TaskStatus.InProgress, "P", now.AddHours(2));
        parent.ProgressPercent = 80;
        var sub = NewTask(p.Id, m.Id, TaskStatus.InProgress, "S", now.AddHours(2));
        sub.ParentTaskId = parent.Id;
        var unassigned = NewTask(p.Id, null, TaskStatus.ToDo, "U", now.AddHours(-1));
        var done = NewTask(p.Id, m.Id, TaskStatus.Completed, "D", now.AddHours(-1));
        var archived = NewProject(g.Id); archived.ArchivedAt = now;
        var inArchived = NewTask(archived.Id, m.Id, TaskStatus.InProgress, "A", now.AddHours(2));
        inArchived.ProgressPercent = 0;
        db.Users.AddRange(l, m); db.Groups.Add(g); db.Projects.AddRange(p, archived);
        db.Tasks.AddRange(parent, sub, unassigned, done, inArchived);
        db.GroupMembers.AddRange(Member(g.Id, l.Id, Role.Leader), Member(g.Id, m.Id));
        await db.SaveChangesAsync();

        await ReminderProcessor.ProcessRiskAsync(db, now, default);
        var notifiedTaskIds = (await db.ReminderDeliveries.ToListAsync()).Select(d => d.TaskId).ToList();
        Assert.DoesNotContain(sub.Id, notifiedTaskIds);
        Assert.DoesNotContain(unassigned.Id, notifiedTaskIds);
        Assert.DoesNotContain(done.Id, notifiedTaskIds);
        Assert.DoesNotContain(inArchived.Id, notifiedTaskIds);
    }

    // ── A5: leader queue + my-tasks flags ──
    private static async Task<(ApplicationDbContext db, User l, User m, Group g, Project p)> SeedLeaderGroup()
    {
        var db = NewDb();
        var l = NewUser("L"); var m = NewUser("M");
        var g = NewGroup(l.Id); var p = NewProject(g.Id);
        db.Users.AddRange(l, m); db.Groups.Add(g); db.Projects.Add(p);
        db.GroupMembers.AddRange(Member(g.Id, l.Id, Role.Leader), Member(g.Id, m.Id));
        await db.SaveChangesAsync();
        return (db, l, m, g, p);
    }

    [Fact] public async Task LeaderQueue_Kinds_Permissions_AndMemberForbidden()
    {
        var (db, l, m, g, p) = await SeedLeaderGroup();
        var now = DateTime.UtcNow;
        var submitted = NewTask(p.Id, m.Id, TaskStatus.Submitted, "Sub", now.AddDays(2));
        var overdue = NewTask(p.Id, m.Id, TaskStatus.InProgress, "Ovd", now.AddHours(-5));
        var atrisk = NewTask(p.Id, m.Id, TaskStatus.InProgress, "Risk", now.AddHours(4));
        atrisk.ProgressPercent = 20;
        var stale = NewTask(p.Id, m.Id, TaskStatus.InProgress, "Stale");
        stale.UpdatedAt = now.AddHours(-30);
        var unassigned = NewTask(p.Id, null, TaskStatus.ToDo, "Free");
        var request = new MarketplaceRequest { Id = Guid.NewGuid(), GroupId = g.Id, RequestedByUserId = m.Id,
            TaskId = null, Status = MarketplaceRequestStatus.Pending, RequestType = MarketplaceRequestType.NeedHelp,
            CreatedAt = now, Reason = "x" };
        db.Tasks.AddRange(submitted, overdue, atrisk, stale, unassigned);
        db.MarketplaceRequests.Add(request);
        await db.SaveChangesAsync();

        var queue = await NewDashboardService(db).GetLeaderQueueAsync(l.Id);
        var group = Assert.Single(queue.Groups);
        Assert.Equal(g.Id, group.GroupId);
        Assert.Equal(1, group.Counts.Submitted);
        Assert.Equal(1, group.Overdue); Assert.Equal(1, group.AtRisk);
        Assert.Equal(1, group.Stale); Assert.Equal(1, group.Unassigned);
        Assert.Equal(1, group.PendingRequests);

        Assert.Equal(1, queue.Totals.Review);
        Assert.Equal(1, queue.Totals.Marketplace);
        Assert.Equal(1, queue.Totals.Overdue);
        Assert.Equal(1, queue.Totals.AtRisk);
        Assert.Equal(1, queue.Totals.Stale);
        Assert.Equal(1, queue.Totals.Unassigned);
        Assert.Equal("Review", queue.Items[0].Kind); // review first
        Assert.Contains(queue.Items, i => i.Kind == "Marketplace" && i.RequestId == request.Id);

        // A Member gets an empty queue, not an error
        var memberQueue = await NewDashboardService(db).GetLeaderQueueAsync(m.Id);
        Assert.Empty(memberQueue.Items);
        Assert.Empty(memberQueue.Groups);
    }

    [Fact] public async Task LeaderQueue_SelfReview_BlockedWhenAnotherLeader()
    {
        var (db, l, m, g, p) = await SeedLeaderGroup();
        var l2 = NewUser("L2");
        db.Users.Add(l2); db.GroupMembers.Add(Member(g.Id, l2.Id, Role.Leader));
        var task = NewTask(p.Id, l.Id, TaskStatus.Submitted, "Sub"); // leader's own task pending
        var req = new MarketplaceRequest { Id = Guid.NewGuid(), GroupId = g.Id, RequestedByUserId = l.Id,
            Status = MarketplaceRequestStatus.Pending, RequestType = MarketplaceRequestType.NeedHelp,
            CreatedAt = DateTime.UtcNow, Reason = "x" };
        db.Tasks.Add(task); db.MarketplaceRequests.Add(req);
        await db.SaveChangesAsync();

        var mine = await NewDashboardService(db).GetLeaderQueueAsync(l.Id);
        Assert.DoesNotContain(mine.Items, i => i.TaskId == task.Id);       // own review hidden
        Assert.DoesNotContain(mine.Items, i => i.RequestId == req.Id);     // own request hidden
        var other = await NewDashboardService(db).GetLeaderQueueAsync(l2.Id);
        Assert.Contains(other.Items, i => i.TaskId == task.Id && i.Kind == "Review");
        Assert.Contains(other.Items, i => i.RequestId == req.Id && i.Kind == "Marketplace");
    }

    [Fact] public async Task MyTasks_RiskFlags()
    {
        var (db, l, m, g, p) = await SeedLeaderGroup();
        var now = DateTime.UtcNow;
        var atrisk = NewTask(p.Id, m.Id, TaskStatus.InProgress, "Risk", now.AddHours(4));
        atrisk.ProgressPercent = 10;
        var stale = NewTask(p.Id, m.Id, TaskStatus.InProgress, "Stale");
        stale.UpdatedAt = now.AddHours(-30);
        var sub = NewTask(p.Id, m.Id, TaskStatus.InProgress, "Sub");
        sub.ParentTaskId = atrisk.Id; sub.UpdatedAt = now.AddHours(-30);
        db.Tasks.AddRange(atrisk, stale, sub);
        db.GroupSettings.Add(new GroupSettings { GroupId = g.Id, RiskHoursBeforeDeadline = 6, StaleAfterHours = 48 });
        await db.SaveChangesAsync();

        var tasks = await NewDashboardService(db).GetMyTasksAsync(m.Id);
        var riskDto = tasks.First(t => t.Id == atrisk.Id);
        Assert.True(riskDto.IsAtRisk); Assert.False(riskDto.IsStale);
        var staleDto = tasks.First(t => t.Id == stale.Id);
        Assert.False(staleDto.IsAtRisk); Assert.False(staleDto.IsStale); // 30h < custom 48h
        var subDto = tasks.First(t => t.Id == sub.Id);
        Assert.False(subDto.IsAtRisk); Assert.False(subDto.IsStale); // subtasks never flag
        Assert.True(tasks.All(t => t.IsAtRisk == (t.Id == atrisk.Id)));
    }

    [Fact] public async Task GroupProgress_AtRisk_PerMember_UsesGroupThresholds()
    {
        var (db, l, m, g, p) = await SeedLeaderGroup();
        var now = DateTime.UtcNow;
        var atrisk = NewTask(p.Id, m.Id, TaskStatus.InProgress, "Risk", now.AddHours(4));
        atrisk.ProgressPercent = 20;
        var ok = NewTask(p.Id, m.Id, TaskStatus.InProgress, "Ok", now.AddDays(3));
        ok.ProgressPercent = 20;
        var completed = NewTask(p.Id, m.Id, TaskStatus.Completed, "Done", now.AddHours(4)); // excluded
        var sub = NewTask(p.Id, m.Id, TaskStatus.InProgress, "Sub", now.AddHours(4)); // subtask excluded
        sub.ProgressPercent = 20; sub.ParentTaskId = atrisk.Id;
        var lRisk = NewTask(p.Id, l.Id, TaskStatus.InProgress, "LRisk", now.AddHours(4));
        lRisk.ProgressPercent = 10;
        db.Tasks.AddRange(atrisk, ok, completed, sub, lRisk);
        db.GroupSettings.Add(new GroupSettings { GroupId = g.Id, RiskHoursBeforeDeadline = 6, RiskProgressBelowPercent = 30 });
        await db.SaveChangesAsync();

        var progress = await NewDashboardService(db).GetGroupProgressAsync(l.Id, g.Id);
        var mRow = progress.Members.First(x => x.UserId == m.Id);
        Assert.Equal(1, mRow.AtRisk); // only "Risk"; ok/completed/subtask not counted
        Assert.Equal(1, progress.Members.First(x => x.UserId == l.Id).AtRisk);

        // Widen the window via settings → "ok" (3 days out) also flags at-risk.
        await NewGroupService(db).UpdateSettingsAsync(l.Id, g.Id, 80, 30, 24);
        var progress2 = await NewDashboardService(db).GetGroupProgressAsync(l.Id, g.Id);
        Assert.Equal(2, progress2.Members.First(x => x.UserId == m.Id).AtRisk);
    }

    [Fact] public void MarketplaceRules_CanReview()
    {
        Assert.True(MarketplaceRules.CanReview(Role.Leader, MarketplaceRequestStatus.Pending, Guid.NewGuid(), null, Guid.NewGuid(), false));
        var uid = Guid.NewGuid();
        Assert.False(MarketplaceRules.CanReview(Role.Leader, MarketplaceRequestStatus.Pending, uid, null, uid, true)); // self w/ other leader
        Assert.True(MarketplaceRules.CanReview(Role.Leader, MarketplaceRequestStatus.Pending, uid, null, uid, false)); // self, sole leader
        Assert.False(MarketplaceRules.CanReview(Role.Member, MarketplaceRequestStatus.Pending, Guid.NewGuid(), null, uid, false));
        Assert.False(MarketplaceRules.CanReview(Role.Leader, MarketplaceRequestStatus.Approved, Guid.NewGuid(), null, uid, false));
    }

    // ── A6: member overview ──
    [Fact] public async Task MemberOverview_Authorization_AndInactiveMember()
    {
        var (db, l, m, g, p) = await SeedLeaderGroup();
        var m2 = NewUser("M2"); var gone = NewUser("Gone"); var outsider = NewUser("Out");
        db.Users.AddRange(m2, gone, outsider);
        db.GroupMembers.AddRange(Member(g.Id, m2.Id), Member(g.Id, gone.Id, Role.Member, false));
        var task = NewTask(p.Id, gone.Id, TaskStatus.InProgress, "Old", DateTime.UtcNow.AddHours(-3));
        db.Tasks.Add(task);
        await db.SaveChangesAsync();
        var svc = NewGroupService(db);

        // Leader sees any member, incl. departed
        var ov = await svc.GetMemberOverviewAsync(l.Id, g.Id, gone.Id);
        Assert.False(ov.Member.IsActive);
        Assert.Equal(1, ov.Summary.Overdue);
        // Self view
        var self = await svc.GetMemberOverviewAsync(m.Id, g.Id, m.Id);
        Assert.Equal(m.Id, self.Member.UserId);
        // Member → other member forbidden
        await Assert.ThrowsAsync<ForbiddenException>(() => svc.GetMemberOverviewAsync(m.Id, g.Id, m2.Id));
        // Unknown user id → not found
        await Assert.ThrowsAsync<NotFoundException>(() => svc.GetMemberOverviewAsync(l.Id, g.Id, outsider.Id));
        // Non-member caller → forbidden (RequireMember)
        await Assert.ThrowsAsync<ForbiddenException>(() => svc.GetMemberOverviewAsync(outsider.Id, g.Id, m.Id));
    }

    [Fact] public async Task MemberOverview_Content_PointsAndSummary()
    {
        var (db, l, m, g, p) = await SeedLeaderGroup();
        var now = DateTime.UtcNow;
        var t1 = NewTask(p.Id, m.Id, TaskStatus.Completed, "Done", null, 5);
        t1.CompletedAt = now.AddDays(-1);
        var t2 = NewTask(p.Id, m.Id, TaskStatus.InProgress, "Wip", now.AddHours(2), 3);
        t2.ProgressPercent = 10;
        var t3 = NewTask(p.Id, l.Id, TaskStatus.Completed, "Other", null, 4);
        t3.CompletedAt = now.AddDays(-1);
        db.Tasks.AddRange(t1, t2, t3);
        db.ContributionCredits.AddRange(
            new ContributionCredit { Id = Guid.NewGuid(), TaskId = t1.Id, ProjectId = p.Id, GroupId = g.Id, UserId = m.Id, Points = 5, CreditedAt = now },
            new ContributionCredit { Id = Guid.NewGuid(), TaskId = t3.Id, ProjectId = p.Id, GroupId = g.Id, UserId = l.Id, Points = 4, CreditedAt = now });
        db.ActivityLogs.Add(new ActivityLog { Id = Guid.NewGuid(), ActorUserId = m.Id, GroupId = g.Id,
            EntityType = "Task", EntityId = t1.Id, Action = "StatusChange", Summary = "x" });
        await db.SaveChangesAsync();

        var ov = await NewGroupService(db).GetMemberOverviewAsync(l.Id, g.Id, m.Id);
        Assert.Equal(2, ov.Summary.Total);
        Assert.Equal(1, ov.Summary.Completed);
        Assert.Equal(50, ov.Summary.CompletionPercent);
        Assert.Equal(1, ov.Summary.AtRisk); // t2: 2h to deadline, 10% < 70%
        Assert.Equal(5, ov.Points.Total);
        var proj = Assert.Single(ov.Points.Projects);
        Assert.Equal(p.Id, proj.ProjectId);
        Assert.Equal(5, proj.MemberPoints);
        Assert.Equal(9, proj.ProjectCreditedPoints); // m's 5 + leader's 4
        Assert.Equal(55.6, proj.Percent);
        Assert.Single(ov.Activity);
        Assert.Equal(2, ov.Tasks.Count);
        var wip = ov.Tasks.First(t => t.Id == t2.Id);
        Assert.True(wip.IsAtRisk);
        Assert.True(wip.Permissions!.CanRemind); // leader viewer can nudge
    }

    // ── A7: manual reminder ──
    [Fact] public async Task Remind_Ok_Then409_AndPermissionFailures()
    {
        var (db, l, m, g, p) = await SeedLeaderGroup();
        var m2 = NewUser("M2");
        db.Users.Add(m2); db.GroupMembers.Add(Member(g.Id, m2.Id));
        var task = NewTask(p.Id, m.Id, TaskStatus.InProgress, "T", DateTime.UtcNow.AddDays(1));
        var done = NewTask(p.Id, m.Id, TaskStatus.Completed, "D");
        var free = NewTask(p.Id, null, TaskStatus.ToDo, "F");
        db.Tasks.AddRange(task, done, free);
        await db.SaveChangesAsync();
        var fake = new FakeNotificationService();
        var svc = new TaskService(db, new ResourceAccess(db), fake);

        await svc.RemindAsync(l.Id, task.Id); // 200 path
        var n = Assert.Single(fake.Sent);
        Assert.Equal(m.Id, n.Recipient);
        Assert.Equal(NotificationType.LeaderReminder, n.Type);
        var delivery = await db.ReminderDeliveries.SingleAsync();
        Assert.Equal(ReminderType.LeaderNudge, delivery.ReminderType);
        Assert.StartsWith($"nudge:{task.Id}:", delivery.DeduplicationKey);
        Assert.Single(await db.ActivityLogs.Where(a => a.Action == "Remind").ToListAsync());

        await Assert.ThrowsAsync<ConflictException>(() => svc.RemindAsync(l.Id, task.Id)); // once/hour
        await Assert.ThrowsAsync<ForbiddenException>(() => svc.RemindAsync(m2.Id, task.Id)); // member can't remind
        await Assert.ThrowsAsync<BadRequestException>(() => svc.RemindAsync(l.Id, done.Id)); // completed
        await Assert.ThrowsAsync<BadRequestException>(() => svc.RemindAsync(l.Id, free.Id)); // unassigned

        // Leader can't nudge their own task
        var mine = NewTask(p.Id, l.Id, TaskStatus.InProgress, "Mine");
        db.Tasks.Add(mine); await db.SaveChangesAsync();
        await Assert.ThrowsAsync<BadRequestException>(() => svc.RemindAsync(l.Id, mine.Id));
    }

    // ── A8: contributions ──
    [Fact] public async Task Contribution_CreditedOnce_AtApproval_SurvivesReassign()
    {
        var (db, l, m, g, p) = await SeedLeaderGroup();
        var m2 = NewUser("M2");
        db.Users.Add(m2); db.GroupMembers.Add(Member(g.Id, m2.Id));
        var task = NewTask(p.Id, m.Id, TaskStatus.InProgress, "T", null, 7);
        db.Tasks.Add(task); await db.SaveChangesAsync();
        var svc = NewTaskService(db);

        await svc.ChangeStatusAsync(m.Id, task.Id, TaskStatus.Submitted);
        Assert.Empty(await db.ContributionCredits.ToListAsync()); // not on submit
        await svc.ChangeStatusAsync(l.Id, task.Id, TaskStatus.Completed);
        var credit = await db.ContributionCredits.SingleAsync();
        Assert.Equal(m.Id, credit.UserId);
        Assert.Equal(7, credit.Points);
        Assert.Equal(p.Id, credit.ProjectId);
        Assert.Equal(g.Id, credit.GroupId);

        // A later assignee change does not move or revoke the credit
        // (AssignAsync rejects completed tasks; simulate the transfer at the data level)
        task.AssigneeUserId = m2.Id;
        await db.SaveChangesAsync();
        Assert.Equal(m.Id, (await db.ContributionCredits.SingleAsync()).UserId);
        // Subtask approval never credits
        var sub = NewTask(p.Id, m.Id, TaskStatus.InProgress, "S", null, 3);
        sub.ParentTaskId = task.Id;
        db.Tasks.Add(sub); await db.SaveChangesAsync();
        await svc.ChangeStatusAsync(m.Id, sub.Id, TaskStatus.Completed);
        Assert.Single(await db.ContributionCredits.ToListAsync());
    }

    [Fact] public async Task Contributions_LeaderSeesAll_MemberSeesOwnPlusTotal()
    {
        var (db, l, m, g, p) = await SeedLeaderGroup();
        var now = DateTime.UtcNow;
        var t1 = NewTask(p.Id, m.Id, TaskStatus.Completed, "A", null, 5);
        var t2 = NewTask(p.Id, l.Id, TaskStatus.Completed, "B", null, 3);
        var t3 = NewTask(p.Id, m.Id, TaskStatus.InProgress, "C", null, 4); // planned, not credited
        db.Tasks.AddRange(t1, t2, t3);
        db.ContributionCredits.AddRange(
            new ContributionCredit { Id = Guid.NewGuid(), TaskId = t1.Id, ProjectId = p.Id, GroupId = g.Id, UserId = m.Id, Points = 5, CreditedAt = now },
            new ContributionCredit { Id = Guid.NewGuid(), TaskId = t2.Id, ProjectId = p.Id, GroupId = g.Id, UserId = l.Id, Points = 3, CreditedAt = now });
        await db.SaveChangesAsync();
        var svc = NewProjectService(db);

        var leader = await svc.GetContributionsAsync(l.Id, p.Id);
        Assert.True(leader.IsLeader);
        Assert.Equal(2, leader.Members.Count);
        Assert.Equal(8, leader.TotalCredited);
        Assert.Equal(12, leader.TotalPlanned); // 5+3+4
        Assert.Equal(62.5, leader.Members.First(x => x.UserId == m.Id).Percent);

        var member = await svc.GetContributionsAsync(m.Id, p.Id);
        Assert.False(member.IsLeader);
        var row = Assert.Single(member.Members);
        Assert.Equal(m.Id, row.UserId);
        Assert.Equal(5, row.CreditedPoints);
        Assert.Equal(9, row.PlannedPoints); // 5 + 4
        Assert.Equal(8, member.TotalCredited); // project total still visible

        // Non-member → Forbidden; unknown project → NotFound
        var outsider = NewUser("O");
        db.Users.Add(outsider); await db.SaveChangesAsync();
        await Assert.ThrowsAsync<ForbiddenException>(() => svc.GetContributionsAsync(outsider.Id, p.Id));
        await Assert.ThrowsAsync<NotFoundException>(() => svc.GetContributionsAsync(l.Id, Guid.NewGuid()));
    }
}
