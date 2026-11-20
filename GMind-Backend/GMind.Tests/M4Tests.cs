using GMind.Application.Common;
using GMind.Application.Common.Exceptions;
using GMind.Application.Services.Dashboard;
using GMind.Application.Services.Groups;
using GMind.Application.Services.Marketplace;
using GMind.Application.Services.Notifications;
using GMind.Application.Services.Projects;
using GMind.Application.Services.Tasks;
using GMind.Domain.Entities;
using GMind.Domain.Enums;
using GMind.Infrastructure.Persistence;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using TaskEntity = GMind.Domain.Entities.Task;
using Task = System.Threading.Tasks.Task;
using TaskStatus = GMind.Domain.Enums.TaskStatus;
using Xunit;

namespace GMind.Tests;

/// <summary>Stage 2 M4 Part A — 3-party marketplace, helpers, invites, archive/restore, activity log.</summary>
public class M4Tests
{
    private static ApplicationDbContext NewDb()
        => new(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"m4-{Guid.NewGuid()}").Options);

    private static User NewUser(string name) => new()
    {
        Id = Guid.NewGuid(), DisplayName = name, Email = $"{name.ToLowerInvariant()}@test.dev",
        PasswordHash = "x", IsActive = true, CreatedAt = DateTime.UtcNow
    };
    private static Group NewGroup(Guid creatorId, bool archived = false) => new()
    { Id = Guid.NewGuid(), Name = "Group X", CreatedByUserId = creatorId, CreatedAt = DateTime.UtcNow, IsArchived = archived };
    private static GroupMember Member(Guid groupId, Guid userId, Role role = Role.Member, bool active = true) => new()
    { Id = Guid.NewGuid(), GroupId = groupId, UserId = userId, Role = role, IsActive = active, JoinedAt = DateTime.UtcNow };
    private static Project NewProject(Guid groupId, bool archived = false) => new()
    { Id = Guid.NewGuid(), GroupId = groupId, Name = "Proj", CreatedByUserId = Guid.NewGuid(), CreatedAt = DateTime.UtcNow,
        ArchivedAt = archived ? DateTime.UtcNow : null };
    private static TaskEntity NewTask(Guid projectId, Guid? assignee, TaskStatus status = TaskStatus.ToDo,
        string title = "Task", Guid? parentId = null) => new()
    {
        Id = Guid.NewGuid(), ProjectId = projectId, AssigneeUserId = assignee, Status = status,
        Title = title, ParentTaskId = parentId, CreatedByUserId = Guid.NewGuid(),
        CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow
    };
    private static MarketplaceRequest NewMR(Guid groupId, Guid taskId, Guid requester, Guid? target,
        MarketplaceRequestStatus status, MarketplaceRequestType type = MarketplaceRequestType.Transfer) => new()
    {
        Id = Guid.NewGuid(), GroupId = groupId, TaskId = taskId, RequestedByUserId = requester,
        TargetUserId = target, Status = status, RequestType = type, Reason = "r", CreatedAt = DateTime.UtcNow
    };

    private sealed class FakeNotif : INotificationService
    {
        public List<(Guid Recipient, NotificationType Type, string Title, string Body)> Sent { get; } = new();
        public Task NotifyAsync(Guid recipient, Guid? groupId, NotificationType type, string title, string body,
            string? entityType, Guid? entityId, CancellationToken ct = default)
        { Sent.Add((recipient, type, title, body)); return Task.CompletedTask; }
        public Task<List<NotificationDto>> GetMyAsync(Guid userId, bool unreadOnly, int take, CancellationToken ct = default) => Task.FromResult(new List<NotificationDto>());
        public Task<int> GetUnreadCountAsync(Guid userId, CancellationToken ct = default) => Task.FromResult(0);
        public Task MarkReadAsync(Guid userId, Guid notificationId, CancellationToken ct = default) => Task.CompletedTask;
        public Task<int> MarkAllReadAsync(Guid userId, CancellationToken ct = default) => Task.FromResult(0);
    }

    private static GroupService Grp(ApplicationDbContext db, FakeNotif n) => new(db, new ResourceAccess(db), n);
    private static TaskService TaskSvc(ApplicationDbContext db, FakeNotif n) => new(db, new ResourceAccess(db), n);
    private static TaskDetailService Detail(ApplicationDbContext db) => new(db, new ResourceAccess(db));
    private static ProjectService Proj(ApplicationDbContext db) => new(db, new ResourceAccess(db));
    private static DashboardService Dash(ApplicationDbContext db) => new(db, new ResourceAccess(db));
    private static MarketplaceService Mkt(ApplicationDbContext db, FakeNotif n) => new(db, n, new ResourceAccess(db));

    /// <summary>Leader A + members B,C + project + task assigned to B.</summary>
    private sealed record Fx(User A, User B, User C, Group G, Project P, TaskEntity T);
    private static async Task<Fx> SeedAsync(ApplicationDbContext db, int extraLeaders = 0)
    {
        var a = NewUser("Alice"); var b = NewUser("Bob"); var c = NewUser("Cara");
        var g = NewGroup(a.Id); var p = NewProject(g.Id); var t = NewTask(p.Id, b.Id, TaskStatus.InProgress);
        p.CreatedByUserId = a.Id; t.CreatedByUserId = a.Id; // real users — required on SQLite FK enforcement
        db.Users.AddRange(a, b, c); db.Groups.Add(g); db.Projects.Add(p); db.Tasks.Add(t);
        db.GroupMembers.AddRange(Member(g.Id, a.Id, Role.Leader), Member(g.Id, b.Id), Member(g.Id, c.Id));
        for (var i = 0; i < extraLeaders; i++)
        {
            var l = NewUser($"L{i}");
            db.Users.Add(l); db.GroupMembers.Add(Member(g.Id, l.Id, Role.Leader));
        }
        await db.SaveChangesAsync();
        return new Fx(a, b, c, g, p, t);
    }

    // ── A2: create ──

    [Fact] public async Task Create_Status_TargetVsOpen()
    {
        await using var db = NewDb(); var f = await SeedAsync(db); var n = new FakeNotif();
        var m = Mkt(db, n);
        var targeted = await m.CreateAsync(f.B.Id, f.G.Id, MarketplaceRequestType.Transfer, f.T.Id, f.C.Id, null, "busy", null);
        Assert.Equal("AwaitingRecipient", targeted.Status);
        var open = await m.CreateAsync(f.B.Id, f.G.Id, MarketplaceRequestType.NeedHelp, f.T.Id, null, null, "r", "phần test");
        Assert.Equal("Open", open.Status);
        // Swap requires a target.
        await Assert.ThrowsAsync<BadRequestException>(() =>
            m.CreateAsync(f.B.Id, f.G.Id, MarketplaceRequestType.Swap, f.T.Id, null, null, "r", null));
        // Target invite notification for AwaitingRecipient; open broadcast for Open (not requester).
        Assert.Contains(n.Sent, s => s.Recipient == f.C.Id && s.Type == NotificationType.MarketplaceResponseNeeded);
        Assert.Contains(n.Sent, s => s.Recipient == f.C.Id && s.Type == NotificationType.MarketplaceOpenRequest);
        Assert.DoesNotContain(n.Sent, s => s.Recipient == f.B.Id && s.Type == NotificationType.MarketplaceOpenRequest);
        // leader A is an active member ≠ requester → gets the open broadcast;
        // "no Leader notification" means no MarketplaceRequestCreated (approval) ping at creation.
        Assert.Contains(n.Sent, s => s.Recipient == f.A.Id && s.Type == NotificationType.MarketplaceOpenRequest);
        Assert.DoesNotContain(n.Sent, s => s.Type == NotificationType.MarketplaceRequestCreated);
    }

    [Fact] public async Task Create_NeedHelp_ScopeValidation()
    {
        await using var db = NewDb(); var f = await SeedAsync(db);
        var m = Mkt(db, new FakeNotif());
        await Assert.ThrowsAsync<BadRequestException>(() =>
            m.CreateAsync(f.B.Id, f.G.Id, MarketplaceRequestType.NeedHelp, f.T.Id, null, null, "r", "  "));
        await Assert.ThrowsAsync<BadRequestException>(() =>
            m.CreateAsync(f.B.Id, f.G.Id, MarketplaceRequestType.NeedHelp, f.T.Id, null, null, "r", new string('x', 501)));
        // scope must be null for non-NeedHelp
        await Assert.ThrowsAsync<BadRequestException>(() =>
            m.CreateAsync(f.B.Id, f.G.Id, MarketplaceRequestType.Transfer, f.T.Id, f.C.Id, null, "r", "scope"));
        // non-member creator forbidden
        var outsider = NewUser("Out"); db.Users.Add(outsider); await db.SaveChangesAsync();
        await Assert.ThrowsAsync<ForbiddenException>(() =>
            m.CreateAsync(outsider.Id, f.G.Id, MarketplaceRequestType.NeedHelp, f.T.Id, null, null, "r", "scope"));
    }

    [Fact] public async Task Create_Subtask_And_Swap_RelatedTask_Validation()
    {
        await using var db = NewDb(); var f = await SeedAsync(db);
        var m = Mkt(db, new FakeNotif());
        var sub = NewTask(f.P.Id, f.B.Id, TaskStatus.ToDo, "sub", f.T.Id);
        var otherTask = NewTask(f.P.Id, f.C.Id);
        db.Tasks.AddRange(sub, otherTask); await db.SaveChangesAsync();
        await Assert.ThrowsAsync<BadRequestException>(() =>
            m.CreateAsync(f.B.Id, f.G.Id, MarketplaceRequestType.Transfer, sub.Id, f.C.Id, null, "r", null));
        // swap requires related task
        await Assert.ThrowsAsync<BadRequestException>(() =>
            m.CreateAsync(f.B.Id, f.G.Id, MarketplaceRequestType.Swap, f.T.Id, f.C.Id, null, "r", null));
        // related task with active transfer → 409
        db.MarketplaceRequests.Add(NewMR(f.G.Id, otherTask.Id, f.C.Id, null, MarketplaceRequestStatus.Open));
        await db.SaveChangesAsync();
        await Assert.ThrowsAsync<ConflictException>(() =>
            m.CreateAsync(f.B.Id, f.G.Id, MarketplaceRequestType.Swap, f.T.Id, f.C.Id, otherTask.Id, "r", null));
    }

    [Fact] public async Task Create_Duplicate_ActiveRequest_409()
    {
        await using var db = NewDb(); var f = await SeedAsync(db);
        var m = Mkt(db, new FakeNotif());
        await m.CreateAsync(f.B.Id, f.G.Id, MarketplaceRequestType.Transfer, f.T.Id, f.C.Id, null, "r", null);
        await Assert.ThrowsAsync<ConflictException>(() =>
            m.CreateAsync(f.B.Id, f.G.Id, MarketplaceRequestType.Transfer, f.T.Id, f.C.Id, null, "r2", null));
    }

    [Fact] public async Task Create_NeedHelp_TargetAlreadyHelper_409()
    {
        await using var db = NewDb(); var f = await SeedAsync(db);
        db.TaskHelpers.Add(new TaskHelper { Id = Guid.NewGuid(), TaskId = f.T.Id, HelperUserId = f.C.Id, Scope = "s" });
        await db.SaveChangesAsync();
        var m = Mkt(db, new FakeNotif());
        await Assert.ThrowsAsync<ConflictException>(() =>
            m.CreateAsync(f.B.Id, f.G.Id, MarketplaceRequestType.NeedHelp, f.T.Id, f.C.Id, null, "r", "scope"));
    }

    // ── A2: respond ──

    [Fact] public async Task Respond_Auth_WrongStatus_Decline()
    {
        await using var db = NewDb(); var f = await SeedAsync(db);
        var n = new FakeNotif(); var m = Mkt(db, n);
        var req = await m.CreateAsync(f.B.Id, f.G.Id, MarketplaceRequestType.Transfer, f.T.Id, f.C.Id, null, "r", null);
        // non-target cannot respond
        await Assert.ThrowsAsync<ForbiddenException>(() => m.RespondAsync(f.B.Id, req.Id, true, null));
        // decline → Declined + requester notified
        var declined = await m.RespondAsync(f.C.Id, req.Id, false, "no time");
        Assert.Equal("Declined", declined.Status);
        Assert.Equal("no time", declined.RecipientComment);
        Assert.NotNull(declined.RespondedAt);
        Assert.Contains(n.Sent, s => s.Recipient == f.B.Id && s.Type == NotificationType.MarketplaceRecipientDeclined);
        // wrong status afterwards → 400
        await Assert.ThrowsAsync<BadRequestException>(() => m.RespondAsync(f.C.Id, req.Id, true, null));
    }

    [Fact] public async Task Respond_Accept_Pending_And_Revalidation()
    {
        await using var db = NewDb(); var f = await SeedAsync(db);
        var n = new FakeNotif(); var m = Mkt(db, n);
        var req = await m.CreateAsync(f.B.Id, f.G.Id, MarketplaceRequestType.Transfer, f.T.Id, f.C.Id, null, "r", null);
        var accepted = await m.RespondAsync(f.C.Id, req.Id, true, "ok");
        Assert.Equal("Pending", accepted.Status);
        Assert.Contains(n.Sent, s => s.Recipient == f.B.Id && s.Type == NotificationType.MarketplaceRecipientAccepted);
        Assert.Contains(n.Sent, s => s.Recipient == f.A.Id && s.Type == NotificationType.MarketplaceRequestCreated);

        // revalidation: task reassigned before accept → 409
        var f2 = await SeedAsync(db);
        var req2 = await m.CreateAsync(f2.B.Id, f2.G.Id, MarketplaceRequestType.Transfer, f2.T.Id, f2.C.Id, null, "r", null);
        var task2 = await db.Tasks.FindAsync(f2.T.Id);
        task2!.AssigneeUserId = f2.C.Id;
        await db.SaveChangesAsync();
        await Assert.ThrowsAsync<ConflictException>(() => m.RespondAsync(f2.C.Id, req2.Id, true, null));
    }

    // ── A2: claim ──

    [Fact] public async Task Claim_Permissions_And_Success()
    {
        await using var db = NewDb(); var f = await SeedAsync(db);
        var n = new FakeNotif(); var m = Mkt(db, n);
        var open = await m.CreateAsync(f.B.Id, f.G.Id, MarketplaceRequestType.NeedHelp, f.T.Id, null, null, "r", "phần tài liệu");
        await Assert.ThrowsAsync<ForbiddenException>(() => m.ClaimAsync(f.B.Id, open.Id, null)); // own request
        var claimed = await m.ClaimAsync(f.C.Id, open.Id, "tôi làm được");
        Assert.Equal("Pending", claimed.Status);
        Assert.Equal(f.C.Id, claimed.TargetUserId);
        Assert.Equal("tôi làm được", claimed.RecipientComment);
        Assert.NotNull(claimed.ClaimedAt);
        Assert.NotNull(claimed.RespondedAt);
        Assert.Contains(n.Sent, s => s.Recipient == f.B.Id && s.Type == NotificationType.MarketplaceClaimed);
        Assert.Contains(n.Sent, s => s.Recipient == f.A.Id && s.Type == NotificationType.MarketplaceRequestCreated);
        // no longer open → 409 on second claim
        await Assert.ThrowsAsync<ConflictException>(() => m.ClaimAsync(f.A.Id, open.Id, null));
    }

    [Fact] public async Task Claim_AlreadyHelper_409()
    {
        await using var db = NewDb(); var f = await SeedAsync(db);
        db.TaskHelpers.Add(new TaskHelper { Id = Guid.NewGuid(), TaskId = f.T.Id, HelperUserId = f.C.Id, Scope = "s" });
        await db.SaveChangesAsync();
        var m = Mkt(db, new FakeNotif());
        var open = await m.CreateAsync(f.B.Id, f.G.Id, MarketplaceRequestType.NeedHelp, f.T.Id, null, null, "r", "scope");
        await Assert.ThrowsAsync<ConflictException>(() => m.ClaimAsync(f.C.Id, open.Id, null));
    }

    [Fact] public async Task Claim_Race_OneSucceeds()
    {
        await using var conn = new SqliteConnection("Data Source=:memory:");
        await conn.OpenAsync();
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseSqlite(conn).Options;
        await using var db1 = new ApplicationDbContext(options);
        await db1.Database.EnsureCreatedAsync();
        var f = await SeedAsync(db1);
        var req = NewMR(f.G.Id, f.T.Id, f.B.Id, null, MarketplaceRequestStatus.Open, MarketplaceRequestType.NeedHelp);
        req.HelpScope = "s";
        db1.MarketplaceRequests.Add(req); await db1.SaveChangesAsync();

        await using var db2 = new ApplicationDbContext(options);
        var m1 = Mkt(db1, new FakeNotif()); var m2 = Mkt(db2, new FakeNotif());
        var winner = await m1.ClaimAsync(f.C.Id, req.Id, null);
        Assert.Equal("Pending", winner.Status);
        await Assert.ThrowsAnyAsync<Exception>(async () =>
        {
            try { await m2.ClaimAsync(f.A.Id, req.Id, null); }
            catch (ConflictException) { throw; }
            catch (DbUpdateConcurrencyException) { throw new ConflictException("raced"); }
        });
        // after the race, the request must be claimed exactly once
        db1.ChangeTracker.Clear();
        var saved = await db1.MarketplaceRequests.FindAsync(req.Id);
        Assert.Equal(f.C.Id, saved!.TargetUserId);
        Assert.Equal(MarketplaceRequestStatus.Pending, saved.Status);
    }

    // ── A2: approve / reject / cancel ──

    [Fact] public async Task Approve_OnlyPending()
    {
        await using var db = NewDb(); var f = await SeedAsync(db);
        var m = Mkt(db, new FakeNotif());
        var open = await m.CreateAsync(f.B.Id, f.G.Id, MarketplaceRequestType.NeedHelp, f.T.Id, null, null, "r", "s");
        await Assert.ThrowsAsync<BadRequestException>(() => m.ApproveAsync(f.A.Id, open.Id, null));
        var targeted = await m.CreateAsync(f.B.Id, f.G.Id, MarketplaceRequestType.Transfer, f.T.Id, f.C.Id, null, "r", null);
        await Assert.ThrowsAsync<BadRequestException>(() => m.ApproveAsync(f.A.Id, targeted.Id, null));
    }

    [Fact] public async Task Approve_PartyRule_And_SelfApproveLog()
    {
        await using var db = NewDb(); var f = await SeedAsync(db);
        var m = Mkt(db, new FakeNotif());
        // request created by leader A on A's own task targeting B — A is a party and the sole leader → may self-approve
        var tA = NewTask(f.P.Id, f.A.Id);
        db.Tasks.Add(tA); await db.SaveChangesAsync();
        var req = await m.CreateAsync(f.A.Id, f.G.Id, MarketplaceRequestType.Transfer, tA.Id, f.B.Id, null, "r", null);
        var pending = await m.RespondAsync(f.B.Id, req.Id, true, null);
        Assert.Equal("Pending", pending.Status);
        var approved = await m.ApproveAsync(f.A.Id, req.Id, null);
        Assert.Equal("Approved", approved.Status);
        var log = await db.ActivityLogs.Where(a => a.EntityId == tA.Id && a.Action == "Transfer").FirstAsync();
        Assert.Contains("(tự duyệt)", log.Summary);

        // with a second leader, party leader A is blocked
        var second = NewUser("Zed");
        db.Users.Add(second); db.GroupMembers.Add(Member(f.G.Id, second.Id, Role.Leader));
        var t2 = NewTask(f.P.Id, f.A.Id);
        db.Tasks.Add(t2);
        await db.SaveChangesAsync();
        var req2 = await m.CreateAsync(f.A.Id, f.G.Id, MarketplaceRequestType.Transfer, t2.Id, f.B.Id, null, "r", null);
        await m.RespondAsync(f.B.Id, req2.Id, true, null);
        await Assert.ThrowsAsync<ForbiddenException>(() => m.ApproveAsync(f.A.Id, req2.Id, null));
        var ok = await m.ApproveAsync(second.Id, req2.Id, null);
        Assert.Equal("Approved", ok.Status);
    }

    [Fact] public async Task Approve_Transfer_ChangesAssignee_CancelsOthers()
    {
        await using var db = NewDb(); var f = await SeedAsync(db);
        var m = Mkt(db, new FakeNotif());
        var req = await m.CreateAsync(f.B.Id, f.G.Id, MarketplaceRequestType.Transfer, f.T.Id, f.C.Id, null, "r", null);
        await m.RespondAsync(f.C.Id, req.Id, true, null);
        // a second active request on the same task must auto-cancel on approval
        var other = NewMR(f.G.Id, f.T.Id, f.B.Id, null, MarketplaceRequestStatus.Open, MarketplaceRequestType.NeedHelp);
        other.HelpScope = "s";
        db.MarketplaceRequests.Add(other); await db.SaveChangesAsync();
        await m.ApproveAsync(f.A.Id, req.Id, null);
        var task = await db.Tasks.FindAsync(f.T.Id);
        Assert.Equal(f.C.Id, task!.AssigneeUserId);
        var cancelled = await db.MarketplaceRequests.FindAsync(other.Id);
        Assert.Equal(MarketplaceRequestStatus.Cancelled, cancelled!.Status);
        Assert.Contains("yêu cầu khác", cancelled.ReviewComment);
    }

    [Fact] public async Task Approve_Swap_Exchanges()
    {
        await using var db = NewDb(); var f = await SeedAsync(db);
        var t2 = NewTask(f.P.Id, f.C.Id); db.Tasks.Add(t2); await db.SaveChangesAsync();
        var m = Mkt(db, new FakeNotif());
        var req = await m.CreateAsync(f.B.Id, f.G.Id, MarketplaceRequestType.Swap, f.T.Id, f.C.Id, t2.Id, "r", null);
        await m.RespondAsync(f.C.Id, req.Id, true, null);
        await m.ApproveAsync(f.A.Id, req.Id, null);
        var t1 = await db.Tasks.FindAsync(f.T.Id); var t2r = await db.Tasks.FindAsync(t2.Id);
        Assert.Equal(f.C.Id, t1!.AssigneeUserId);
        Assert.Equal(f.B.Id, t2r!.AssigneeUserId);
    }

    [Fact] public async Task Approve_NeedHelp_CreatesHelper_Notifies()
    {
        await using var db = NewDb(); var f = await SeedAsync(db);
        var n = new FakeNotif(); var m = Mkt(db, n);
        var req = await m.CreateAsync(f.B.Id, f.G.Id, MarketplaceRequestType.NeedHelp, f.T.Id, f.C.Id, null, "r", "phần docs");
        await m.RespondAsync(f.C.Id, req.Id, true, null);
        await m.ApproveAsync(f.A.Id, req.Id, null);
        var helper = await db.TaskHelpers.SingleAsync(h => h.TaskId == f.T.Id);
        Assert.Equal(f.C.Id, helper.HelperUserId);
        Assert.Equal("phần docs", helper.Scope);
        Assert.Null(helper.EndedAt);
        Assert.Equal(req.Id, helper.MarketplaceRequestId);
        Assert.Contains(n.Sent, s => s.Recipient == f.C.Id && s.Type == NotificationType.HelperAdded);
        // task status and assignee unchanged
        var task = await db.Tasks.FindAsync(f.T.Id);
        Assert.Equal(f.B.Id, task!.AssigneeUserId);
        Assert.Equal(TaskStatus.InProgress, task.Status);
    }

    [Fact] public async Task Approve_HelperBecomesAssignee_EndsHelper()
    {
        await using var db = NewDb(); var f = await SeedAsync(db);
        // C is already a helper on the task; transfer to C ends the helper row.
        db.TaskHelpers.Add(new TaskHelper { Id = Guid.NewGuid(), TaskId = f.T.Id, HelperUserId = f.C.Id, Scope = "s" });
        await db.SaveChangesAsync();
        var m = Mkt(db, new FakeNotif());
        var req = await m.CreateAsync(f.B.Id, f.G.Id, MarketplaceRequestType.Transfer, f.T.Id, f.C.Id, null, "r", null);
        await m.RespondAsync(f.C.Id, req.Id, true, null);
        await m.ApproveAsync(f.A.Id, req.Id, null);
        var helper = await db.TaskHelpers.SingleAsync(h => h.TaskId == f.T.Id);
        Assert.NotNull(helper.EndedAt);
        Assert.Equal(f.A.Id, helper.EndedByUserId);
    }

    [Fact] public async Task Reject_FromAllActiveStates()
    {
        await using var db = NewDb(); var f = await SeedAsync(db);
        var m = Mkt(db, new FakeNotif());
        foreach (var status in new[] { MarketplaceRequestStatus.Open, MarketplaceRequestStatus.AwaitingRecipient, MarketplaceRequestStatus.Pending })
        {
            var r = NewMR(f.G.Id, f.T.Id, f.B.Id, status == MarketplaceRequestStatus.Open ? null : f.C.Id, status);
            db.MarketplaceRequests.Add(r); await db.SaveChangesAsync();
            var rejected = await m.RejectAsync(f.A.Id, r.Id, "no");
            Assert.Equal("Rejected", rejected.Status);
        }
    }

    [Fact] public async Task Reject_PartyRule()
    {
        await using var db = NewDb(); var f = await SeedAsync(db, extraLeaders: 1);
        var m = Mkt(db, new FakeNotif());
        // A (leader) is requester → party; another leader exists → A cannot reject
        var r = NewMR(f.G.Id, f.T.Id, f.A.Id, f.C.Id, MarketplaceRequestStatus.AwaitingRecipient);
        db.MarketplaceRequests.Add(r); await db.SaveChangesAsync();
        await Assert.ThrowsAsync<ForbiddenException>(() => m.RejectAsync(f.A.Id, r.Id, "no"));
    }

    [Fact] public async Task Cancel_ByRequester_AllActiveStates()
    {
        await using var db = NewDb(); var f = await SeedAsync(db);
        var m = Mkt(db, new FakeNotif());
        foreach (var status in new[] { MarketplaceRequestStatus.Open, MarketplaceRequestStatus.AwaitingRecipient, MarketplaceRequestStatus.Pending })
        {
            var r = NewMR(f.G.Id, f.T.Id, f.B.Id, status == MarketplaceRequestStatus.Open ? null : f.C.Id, status);
            db.MarketplaceRequests.Add(r); await db.SaveChangesAsync();
            await m.CancelAsync(f.B.Id, r.Id);
            Assert.Equal(MarketplaceRequestStatus.Cancelled, (await db.MarketplaceRequests.FindAsync(r.Id))!.Status);
        }
        // non-requester cannot cancel
        var r2 = NewMR(f.G.Id, f.T.Id, f.B.Id, null, MarketplaceRequestStatus.Open);
        db.MarketplaceRequests.Add(r2); await db.SaveChangesAsync();
        await Assert.ThrowsAsync<ForbiddenException>(() => m.CancelAsync(f.C.Id, r2.Id));
        await Assert.ThrowsAsync<ForbiddenException>(() => m.CancelAsync(f.A.Id, r2.Id));
    }

    // ── A2: incoming / swap-candidates / workload ──

    [Fact] public async Task Incoming_And_SwapCandidates()
    {
        await using var db = NewDb(); var f = await SeedAsync(db);
        var m = Mkt(db, new FakeNotif());
        var req = await m.CreateAsync(f.B.Id, f.G.Id, MarketplaceRequestType.Transfer, f.T.Id, f.C.Id, null, "r", null);
        var incoming = await m.IncomingAsync(f.C.Id);
        Assert.Single(incoming);
        Assert.True(incoming[0].CanRespond);
        Assert.Empty(await m.IncomingAsync(f.A.Id));
        // swap candidates: C's assigned tasks without active transfer/swap
        var ct = NewTask(f.P.Id, f.C.Id, TaskStatus.InProgress); db.Tasks.Add(ct); await db.SaveChangesAsync();
        var cands = await m.SwapCandidatesAsync(f.B.Id, f.G.Id, f.C.Id);
        Assert.Single(cands); Assert.Equal(ct.Id, cands[0].Id);
        // member can call for others? no — target must be a member (it is); outsider forbidden
        var outsider = NewUser("Out"); db.Users.Add(outsider); await db.SaveChangesAsync();
        await Assert.ThrowsAsync<ForbiddenException>(() => m.SwapCandidatesAsync(outsider.Id, f.G.Id, f.C.Id));
    }

    [Fact] public async Task List_Workload_LeaderOnly()
    {
        await using var db = NewDb(); var f = await SeedAsync(db);
        var m = Mkt(db, new FakeNotif());
        var t2 = NewTask(f.P.Id, f.C.Id, TaskStatus.InProgress); db.Tasks.Add(t2); await db.SaveChangesAsync();
        var req = await m.CreateAsync(f.B.Id, f.G.Id, MarketplaceRequestType.Transfer, f.T.Id, f.C.Id, null, "r", null);
        var leaderList = await m.ListAsync(f.A.Id, f.G.Id, null);
        var row = leaderList.Single(x => x.Id == req.Id);
        Assert.NotNull(row.RequesterOpenTasks);
        Assert.NotNull(row.TargetOpenTasks);
        Assert.Equal(1, row.TargetOpenTasks); // C owns t2 only; f.T is B's
        var memberList = await m.ListAsync(f.B.Id, f.G.Id, null);
        var mrow = memberList.Single(x => x.Id == req.Id);
        Assert.Null(mrow.RequesterOpenTasks);
        Assert.Null(mrow.TargetOpenTasks);
    }

    // ── A2: auto-cancel call sites ──

    [Fact] public async Task Cleanup_Reassign_And_Completion()
    {
        await using var db = NewDb(); var f = await SeedAsync(db);
        var n = new FakeNotif(); var ts = TaskSvc(db, n);
        var r1 = NewMR(f.G.Id, f.T.Id, f.B.Id, f.C.Id, MarketplaceRequestStatus.AwaitingRecipient);
        db.MarketplaceRequests.Add(r1); await db.SaveChangesAsync();
        await ts.AssignAsync(f.A.Id, f.T.Id, f.C.Id);
        Assert.Equal(MarketplaceRequestStatus.Cancelled, (await db.MarketplaceRequests.FindAsync(r1.Id))!.Status);

        var r2 = NewMR(f.G.Id, f.T.Id, f.C.Id, null, MarketplaceRequestStatus.Open);
        db.MarketplaceRequests.Add(r2); await db.SaveChangesAsync();
        // Leaders complete via the approve path: Submitted → Completed.
        (await db.Tasks.FindAsync(f.T.Id))!.Status = TaskStatus.Submitted;
        await db.SaveChangesAsync();
        await ts.ChangeStatusAsync(f.A.Id, f.T.Id, TaskStatus.Completed);
        Assert.Equal(MarketplaceRequestStatus.Cancelled, (await db.MarketplaceRequests.FindAsync(r2.Id))!.Status);
    }

    [Fact] public async Task Cleanup_ProjectArchive_And_GroupArchive()
    {
        await using var db = NewDb(); var f = await SeedAsync(db);
        var r = NewMR(f.G.Id, f.T.Id, f.B.Id, null, MarketplaceRequestStatus.Open);
        db.MarketplaceRequests.Add(r); await db.SaveChangesAsync();
        await Proj(db).ArchiveAsync(f.A.Id, f.P.Id);
        Assert.Equal(MarketplaceRequestStatus.Cancelled, (await db.MarketplaceRequests.FindAsync(r.Id))!.Status);

        // new project+task; archive the whole group
        var g2 = NewGroup(f.A.Id); var p2 = NewProject(g2.Id); var t2 = NewTask(p2.Id, f.B.Id);
        db.Groups.Add(g2); db.Projects.Add(p2); db.Tasks.Add(t2);
        db.GroupMembers.AddRange(Member(g2.Id, f.A.Id, Role.Leader), Member(g2.Id, f.B.Id), Member(g2.Id, f.C.Id));
        var r2 = NewMR(g2.Id, t2.Id, f.B.Id, f.C.Id, MarketplaceRequestStatus.Pending);
        db.MarketplaceRequests.Add(r2); await db.SaveChangesAsync();
        await Grp(db, new FakeNotif()).ArchiveGroupAsync(f.A.Id, g2.Id, g2.Name);
        Assert.Equal(MarketplaceRequestStatus.Cancelled, (await db.MarketplaceRequests.FindAsync(r2.Id))!.Status);
    }

    [Fact] public async Task Cleanup_MemberLeave_CancelsAndEndsHelpers()
    {
        await using var db = NewDb(); var f = await SeedAsync(db);
        var r = NewMR(f.G.Id, f.T.Id, f.C.Id, null, MarketplaceRequestStatus.Open);
        db.MarketplaceRequests.Add(r);
        var h = new TaskHelper { Id = Guid.NewGuid(), TaskId = f.T.Id, HelperUserId = f.C.Id, Scope = "s" };
        db.TaskHelpers.Add(h); await db.SaveChangesAsync();
        await Grp(db, new FakeNotif()).RemoveMemberAsync(f.A.Id, f.G.Id, f.C.Id);
        Assert.Equal(MarketplaceRequestStatus.Cancelled, (await db.MarketplaceRequests.FindAsync(r.Id))!.Status);
        var ended = await db.TaskHelpers.FindAsync(h.Id);
        Assert.NotNull(ended!.EndedAt);
        Assert.Equal(f.A.Id, ended.EndedByUserId);
    }

    // ── A3: helpers ──

    [Fact] public async Task Helper_Access_Comment_NoLink()
    {
        await using var db = NewDb(); var f = await SeedAsync(db);
        db.TaskHelpers.Add(new TaskHelper { Id = Guid.NewGuid(), TaskId = f.T.Id, HelperUserId = f.C.Id, Scope = "s" });
        await db.SaveChangesAsync();
        var ts = TaskSvc(db, new FakeNotif()); var ds = Detail(db);
        var dto = await ts.GetAsync(f.C.Id, f.T.Id);
        Assert.True(dto.Permissions!.IsHelper);
        Assert.True(dto.Permissions!.CanComment);
        Assert.False(dto.Permissions!.CanAddLink);
        // helper can comment
        var c = await ds.AddCommentAsync(f.C.Id, f.T.Id, "helping out");
        Assert.Equal(f.T.Id, c.TaskId);
        // helper cannot add links
        await Assert.ThrowsAsync<ForbiddenException>(() => ds.AddLinkAsync(f.C.Id, f.T.Id, "https://x.dev", null, null));
        // helper cannot transition
        await Assert.ThrowsAsync<ForbiddenException>(() => ts.ChangeStatusAsync(f.C.Id, f.T.Id, TaskStatus.ToDo));
    }

    [Fact] public async Task Helper_Ended_403()
    {
        await using var db = NewDb(); var f = await SeedAsync(db);
        var h = new TaskHelper { Id = Guid.NewGuid(), TaskId = f.T.Id, HelperUserId = f.C.Id, Scope = "s", EndedAt = DateTime.UtcNow, EndedByUserId = f.A.Id };
        db.TaskHelpers.Add(h); await db.SaveChangesAsync();
        // C keeps member-level access: GET returns a reduced summary with no detail access…
        var dto = await TaskSvc(db, new FakeNotif()).GetAsync(f.C.Id, f.T.Id);
        Assert.False(dto.CanViewDetails);
        // …and the sub-resource endpoints (RequireTaskDetailsAsync) deny her outright.
        await Assert.ThrowsAsync<ForbiddenException>(() => Detail(db).AddCommentAsync(f.C.Id, f.T.Id, "x"));
        await Assert.ThrowsAsync<ForbiddenException>(() => Detail(db).ListCommentsAsync(f.C.Id, f.T.Id));
        // An outsider whose helper row ended loses the only access they ever had.
        var outsider = NewUser("Out");
        db.Users.Add(outsider);
        db.TaskHelpers.Add(new TaskHelper { Id = Guid.NewGuid(), TaskId = f.T.Id, HelperUserId = outsider.Id, Scope = "s", EndedAt = DateTime.UtcNow, EndedByUserId = f.A.Id });
        await db.SaveChangesAsync();
        await Assert.ThrowsAsync<ForbiddenException>(() => TaskSvc(db, new FakeNotif()).GetAsync(outsider.Id, f.T.Id));
        await Assert.ThrowsAsync<ForbiddenException>(() => Detail(db).AddCommentAsync(outsider.Id, f.T.Id, "x"));
    }

    [Fact] public async Task Helper_End_Permissions_And_Twice()
    {
        await using var db = NewDb(); var f = await SeedAsync(db);
        var h = new TaskHelper { Id = Guid.NewGuid(), TaskId = f.T.Id, HelperUserId = f.C.Id, Scope = "s" };
        db.TaskHelpers.Add(h); await db.SaveChangesAsync();
        var ts = TaskSvc(db, new FakeNotif());
        // helper cannot end own relationship; member B is assignee → can end
        await Assert.ThrowsAsync<ForbiddenException>(() => ts.EndHelperAsync(f.C.Id, f.T.Id, h.Id));
        await ts.EndHelperAsync(f.B.Id, f.T.Id, h.Id);
        Assert.NotNull((await db.TaskHelpers.FindAsync(h.Id))!.EndedAt);
        // ending twice → 400
        await Assert.ThrowsAsync<BadRequestException>(() => ts.EndHelperAsync(f.A.Id, f.T.Id, h.Id));
        // unrelated task id → 404
        await Assert.ThrowsAsync<NotFoundException>(() => ts.EndHelperAsync(f.A.Id, Guid.NewGuid(), h.Id));
    }

    [Fact] public async Task Dashboard_Helping()
    {
        await using var db = NewDb(); var f = await SeedAsync(db);
        db.TaskHelpers.Add(new TaskHelper { Id = Guid.NewGuid(), TaskId = f.T.Id, HelperUserId = f.C.Id, Scope = "s" });
        var ended = new TaskHelper { Id = Guid.NewGuid(), TaskId = f.T.Id, HelperUserId = f.A.Id, Scope = "s", EndedAt = DateTime.UtcNow };
        db.TaskHelpers.Add(ended);
        await db.SaveChangesAsync();
        var helping = await Dash(db).GetHelpingAsync(f.C.Id);
        Assert.Single(helping);
        Assert.Equal(f.T.Id, helping[0].TaskId);
        Assert.Empty(await Dash(db).GetHelpingAsync(f.A.Id)); // A's row is ended
    }

    [Fact] public async Task TaskHelpers_FilteredUniqueIndex()
    {
        await using var conn = new SqliteConnection("Data Source=:memory:");
        await conn.OpenAsync();
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseSqlite(conn).Options;
        await using var db = new ApplicationDbContext(options);
        await db.Database.EnsureCreatedAsync();
        var f = await SeedAsync(db);
        db.TaskHelpers.Add(new TaskHelper { Id = Guid.NewGuid(), TaskId = f.T.Id, HelperUserId = f.C.Id, Scope = "s" });
        await db.SaveChangesAsync();
        // second ACTIVE row for same task+helper violates the filtered unique index
        db.TaskHelpers.Add(new TaskHelper { Id = Guid.NewGuid(), TaskId = f.T.Id, HelperUserId = f.C.Id, Scope = "s2" });
        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        db.ChangeTracker.Clear();
        // an ended row for the same pair is allowed
        db.TaskHelpers.Add(new TaskHelper { Id = Guid.NewGuid(), TaskId = f.T.Id, HelperUserId = f.C.Id, Scope = "s2",
            EndedAt = DateTime.UtcNow, EndedByUserId = f.A.Id });
        await db.SaveChangesAsync();
    }

    [Fact] public async Task RemindedRecently_OnlyRemindedTask()
    {
        await using var db = NewDb(); var f = await SeedAsync(db);
        var t2 = NewTask(f.P.Id, f.B.Id, TaskStatus.InProgress); db.Tasks.Add(t2); await db.SaveChangesAsync();
        var ts = TaskSvc(db, new FakeNotif());
        await ts.RemindAsync(f.A.Id, f.T.Id);
        var reminded = await ts.GetAsync(f.A.Id, f.T.Id);
        var other = await ts.GetAsync(f.A.Id, t2.Id);
        Assert.True(reminded.Permissions!.RemindedRecently);
        Assert.False(other.Permissions!.RemindedRecently);
    }

    // ── A4: invites ──

    [Fact] public async Task Invites_LeaderOnly_And_StatusPrecedence()
    {
        await using var db = NewDb(); var f = await SeedAsync(db);
        var g = Grp(db, new FakeNotif());
        await Assert.ThrowsAsync<ForbiddenException>(() => g.ListInvitesAsync(f.B.Id, f.G.Id));
        var inv = await g.CreateInviteAsync(f.A.Id, f.G.Id, "team label", DateTime.UtcNow.AddDays(1), 5);
        var expired = new GroupInvite { Id = Guid.NewGuid(), GroupId = f.G.Id, TokenHash = "h1", Label = "old",
            CreatedByUserId = f.A.Id, ExpiresAt = DateTime.UtcNow.AddDays(-1) };
        var revokedExpired = new GroupInvite { Id = Guid.NewGuid(), GroupId = f.G.Id, TokenHash = "h2",
            CreatedByUserId = f.A.Id, ExpiresAt = DateTime.UtcNow.AddDays(-1), RevokedAt = DateTime.UtcNow };
        var exhausted = new GroupInvite { Id = Guid.NewGuid(), GroupId = f.G.Id, TokenHash = "h3",
            CreatedByUserId = f.A.Id, MaxUses = 2, UsedCount = 2 };
        db.GroupInvites.AddRange(expired, revokedExpired, exhausted);
        await db.SaveChangesAsync();
        var list = await g.ListInvitesAsync(f.A.Id, f.G.Id);
        Assert.Equal(4, list.Count);
        Assert.Equal("Revoked", list.Single(i => i.Id == revokedExpired.Id).Status); // revoked wins over expired
        Assert.Equal("Expired", list.Single(i => i.Id == expired.Id).Status);
        Assert.Equal("Exhausted", list.Single(i => i.Id == exhausted.Id).Status);
        Assert.Equal("Active", list.Single(i => i.Id == inv.Id).Status);
        Assert.Equal("team label", list.Single(i => i.Id == inv.Id).Label);
        Assert.Equal("Active", list[0].Status); // active first
    }

    [Fact] public async Task Invites_ValidationBounds()
    {
        await using var db = NewDb(); var f = await SeedAsync(db);
        var g = Grp(db, new FakeNotif());
        var now = DateTime.UtcNow;
        await Assert.ThrowsAsync<BadRequestException>(() => g.CreateInviteAsync(f.A.Id, f.G.Id, null, now.AddMinutes(59), null));
        await Assert.ThrowsAsync<BadRequestException>(() => g.CreateInviteAsync(f.A.Id, f.G.Id, null, now.AddDays(90).AddMinutes(1), null));
        await Assert.ThrowsAsync<BadRequestException>(() => g.CreateInviteAsync(f.A.Id, f.G.Id, null, null, 0));
        await Assert.ThrowsAsync<BadRequestException>(() => g.CreateInviteAsync(f.A.Id, f.G.Id, null, null, 501));
        await Assert.ThrowsAsync<BadRequestException>(() => g.CreateInviteAsync(f.A.Id, f.G.Id, new string('x', 101), null, null));
        var ok = await g.CreateInviteAsync(f.A.Id, f.G.Id, null, now.AddHours(1).AddMinutes(1), 500);
        Assert.NotNull(ok.Code);
    }

    [Fact] public async Task Invites_RevokeTwice_And_JoinFailures()
    {
        await using var db = NewDb(); var f = await SeedAsync(db);
        var g = Grp(db, new FakeNotif());
        var inv = await g.CreateInviteAsync(f.A.Id, f.G.Id, null, null, null);
        await g.RevokeInviteAsync(f.A.Id, inv.Id);
        await Assert.ThrowsAsync<BadRequestException>(() => g.RevokeInviteAsync(f.A.Id, inv.Id));
        var joiner = NewUser("Join"); db.Users.Add(joiner); await db.SaveChangesAsync();
        await Assert.ThrowsAsync<BadRequestException>(() => g.JoinByCodeAsync(joiner.Id, inv.Code!));

        // expired invite
        var expired = new GroupInvite { Id = Guid.NewGuid(), GroupId = f.G.Id, TokenHash = "dead",
            CreatedByUserId = f.A.Id, ExpiresAt = DateTime.UtcNow.AddMinutes(-5) };
        db.GroupInvites.Add(expired); await db.SaveChangesAsync();
        // join-by-token path uses TokenHash — construct an invite via service with a short expiry instead
        var short_ = await g.CreateInviteAsync(f.A.Id, f.G.Id, null, DateTime.UtcNow.AddMinutes(61), null);
        var savedShort = await db.GroupInvites.FindAsync(short_.Id);
        savedShort!.ExpiresAt = DateTime.UtcNow.AddMinutes(-5); // force expiry
        // exhausted
        var ex = await g.CreateInviteAsync(f.A.Id, f.G.Id, null, null, 1);
        var savedEx = await db.GroupInvites.FindAsync(ex.Id); savedEx!.UsedCount = 1;
        await db.SaveChangesAsync();
        await Assert.ThrowsAsync<BadRequestException>(() => g.JoinByCodeAsync(joiner.Id, short_.Code!));
        await Assert.ThrowsAsync<BadRequestException>(() => g.JoinByCodeAsync(joiner.Id, ex.Code!));
        // unknown code → 404 (revoked/expired/exhausted above are the 400 cases)
        await Assert.ThrowsAsync<NotFoundException>(() => g.JoinByCodeAsync(joiner.Id, "no-such-code"));
    }

    // ── A4: group archive / restore ──

    [Fact] public async Task GroupArchive_NameMismatch_MemberForbidden()
    {
        await using var db = NewDb(); var f = await SeedAsync(db);
        var g = Grp(db, new FakeNotif());
        await Assert.ThrowsAsync<ForbiddenException>(() => g.ArchiveGroupAsync(f.B.Id, f.G.Id, f.G.Name));
        await Assert.ThrowsAsync<BadRequestException>(() => g.ArchiveGroupAsync(f.A.Id, f.G.Id, "wrong name"));
    }

    [Fact] public async Task GroupArchive_Flow()
    {
        await using var db = NewDb(); var f = await SeedAsync(db);
        var n = new FakeNotif(); var g = Grp(db, n);
        var invite = await g.CreateInviteAsync(f.A.Id, f.G.Id, null, null, null);
        await g.ArchiveGroupAsync(f.A.Id, f.G.Id, f.G.Name);
        // archived group hidden from lists & content
        Assert.Empty(await g.GetMyGroupsAsync(f.B.Id));
        await Assert.ThrowsAsync<ForbiddenException>(() => g.GetGroupAsync(f.B.Id, f.G.Id));
        // invite code unusable
        var joiner = NewUser("Join"); db.Users.Add(joiner); await db.SaveChangesAsync();
        await Assert.ThrowsAsync<BadRequestException>(() => g.JoinByCodeAsync(joiner.Id, invite.Code!));
        // GroupArchived notification emitted for other members
        Assert.Contains(n.Sent, s => s.Recipient == f.B.Id && s.Type == NotificationType.GroupArchived);
        // archived list includes group (members included via membership)
        var archived = await g.ListArchivedGroupsAsync(f.B.Id);
        Assert.Single(archived);
        Assert.Equal(f.G.Id, archived[0].Id);
        Assert.False(archived[0].CanRestore); // B is a member
        var leaderView = await g.ListArchivedGroupsAsync(f.A.Id);
        Assert.True(leaderView[0].CanRestore);
        // member restore → 403; leader restore → ok
        await Assert.ThrowsAsync<ForbiddenException>(() => g.RestoreGroupAsync(f.B.Id, f.G.Id));
        await g.RestoreGroupAsync(f.A.Id, f.G.Id);
        Assert.Single(await g.GetMyGroupsAsync(f.B.Id));
        var dto = await g.GetGroupAsync(f.B.Id, f.G.Id);
        Assert.Equal(f.G.Name, dto.Name);
        // restoring non-archived → 400
        await Assert.ThrowsAsync<BadRequestException>(() => g.RestoreGroupAsync(f.A.Id, f.G.Id));
        Assert.Contains(n.Sent, s => s.Recipient == f.B.Id && s.Type == NotificationType.GroupRestored);
    }

    // ── A4: project archive / restore ──

    [Fact] public async Task ProjectArchive_List_And_Restore()
    {
        await using var db = NewDb(); var f = await SeedAsync(db);
        var ps = Proj(db);
        await ps.ArchiveAsync(f.A.Id, f.P.Id);
        var archived = await ps.ListArchivedAsync(f.B.Id, f.G.Id);
        Assert.Single(archived);
        Assert.Equal(f.P.Id, archived[0].Id);
        Assert.False(archived[0].CanRestore); // member
        var leaderView = await ps.ListArchivedAsync(f.A.Id, f.G.Id);
        Assert.True(leaderView[0].CanRestore);
        await Assert.ThrowsAsync<ForbiddenException>(() => ps.RestoreAsync(f.B.Id, f.P.Id));
        await ps.RestoreAsync(f.A.Id, f.P.Id);
        Assert.Empty(await ps.ListArchivedAsync(f.A.Id, f.G.Id));
        await Assert.ThrowsAsync<BadRequestException>(() => ps.RestoreAsync(f.A.Id, f.P.Id));
        // archived project detail/list hidden
        var active = await ps.ListByGroupAsync(f.B.Id, f.G.Id);
        Assert.Single(active);
    }

    // ── A4: activity log ──

    [Fact] public async Task ActivityLog_LeaderOnly()
    {
        await using var db = NewDb(); var f = await SeedAsync(db);
        var g = Grp(db, new FakeNotif());
        await Assert.ThrowsAsync<ForbiddenException>(() =>
            g.GetActivityLogAsync(f.B.Id, f.G.Id, null, null, null, null, null, null, 30));
        await Assert.ThrowsAsync<ForbiddenException>(() => g.GetActivityLogFiltersAsync(f.B.Id, f.G.Id));
    }

    [Fact] public async Task ActivityLog_Categories_Actor_Project_Filters()
    {
        await using var db = NewDb(); var f = await SeedAsync(db);
        var g = Grp(db, new FakeNotif());
        void Log(string e, string a, Guid? project = null, Guid? actor = null) =>
            db.ActivityLogs.Add(new ActivityLog { Id = Guid.NewGuid(), GroupId = f.G.Id, ActorUserId = actor ?? f.A.Id,
                ProjectId = project, EntityType = e, EntityId = Guid.NewGuid(), Action = a, Summary = "s", CreatedAt = DateTime.UtcNow });
        Log("Task", "Create", f.P.Id); Log("Task", "StatusChange", f.P.Id); Log("GroupMember", "Add", null, f.B.Id);
        Log("Project", "Archive"); Log("MarketplaceRequest", "Approve", f.P.Id); Log("Group", "Update");
        await db.SaveChangesAsync();
        var all = await g.GetActivityLogAsync(f.A.Id, f.G.Id, null, null, null, null, null, null, 30);
        Assert.Equal(6, all.Items.Count);
        var status = await g.GetActivityLogAsync(f.A.Id, f.G.Id, null, null, "status", null, null, null, 30);
        Assert.Single(status.Items); Assert.Equal("StatusChange", status.Items[0].Action);
        var member = await g.GetActivityLogAsync(f.A.Id, f.G.Id, null, null, "member", null, null, null, 30);
        Assert.Single(member.Items); Assert.Equal("member", member.Items[0].Category);
        var mkt = await g.GetActivityLogAsync(f.A.Id, f.G.Id, null, null, "marketplace", null, null, null, 30);
        Assert.Single(mkt.Items);
        var byActor = await g.GetActivityLogAsync(f.A.Id, f.G.Id, f.B.Id, null, null, null, null, null, 30);
        Assert.Single(byActor.Items);
        var byProj = await g.GetActivityLogAsync(f.A.Id, f.G.Id, null, f.P.Id, null, null, null, null, 30);
        Assert.Equal(3, byProj.Items.Count);
        // filters endpoint: all memberships incl. inactive + all projects incl. archived
        var inactive = NewUser("Ina");
        db.Users.Add(inactive); db.GroupMembers.Add(Member(f.G.Id, inactive.Id, Role.Member, active: false));
        var archP = NewProject(f.G.Id, archived: true); db.Projects.Add(archP);
        await db.SaveChangesAsync();
        var filters = await g.GetActivityLogFiltersAsync(f.A.Id, f.G.Id);
        Assert.Equal(4, filters.Actors.Count);
        Assert.Contains(filters.Actors, a => !a.IsActive);
        Assert.Equal(2, filters.Projects.Count);
        Assert.Contains(filters.Projects, p => p.IsArchived);
    }

    [Fact] public async Task ActivityLog_VnDateBounds()
    {
        await using var db = NewDb(); var f = await SeedAsync(db);
        var g = Grp(db, new FakeNotif());
        // VN date D = 2026-01-10 → VN day spans 2026-01-09T17:00Z .. 2026-01-10T17:00Z
        var boundaryStart = new DateTime(2026, 1, 9, 16, 59, 59, DateTimeKind.Utc);   // excluded for from=D
        var inStart = new DateTime(2026, 1, 9, 17, 0, 0, DateTimeKind.Utc);          // included
        var inEnd = new DateTime(2026, 1, 10, 16, 59, 59, DateTimeKind.Utc);         // included for to=D
        var outEnd = new DateTime(2026, 1, 10, 17, 0, 0, DateTimeKind.Utc);          // excluded for to=D
        foreach (var (dt, name) in new[] { (boundaryStart, "a"), (inStart, "b"), (inEnd, "c"), (outEnd, "d") })
            db.ActivityLogs.Add(new ActivityLog { Id = Guid.NewGuid(), GroupId = f.G.Id, ActorUserId = f.A.Id,
                EntityType = "Group", EntityId = f.G.Id, Action = "Update", Summary = name, CreatedAt = dt });
        await db.SaveChangesAsync();
        var res = await g.GetActivityLogAsync(f.A.Id, f.G.Id, null, null, null, "2026-01-10", "2026-01-10", null, 30);
        Assert.Equal(2, res.Items.Count);
        Assert.DoesNotContain(res.Items, i => i.Summary == "a" || i.Summary == "d");
    }

    [Fact] public async Task ActivityLog_SnapshotPaging()
    {
        await using var db = NewDb(); var f = await SeedAsync(db);
        var g = Grp(db, new FakeNotif());
        var baseTime = DateTime.UtcNow.AddMinutes(-10);
        for (var i = 0; i < 5; i++)
            db.ActivityLogs.Add(new ActivityLog { Id = Guid.NewGuid(), GroupId = f.G.Id, ActorUserId = f.A.Id,
                EntityType = "Group", EntityId = f.G.Id, Action = "Update", Summary = $"r{i}", CreatedAt = baseTime.AddSeconds(i) });
        await db.SaveChangesAsync();
        var page1 = await g.GetActivityLogAsync(f.A.Id, f.G.Id, null, null, null, null, null, null, 2);
        Assert.Equal(2, page1.Items.Count);
        Assert.NotNull(page1.NextCursor);
        Assert.Equal("r4", page1.Items[0].Summary);
        // insert a newer row BETWEEN page requests — must not appear or shift page 2
        db.ActivityLogs.Add(new ActivityLog { Id = Guid.NewGuid(), GroupId = f.G.Id, ActorUserId = f.A.Id,
            EntityType = "Group", EntityId = f.G.Id, Action = "Update", Summary = "new-row", CreatedAt = DateTime.UtcNow });
        await db.SaveChangesAsync();
        var page2 = await g.GetActivityLogAsync(f.A.Id, f.G.Id, null, null, null, null, null, page1.NextCursor, 2);
        Assert.Equal(2, page2.Items.Count);
        Assert.Equal("r2", page2.Items[0].Summary);
        Assert.DoesNotContain(page2.Items, i => i.Summary == "new-row");
        var page3 = await g.GetActivityLogAsync(f.A.Id, f.G.Id, null, null, null, null, null, page2.NextCursor, 2);
        Assert.Single(page3.Items);
        Assert.Null(page3.NextCursor);
    }

    [Fact] public async Task ActivityLog_InvalidInputs()
    {
        await using var db = NewDb(); var f = await SeedAsync(db);
        var g = Grp(db, new FakeNotif());
        await Assert.ThrowsAsync<BadRequestException>(() =>
            g.GetActivityLogAsync(f.A.Id, f.G.Id, null, null, "nonsense", null, null, null, 30));
        await Assert.ThrowsAsync<BadRequestException>(() =>
            g.GetActivityLogAsync(f.A.Id, f.G.Id, null, null, null, "not-a-date", null, null, 30));
        await Assert.ThrowsAsync<BadRequestException>(() =>
            g.GetActivityLogAsync(f.A.Id, f.G.Id, null, null, null, "2026-02-01", "2026-01-01", null, 30));
        await Assert.ThrowsAsync<BadRequestException>(() =>
            g.GetActivityLogAsync(f.A.Id, f.G.Id, null, null, null, null, null, "!!!bad", 30));
    }
}
