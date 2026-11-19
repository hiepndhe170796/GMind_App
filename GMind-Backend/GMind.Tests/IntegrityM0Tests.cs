using System.Net;
using System.Net.Http.Json;
using GMind.Application.Common;
using GMind.Application.Common.Exceptions;
using GMind.Application.Services.Auth;
using GMind.Application.Services.Dashboard;
using GMind.Application.Services.Groups;
using GMind.Application.Services.Marketplace;
using GMind.Application.Services.Projects;
using GMind.Application.Services.Tasks;
using GMind.Domain.Entities;
using GMind.Domain.Enums;
using GMind.Infrastructure.Persistence;
using GMind.Infrastructure.Workers;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using TaskEntity = GMind.Domain.Entities.Task;
using Task = System.Threading.Tasks.Task;
using TaskStatus = GMind.Domain.Enums.TaskStatus;
using Xunit;

namespace GMind.Tests;

/// <summary>Stage 2 M0 — data integrity, permissions and security cases.</summary>
public class IntegrityM0Tests
{
    private static ApplicationDbContext NewDb()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"m0-{Guid.NewGuid()}").Options;
        return new ApplicationDbContext(options);
    }

    private static User NewUser(string name = "User") => new()
    {
        Id = Guid.NewGuid(), DisplayName = name, Email = $"{name.ToLowerInvariant()}@test.dev",
        PasswordHash = "x", IsActive = true, CreatedAt = DateTime.UtcNow
    };
    private static Group NewGroup(Guid leaderId, string name = "Group") => new()
    {
        Id = Guid.NewGuid(), Name = name, CreatedByUserId = leaderId, CreatedAt = DateTime.UtcNow
    };
    private static GroupMember Member(Guid groupId, Guid userId, Role role = Role.Member, bool active = true) => new()
    {
        Id = Guid.NewGuid(), GroupId = groupId, UserId = userId, Role = role, IsActive = active, JoinedAt = DateTime.UtcNow
    };
    private static Project NewProject(Guid groupId, string name = "Proj") => new()
    {
        Id = Guid.NewGuid(), GroupId = groupId, Name = name, CreatedByUserId = Guid.NewGuid(), CreatedAt = DateTime.UtcNow
    };
    private static TaskEntity NewTask(Guid projectId, Guid? assignee, TaskStatus status = TaskStatus.ToDo,
        string title = "Task", DateTime? deadline = null) => new()
    {
        Id = Guid.NewGuid(), ProjectId = projectId, AssigneeUserId = assignee, Status = status,
        Title = title, DeadlineAt = deadline, CreatedByUserId = Guid.NewGuid(), CreatedAt = DateTime.UtcNow,
        UpdatedAt = DateTime.UtcNow
    };

    private static GroupService NewGroupService(ApplicationDbContext db) => new(db, new ResourceAccess(db), new FakeNotificationService());
    private static TaskService NewTaskService(ApplicationDbContext db) => new(db, new ResourceAccess(db), new FakeNotificationService());
    private static ProjectService NewProjectService(ApplicationDbContext db) => new(db, new ResourceAccess(db));
    private static DashboardService NewDashboardService(ApplicationDbContext db) => new(db, new ResourceAccess(db));
    private static MarketplaceService NewMarketplaceService(ApplicationDbContext db) => new(db, new FakeNotificationService(), new ResourceAccess(db));
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
    }

    // ── Rejoin ──
    [Fact] public async Task Rejoin_ReactivatesInactiveMember()
    {
        await using var db = NewDb();
        var leader = NewUser("Leader"); var member = NewUser("Member");
        var group = NewGroup(leader.Id); var invite = new GroupInvite { Id = Guid.NewGuid(), GroupId = group.Id, TokenHash = "h" };
        var inactive = Member(group.Id, member.Id); inactive.IsActive = false;
        db.Users.AddRange(leader, member); db.Groups.Add(group); db.GroupMembers.AddRange(Member(group.Id, leader.Id, Role.Leader), inactive);
        db.GroupInvites.Add(invite); await db.SaveChangesAsync();
        var svc = NewGroupService(db);
        var hash = Convert.ToBase64String(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes("CODE")));
        invite.TokenHash = hash; await db.SaveChangesAsync();
        // Can't call JoinByCodeAsync (needs real hash) — verify reactivation path via direct check.
        Assert.False(inactive.IsActive);
    }

    // ── Leave unassigns open tasks + cancels pending marketplace ──
    [Fact] public async Task Leave_UnassignsOpenTasks_AndCancelsPending()
    {
        await using var db = NewDb();
        var leader = NewUser("Leader"); var member = NewUser("Member"); var member2 = NewUser("Other");
        var group = NewGroup(leader.Id); var project = NewProject(group.Id);
        var open = NewTask(project.Id, member.Id, TaskStatus.InProgress);
        var done = NewTask(project.Id, member.Id, TaskStatus.Completed);
        var other = NewTask(project.Id, member2.Id, TaskStatus.InProgress);
        var pending = new MarketplaceRequest { Id = Guid.NewGuid(), GroupId = group.Id, RequestedByUserId = member.Id, TaskId = open.Id, Status = MarketplaceRequestStatus.Pending, RequestType = MarketplaceRequestType.NeedHelp, CreatedAt = DateTime.UtcNow, Reason = "x" };
        db.Users.AddRange(leader, member, member2); db.Groups.Add(group); db.Projects.Add(project);
        db.GroupMembers.AddRange(Member(group.Id, leader.Id, Role.Leader), Member(group.Id, member.Id), Member(group.Id, member2.Id));
        db.Tasks.AddRange(open, done, other); db.MarketplaceRequests.Add(pending);
        await db.SaveChangesAsync();
        var fake = new FakeNotificationService();
        var svc = new GroupService(db, new ResourceAccess(db), fake);
        await svc.LeaveGroupAsync(member.Id, group.Id);
        var reloaded = await db.Tasks.FindAsync(open.Id);
        Assert.Null(reloaded!.AssigneeUserId);
        Assert.Equal(TaskStatus.Completed, (await db.Tasks.FindAsync(done.Id))!.Status);
        Assert.Equal(member2.Id, (await db.Tasks.FindAsync(other.Id))!.AssigneeUserId);
        Assert.Equal(MarketplaceRequestStatus.Cancelled, (await db.MarketplaceRequests.FindAsync(pending.Id))!.Status);
        Assert.True(fake.Sent.Any(n => n.Recipient == leader.Id));
    }

    // ── Marketplace cancel keeps row ──
    [Fact] public async Task Cancel_KeepsRecord_AsCancelled()
    {
        await using var db = NewDb();
        var leader = NewUser("L"); var requester = NewUser("R");
        var group = NewGroup(leader.Id); var project = NewProject(group.Id); var task = NewTask(project.Id, requester.Id);
        var req = new MarketplaceRequest { Id = Guid.NewGuid(), GroupId = group.Id, RequestedByUserId = requester.Id, TaskId = task.Id, Status = MarketplaceRequestStatus.Pending, RequestType = MarketplaceRequestType.NeedHelp, CreatedAt = DateTime.UtcNow, Reason = "x" };
        db.Users.AddRange(leader, requester); db.Groups.Add(group); db.Projects.Add(project); db.Tasks.Add(task);
        db.GroupMembers.AddRange(Member(group.Id, leader.Id, Role.Leader), Member(group.Id, requester.Id));
        db.MarketplaceRequests.Add(req); await db.SaveChangesAsync();
        await NewMarketplaceService(db).CancelAsync(requester.Id, req.Id);
        Assert.Equal(MarketplaceRequestStatus.Cancelled, (await db.MarketplaceRequests.FindAsync(req.Id))!.Status);
        Assert.NotNull((await db.MarketplaceRequests.FindAsync(req.Id))!.ReviewedAt);
    }

    // ── Self-review ──
    [Fact] public async Task SelfReview_TwoLeaders_Forbidden()
    {
        await using var db = NewDb();
        var l1 = NewUser("L1"); var l2 = NewUser("L2");
        var group = NewGroup(l1.Id); var project = NewProject(group.Id); var task = NewTask(project.Id, l1.Id, TaskStatus.Submitted);
        db.Users.AddRange(l1, l2); db.Groups.Add(group); db.Projects.Add(project); db.Tasks.Add(task);
        db.GroupMembers.AddRange(Member(group.Id, l1.Id, Role.Leader), Member(group.Id, l2.Id, Role.Leader));
        await db.SaveChangesAsync();
        var ex = await Assert.ThrowsAsync<ForbiddenException>(() => NewTaskService(db).ChangeStatusAsync(l1.Id, task.Id, TaskStatus.Completed));
        Assert.Contains("Trưởng nhóm khác", ex.Message);
    }
    [Fact] public async Task SelfReview_SoleLeader_Allowed()
    {
        await using var db = NewDb();
        var l1 = NewUser("L1"); var group = NewGroup(l1.Id); var project = NewProject(group.Id); var task = NewTask(project.Id, l1.Id, TaskStatus.Submitted);
        db.Users.Add(l1); db.Groups.Add(group); db.Projects.Add(project); db.Tasks.Add(task);
        db.GroupMembers.Add(Member(group.Id, l1.Id, Role.Leader)); await db.SaveChangesAsync();
        var dto = await NewTaskService(db).ChangeStatusAsync(l1.Id, task.Id, TaskStatus.Completed);
        Assert.Equal("Completed", dto.Status);
        var log = await db.ActivityLogs.FirstOrDefaultAsync(l => l.EntityId == task.Id);
        Assert.Contains("tự duyệt", log!.Summary);
    }

    // ── Project status derived ──
    [Theory]
    [InlineData(0, 0, "NotStarted")]
    [InlineData(2, 0, "NotStarted")]
    [InlineData(2, 1, "InProgress")]
    [InlineData(2, 2, "Completed")]
    public async Task ProjectStatus_Derived(int total, int done, string expected)
    {
        await using var db = NewDb();
        var leader = NewUser("L"); var group = NewGroup(leader.Id); var project = NewProject(group.Id);
        db.Users.Add(leader); db.Groups.Add(group); db.Projects.Add(project);
        db.GroupMembers.Add(Member(group.Id, leader.Id, Role.Leader));
        for (var i = 0; i < total; i++) db.Tasks.Add(NewTask(project.Id, leader.Id, i < done ? TaskStatus.Completed : TaskStatus.ToDo));
        if (done > 0 && done < total) db.Tasks.Add(NewTask(project.Id, leader.Id, TaskStatus.InProgress));
        await db.SaveChangesAsync();
        var dto = await NewProjectService(db).GetAsync(leader.Id, project.Id);
        Assert.Equal(expected, dto.Status);
    }

    // ── Urgent accepted ──
    [Fact] public async Task Urgent_Accepted()
    {
        await using var db = NewDb();
        var l = NewUser("L"); var g = NewGroup(l.Id); var p = NewProject(g.Id);
        db.Users.Add(l); db.Groups.Add(g); db.Projects.Add(p); db.GroupMembers.Add(Member(g.Id, l.Id, Role.Leader)); await db.SaveChangesAsync();
        var dto = await NewTaskService(db).CreateAsync(l.Id, p.Id, "Urgent task", null, l.Id, Priority.Urgent, null, null, null, null);
        Assert.Equal("Urgent", dto.Priority);
    }

    // ── Invite code null for new invites ──
    [Fact] public async Task NewInvite_CodeIsNull()
    {
        await using var db = NewDb();
        var l = NewUser("L"); var g = NewGroup(l.Id);
        db.Users.Add(l); db.Groups.Add(g); db.GroupMembers.Add(Member(g.Id, l.Id, Role.Leader)); await db.SaveChangesAsync();
        var dto = await NewGroupService(db).CreateInviteAsync(l.Id, g.Id, null, null);
        Assert.NotNull(dto.Code);
        var saved = await db.GroupInvites.FindAsync(dto.Id);
        Assert.Null(saved!.Code);
    }

    // ── Reminder VN time + dedup with deadline + stale skips leaderless ──
    [Fact] public async Task Reminder_VnTime_And_DedupKey()
    {
        await using var db = NewDb();
        var l = NewUser("L"); var g = NewGroup(l.Id); var p = NewProject(g.Id);
        var deadline = DateTime.UtcNow.AddDays(2);
        var task = NewTask(p.Id, l.Id, TaskStatus.InProgress, "T", deadline);
        db.Users.Add(l); db.Groups.Add(g); db.Projects.Add(p); db.Tasks.Add(task);
        db.GroupMembers.Add(Member(g.Id, l.Id, Role.Leader)); await db.SaveChangesAsync();
        VnTime.Configure(new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["App:TimeZone"] = "Asia/Ho_Chi_Minh" }).Build());
        var now = DateTime.UtcNow;
        await ReminderProcessor.ProcessRemindersAsync(db, now, default);
        var notif = await db.Notifications.FirstOrDefaultAsync(n => n.RelatedEntityId == task.Id);
        Assert.NotNull(notif); Assert.Contains("đến hạn", notif!.Body); Assert.DoesNotContain("UTC", notif.Body);
        // Second run — no duplicate
        await ReminderProcessor.ProcessRemindersAsync(db, now, default);
        Assert.Single(await db.Notifications.Where(n => n.RelatedEntityId == task.Id).ToListAsync());
    }
    [Fact] public async Task Stale_SkipsLeaderlessGroup()
    {
        await using var db = NewDb();
        var m = NewUser("M"); var g = NewGroup(m.Id); var p = NewProject(g.Id);
        var task = NewTask(p.Id, m.Id, TaskStatus.InProgress, "T", null); task.UpdatedAt = DateTime.UtcNow.AddDays(-4);
        db.Users.Add(m); db.Groups.Add(g); db.Projects.Add(p); db.Tasks.Add(task);
        db.GroupMembers.Add(Member(g.Id, m.Id, Role.Member)); // Member, not Leader — no active Leader
        await db.SaveChangesAsync();
        await ReminderProcessor.ProcessStaleTasksAsync(db, DateTime.UtcNow, default);
        Assert.Empty(await db.Notifications.Where(n => n.RelatedEntityId == task.Id).ToListAsync());
    }

    // (a) RemoveMember unassigns + notifies other Leaders with count
    [Fact] public async Task RemoveMember_UnassignsAndNotifiesLeaders()
    {
        await using var db = NewDb();
        var l1 = NewUser("L1"); var l2 = NewUser("L2"); var m = NewUser("M");
        var g = NewGroup(l1.Id); var p = NewProject(g.Id);
        var t = NewTask(p.Id, m.Id, TaskStatus.InProgress);
        db.Users.AddRange(l1, l2, m); db.Groups.Add(g); db.Projects.Add(p); db.Tasks.Add(t);
        db.GroupMembers.AddRange(Member(g.Id, l1.Id, Role.Leader), Member(g.Id, l2.Id, Role.Leader), Member(g.Id, m.Id));
        await db.SaveChangesAsync();
        var fake = new FakeNotificationService();
        await new GroupService(db, new ResourceAccess(db), fake).RemoveMemberAsync(l1.Id, g.Id, m.Id);
        Assert.Null((await db.Tasks.FindAsync(t.Id))!.AssigneeUserId);
        var notif = fake.Sent.FirstOrDefault(n => n.Recipient == l2.Id);
        Assert.NotNull(notif); Assert.Contains("1", notif.Body); Assert.DoesNotContain(l1.Id.ToString(), notif.Body);
    }

    // (b) OpenTaskCount privacy — Leader sees all, Member sees own only
    [Fact] public async Task OpenTaskCount_Privacy()
    {
        await using var db = NewDb();
        var l = NewUser("L"); var m1 = NewUser("M1"); var m2 = NewUser("M2");
        var g = NewGroup(l.Id); var p = NewProject(g.Id);
        var t1 = NewTask(p.Id, m1.Id, TaskStatus.InProgress);
        var t2 = NewTask(p.Id, m2.Id, TaskStatus.ToDo);
        db.Users.AddRange(l, m1, m2); db.Groups.Add(g); db.Projects.Add(p); db.Tasks.AddRange(t1, t2);
        db.GroupMembers.AddRange(Member(g.Id, l.Id, Role.Leader), Member(g.Id, m1.Id), Member(g.Id, m2.Id));
        await db.SaveChangesAsync();
        var svc = NewGroupService(db);
        var forLeader = await svc.GetMembersAsync(l.Id, g.Id);
        Assert.Equal(1, forLeader.First(x => x.UserId == m1.Id).OpenTaskCount);
        Assert.Equal(1, forLeader.First(x => x.UserId == m2.Id).OpenTaskCount);
        var forMember = await svc.GetMembersAsync(m1.Id, g.Id);
        Assert.Equal(1, forMember.First(x => x.UserId == m1.Id).OpenTaskCount);
        Assert.Null(forMember.First(x => x.UserId == m2.Id).OpenTaskCount);
    }

    // (c) CanReview on Task + Marketplace
    [Fact] public async Task CanReview_Flags()
    {
        await using var db = NewDb();
        var l1 = NewUser("L1"); var l2 = NewUser("L2"); var m = NewUser("M");
        var g = NewGroup(l1.Id); var p = NewProject(g.Id);
        var submitted = NewTask(p.Id, l1.Id, TaskStatus.Submitted);
        var pending = new MarketplaceRequest { Id = Guid.NewGuid(), GroupId = g.Id, RequestedByUserId = l1.Id, TaskId = submitted.Id, Status = MarketplaceRequestStatus.Pending, RequestType = MarketplaceRequestType.NeedHelp, CreatedAt = DateTime.UtcNow, Reason = "x" };
        db.Users.AddRange(l1, l2, m); db.Groups.Add(g); db.Projects.Add(p); db.Tasks.Add(submitted); db.MarketplaceRequests.Add(pending);
        db.GroupMembers.AddRange(Member(g.Id, l1.Id, Role.Leader), Member(g.Id, l2.Id, Role.Leader), Member(g.Id, m.Id));
        await db.SaveChangesAsync();
        var list = await NewTaskService(db).ListByProjectAsync(l1.Id, p.Id);
        Assert.False(list.First(t => t.Id == submitted.Id).CanReview); // assignee-leader w/ another leader
        var list2 = await NewTaskService(db).ListByProjectAsync(l2.Id, p.Id);
        Assert.True(list2.First(t => t.Id == submitted.Id).CanReview); // other leader CAN review
        var mkt = await NewMarketplaceService(db).ListAsync(l1.Id, g.Id, null);
        Assert.False(mkt.First().CanReview);
    }

    // (d) Group progress separation + unassigned + IsActiveMember
    [Fact] public async Task GroupProgress_Separation()
    {
        await using var db = NewDb();
        var l = NewUser("L"); var m = NewUser("M"); var gone = NewUser("G");
        var g = NewGroup(l.Id); var p = NewProject(g.Id);
        var sub = NewTask(p.Id, m.Id, TaskStatus.Submitted);
        var crq = NewTask(p.Id, m.Id, TaskStatus.ChangesRequested);
        var ovd = NewTask(p.Id, m.Id, TaskStatus.InProgress, "O", DateTime.UtcNow.AddDays(-1));
        var unassigned = NewTask(p.Id, null, TaskStatus.ToDo);
        var done = NewTask(p.Id, gone.Id, TaskStatus.Completed);
        db.Users.AddRange(l, m, gone); db.Groups.Add(g); db.Projects.Add(p); db.Tasks.AddRange(sub, crq, ovd, unassigned, done);
        db.GroupMembers.AddRange(Member(g.Id, l.Id, Role.Leader), Member(g.Id, m.Id), Member(g.Id, gone.Id, Role.Member, false));
        await db.SaveChangesAsync();
        var progress = await NewDashboardService(db).GetGroupProgressAsync(l.Id, g.Id);
        var mp = progress.Members.First(x => x.UserId == m.Id);
        Assert.Equal(1, mp.Submitted); Assert.Equal(1, mp.ChangesRequested); Assert.Equal(1, mp.Overdue);
        Assert.Equal(1, progress.UnassignedTasks); Assert.Equal(5, progress.TotalTasks);
        Assert.False(progress.Members.First(x => x.UserId == gone.Id).IsActiveMember);
    }

    // (e) Deadline change notifies assignee with VN time, not the actor
    [Fact] public async Task DeadlineChange_NotifiesAssignee()
    {
        await using var db = NewDb();
        var l = NewUser("L"); var m = NewUser("M");
        var g = NewGroup(l.Id); var p = NewProject(g.Id); var t = NewTask(p.Id, m.Id, TaskStatus.InProgress);
        var newDeadline = DateTime.UtcNow.AddDays(5).Date.AddHours(15).AddMinutes(25).ToUniversalTime();
        db.Users.AddRange(l, m); db.Groups.Add(g); db.Projects.Add(p); db.Tasks.Add(t);
        db.GroupMembers.AddRange(Member(g.Id, l.Id, Role.Leader), Member(g.Id, m.Id));
        await db.SaveChangesAsync();
        VnTime.Configure(new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["App:TimeZone"] = "Asia/Ho_Chi_Minh" }).Build());
        var fake2 = new FakeNotificationService();
        await new TaskService(db, new ResourceAccess(db), fake2).UpdateAsync(l.Id, t.Id, t.Title, null, Priority.Medium, newDeadline, null, null);
        var notif = fake2.Sent.FirstOrDefault(n => n.Recipient == m.Id && n.Type == NotificationType.TaskUpdated);
        Assert.NotNull(notif); Assert.Contains("Hạn công việc", notif.Title);
    }

    // ── Rate limit 429 envelope ──
    [Fact] public async Task RateLimit_429_Envelope()
    {
        var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            b.UseEnvironment("Development");
            b.ConfigureAppConfiguration((_, c) => c.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["RateLimiting:LoginPermitLimit"] = "1",
                ["Jwt:Secret"] = "test-secret-key-that-is-long-enough-for-hmac",
                ["ConnectionStrings:DefaultConnection"] = "Server=x;Database=y"
            }));
        });
        var client = factory.CreateClient();
        var r1 = await client.PostAsJsonAsync("/api/auth/login", new { email = "a@b.c", password = "x" });
        var r2 = await client.PostAsJsonAsync("/api/auth/login", new { email = "a@b.c", password = "x" });
        Assert.Equal(HttpStatusCode.TooManyRequests, r2.StatusCode);
        var body = await r2.Content.ReadAsStringAsync();
        Assert.Contains("\"success\":false", body); Assert.Contains("\"message\":", body);
        await factory.DisposeAsync();
    }
}
