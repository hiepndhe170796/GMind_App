using GMind.Application.Common;
using GMind.Application.Common.Exceptions;
using GMind.Application.Services.Dashboard;
using GMind.Application.Services.Notifications;
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

/// <summary>Stage 2 M2 — task rules, subtasks, progress, submissions, deletion guards (Part A).</summary>
public class TaskWorkflowM2Tests
{
    private static ApplicationDbContext NewDb()
        => new(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"m2-{Guid.NewGuid()}").Options);

    private static User NewUser(string name) => new()
    {
        Id = Guid.NewGuid(), DisplayName = name, Email = $"{name.ToLowerInvariant()}@test.dev",
        PasswordHash = "x", IsActive = true, CreatedAt = DateTime.UtcNow
    };
    private static Group NewGroup(Guid leaderId) => new()
    { Id = Guid.NewGuid(), Name = "G", CreatedByUserId = leaderId, CreatedAt = DateTime.UtcNow };
    private static GroupMember Member(Guid groupId, Guid userId, Role role = Role.Member) => new()
    { Id = Guid.NewGuid(), GroupId = groupId, UserId = userId, Role = role, IsActive = true, JoinedAt = DateTime.UtcNow };
    private static Project NewProject(Guid groupId) => new()
    { Id = Guid.NewGuid(), GroupId = groupId, Name = "P", CreatedByUserId = Guid.NewGuid(), CreatedAt = DateTime.UtcNow };
    private static TaskEntity NewTask(Guid projectId, Guid? assignee, TaskStatus status = TaskStatus.ToDo,
        string title = "T", Guid? parentId = null, Guid? createdBy = null) => new()
    {
        Id = Guid.NewGuid(), ProjectId = projectId, AssigneeUserId = assignee, Status = status,
        Title = title, ParentTaskId = parentId, CreatedByUserId = createdBy ?? Guid.NewGuid(),
        CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow
    };

    private sealed record Fx(ApplicationDbContext Db, User Leader, User Assignee, User Other, Group G, Project P)
    {
        public FakeNotifications Notifications { get; } = new();
        public TaskService Tasks => new(Db, new ResourceAccess(Db), Notifications);
        public TaskDetailService Detail => new(Db, new ResourceAccess(Db));
    }

    private static async Task<Fx> SeedAsync(ApplicationDbContext? db = null)
    {
        db ??= NewDb();
        var leader = NewUser("Leader"); var assignee = NewUser("Assignee"); var other = NewUser("Other");
        var g = NewGroup(leader.Id); var p = NewProject(g.Id);
        db.Users.AddRange(leader, assignee, other);
        db.Groups.Add(g); db.Projects.Add(p);
        db.GroupMembers.AddRange(Member(g.Id, leader.Id, Role.Leader), Member(g.Id, assignee.Id), Member(g.Id, other.Id));
        await db.SaveChangesAsync();
        return new Fx(db, leader, assignee, other, g, p);
    }

    private sealed class FakeNotifications : INotificationService
    {
        public List<(Guid Recipient, NotificationType Type, string Title, string Body)> Sent { get; } = new();
        public Task NotifyAsync(Guid r, Guid? g, NotificationType t, string title, string body, string? et, Guid? ei, CancellationToken ct = default)
        { Sent.Add((r, t, title, body)); return Task.CompletedTask; }
        public Task<List<NotificationDto>> GetMyAsync(Guid u, bool u2, int t, CancellationToken ct = default) => Task.FromResult(new List<NotificationDto>());
        public Task<int> GetUnreadCountAsync(Guid u, CancellationToken ct = default) => Task.FromResult(0);
        public Task MarkReadAsync(Guid u, Guid n, CancellationToken ct = default) => Task.CompletedTask;
        public Task<int> MarkAllReadAsync(Guid u, CancellationToken ct = default) => Task.FromResult(0);
    }

    // ── A3 progress ──
    [Fact]
    public async Task Progress_AssigneeOnly_InProgressOnly()
    {
        var f = await SeedAsync();
        var t = NewTask(f.P.Id, f.Assignee.Id, TaskStatus.InProgress);
        f.Db.Tasks.Add(t); await f.Db.SaveChangesAsync();

        // wrong actor
        var ex = await Assert.ThrowsAsync<ForbiddenException>(() => f.Tasks.UpdateProgressAsync(f.Other.Id, t.Id, 50));
        Assert.Equal("Chỉ người phụ trách mới cập nhật được tiến độ khi công việc đang làm.", ex.Message);
        // leader who is not the assignee also denied
        await Assert.ThrowsAsync<ForbiddenException>(() => f.Tasks.UpdateProgressAsync(f.Leader.Id, t.Id, 50));

        var dto = await f.Tasks.UpdateProgressAsync(f.Assignee.Id, t.Id, 40);
        Assert.Equal(40, dto.ProgressPercent);
        var log = await f.Db.ActivityLogs.SingleAsync(l => l.Action == "Progress");
        Assert.Contains("0% → 40%", log.Summary);

        // same value → no extra activity row
        var count = f.Db.ActivityLogs.Count(l => l.Action == "Progress");
        await f.Tasks.UpdateProgressAsync(f.Assignee.Id, t.Id, 40);
        Assert.Equal(count, f.Db.ActivityLogs.Count(l => l.Action == "Progress"));

        // range guard
        await Assert.ThrowsAsync<BadRequestException>(() => f.Tasks.UpdateProgressAsync(f.Assignee.Id, t.Id, 101));

        // not InProgress → denied
        t.Status = TaskStatus.ToDo; await f.Db.SaveChangesAsync();
        await Assert.ThrowsAsync<ForbiddenException>(() => f.Tasks.UpdateProgressAsync(f.Assignee.Id, t.Id, 10));
    }

    [Fact]
    public async Task Progress_Subtask_Rejected()
    {
        var f = await SeedAsync();
        var parent = NewTask(f.P.Id, f.Assignee.Id, TaskStatus.InProgress);
        var child = NewTask(f.P.Id, f.Assignee.Id, TaskStatus.InProgress, "sub", parent.Id);
        f.Db.Tasks.AddRange(parent, child); await f.Db.SaveChangesAsync();
        var ex = await Assert.ThrowsAsync<BadRequestException>(() => f.Tasks.UpdateProgressAsync(f.Assignee.Id, child.Id, 20));
        Assert.Equal("Công việc con không dùng phần trăm tiến độ.", ex.Message);
    }

    // ── A4 submissions + review version ──
    [Fact]
    public async Task Submit_CreatesVersionedSubmission_NoteTrimmed()
    {
        var f = await SeedAsync();
        var t = NewTask(f.P.Id, f.Assignee.Id, TaskStatus.InProgress);
        f.Db.Tasks.Add(t); await f.Db.SaveChangesAsync();

        await f.Tasks.ChangeStatusAsync(f.Assignee.Id, t.Id, TaskStatus.Submitted, "  done, please review  ");
        var s = await f.Db.TaskSubmissions.SingleAsync();
        Assert.Equal(1, s.Version);
        Assert.Equal("done, please review", s.Note);
        Assert.Equal(f.Assignee.Id, s.SubmittedByUserId);

        // leader notified with note excerpt
        var n = f.Notifications.Sent.Last();
        Assert.Equal(f.Leader.Id, n.Recipient);
        Assert.Contains($"Task '{t.Title}' đã được nộp để duyệt: done, please review", n.Body);

        // request changes → resubmit bumps version; review records the latest version
        await f.Tasks.ChangeStatusAsync(f.Leader.Id, t.Id, TaskStatus.ChangesRequested, "fix it");
        var review1 = await f.Db.TaskReviews.SingleAsync();
        Assert.Equal(1, review1.SubmissionVersion);
        await f.Tasks.ChangeStatusAsync(f.Assignee.Id, t.Id, TaskStatus.InProgress);
        await f.Tasks.ChangeStatusAsync(f.Assignee.Id, t.Id, TaskStatus.Submitted, "v2 note");
        Assert.Equal(2, await f.Db.TaskSubmissions.MaxAsync(x => x.Version));
        await f.Tasks.ChangeStatusAsync(f.Leader.Id, t.Id, TaskStatus.Completed);
        Assert.Equal(2, (await f.Db.TaskReviews.OrderByDescending(r => r.CreatedAt).FirstAsync()).SubmissionVersion);

        // submissions endpoint newest-first
        var list = await f.Detail.ListSubmissionsAsync(f.Assignee.Id, t.Id);
        Assert.Equal([2, 1], list.Select(x => x.Version));
        Assert.Equal("v2 note", list[0].Note);
        Assert.Equal("Assignee", list[0].SubmittedByName);
    }

    [Fact]
    public async Task ReviewVersion_LegacyFallback_NoSubmissionRows()
    {
        var f = await SeedAsync();
        var t = NewTask(f.P.Id, f.Assignee.Id, TaskStatus.Submitted);
        f.Db.Tasks.Add(t);
        f.Db.TaskReviews.Add(new TaskReview { Id = Guid.NewGuid(), TaskId = t.Id, ReviewerUserId = f.Leader.Id, Decision = TaskStatus.ChangesRequested, SubmissionVersion = 1 });
        await f.Db.SaveChangesAsync();
        await f.Tasks.ChangeStatusAsync(f.Leader.Id, t.Id, TaskStatus.ChangesRequested, "again");
        // 1 existing review + 1 = 2 when no submission rows exist
        Assert.Equal(2, (await f.Db.TaskReviews.OrderByDescending(r => r.CreatedAt).FirstAsync()).SubmissionVersion);
    }

    // ── A5 subtasks ──
    [Fact]
    public async Task SubtaskCreate_Rules()
    {
        var f = await SeedAsync();
        var parent = NewTask(f.P.Id, f.Assignee.Id, TaskStatus.InProgress);
        f.Db.Tasks.Add(parent); await f.Db.SaveChangesAsync();

        // parent assignee can create (self or unassigned)
        var own = await f.Tasks.CreateAsync(f.Assignee.Id, f.P.Id, "mine", null, f.Assignee.Id,
            Priority.Medium, null, null, null, parent.Id);
        Assert.Equal(parent.Id, own.ParentTaskId);
        await f.Tasks.CreateAsync(f.Assignee.Id, f.P.Id, "unassigned", null, null,
            Priority.Medium, null, null, null, parent.Id);

        // parent assignee may not assign to someone else
        await Assert.ThrowsAsync<ForbiddenException>(() => f.Tasks.CreateAsync(f.Assignee.Id, f.P.Id,
            "for other", null, f.Other.Id, Priority.Medium, null, null, null, parent.Id));
        // unrelated member may not add subtasks
        await Assert.ThrowsAsync<ForbiddenException>(() => f.Tasks.CreateAsync(f.Other.Id, f.P.Id,
            "nope", null, f.Other.Id, Priority.Medium, null, null, null, parent.Id));
        // leader can create + assign anyone
        await f.Tasks.CreateAsync(f.Leader.Id, f.P.Id, "leader-made", null, f.Other.Id,
            Priority.Medium, null, null, null, parent.Id);
        // points forbidden on subtasks
        var ex = await Assert.ThrowsAsync<BadRequestException>(() => f.Tasks.CreateAsync(f.Leader.Id, f.P.Id,
            "pts", null, null, Priority.Medium, null, null, 5, parent.Id));
        Assert.Equal("Công việc con không có điểm.", ex.Message);
        // submitted parent rejects new subtasks
        parent.Status = TaskStatus.Submitted; await f.Db.SaveChangesAsync();
        var ex2 = await Assert.ThrowsAsync<BadRequestException>(() => f.Tasks.CreateAsync(f.Leader.Id, f.P.Id,
            "late", null, null, Priority.Medium, null, null, null, parent.Id));
        Assert.Equal("Không thể thêm công việc con vào công việc đang chờ duyệt hoặc đã hoàn thành.", ex2.Message);
        // subtask's parent title/count surface in DTOs
        var list = await f.Tasks.ListSubtasksAsync(f.Assignee.Id, parent.Id);
        Assert.Equal(3, list.Count);
        Assert.All(list, s => Assert.Equal(parent.Title, s.ParentTitle));
    }

    [Fact]
    public async Task Subtask_Transitions_And_Reopen()
    {
        var f = await SeedAsync();
        var parent = NewTask(f.P.Id, f.Assignee.Id, TaskStatus.InProgress);
        var child = NewTask(f.P.Id, f.Other.Id, TaskStatus.ToDo, "sub", parent.Id);
        f.Db.Tasks.AddRange(parent, child); await f.Db.SaveChangesAsync();

        // subtask assignee can move ToDo → InProgress → Completed (no review row)
        await f.Tasks.ChangeStatusAsync(f.Other.Id, child.Id, TaskStatus.InProgress);
        var done = await f.Tasks.ChangeStatusAsync(f.Other.Id, child.Id, TaskStatus.Completed);
        Assert.Equal("Completed", done.Status);
        Assert.Equal(100, done.ProgressPercent);
        Assert.NotNull(done.CompletedAt);
        Assert.Empty(await f.Db.TaskReviews.Where(r => r.TaskId == child.Id).ToListAsync());

        // parent assignee can reopen while parent is InProgress
        var reopened = await f.Tasks.ChangeStatusAsync(f.Assignee.Id, child.Id, TaskStatus.InProgress);
        Assert.Equal("InProgress", reopened.Status);
        var reloaded = await f.Db.Tasks.FindAsync(child.Id);
        Assert.Null(reloaded!.CompletedAt);
        Assert.Equal(0, reloaded.ProgressPercent);

        // review verbs rejected with the specific message
        var ex = await Assert.ThrowsAsync<BadRequestException>(() => f.Tasks.ChangeStatusAsync(f.Other.Id, child.Id, TaskStatus.Submitted));
        Assert.Equal("Công việc con không cần duyệt; hãy đánh dấu Hoàn thành.", ex.Message);

        // reopen blocked once the parent is Submitted/Completed
        await f.Tasks.ChangeStatusAsync(f.Other.Id, child.Id, TaskStatus.Completed);
        parent.Status = TaskStatus.Submitted; await f.Db.SaveChangesAsync();
        await Assert.ThrowsAsync<BadRequestException>(() => f.Tasks.ChangeStatusAsync(f.Assignee.Id, child.Id, TaskStatus.InProgress));

        // unrelated member cannot transition a subtask
        parent.Status = TaskStatus.InProgress; await f.Db.SaveChangesAsync();
        child.Status = TaskStatus.ToDo; await f.Db.SaveChangesAsync();
        var nobody = NewUser("Nobody"); f.Db.Users.Add(nobody); f.Db.GroupMembers.Add(Member(f.G.Id, nobody.Id));
        await f.Db.SaveChangesAsync();
        await Assert.ThrowsAsync<ForbiddenException>(() => f.Tasks.ChangeStatusAsync(nobody.Id, child.Id, TaskStatus.InProgress));
    }

    [Fact]
    public async Task Submit_Blocked_By_Open_Subtask()
    {
        var f = await SeedAsync();
        var parent = NewTask(f.P.Id, f.Assignee.Id, TaskStatus.InProgress);
        var child = NewTask(f.P.Id, f.Assignee.Id, TaskStatus.InProgress, "sub", parent.Id);
        f.Db.Tasks.AddRange(parent, child); await f.Db.SaveChangesAsync();

        var ex = await Assert.ThrowsAsync<BadRequestException>(() => f.Tasks.ChangeStatusAsync(f.Assignee.Id, parent.Id, TaskStatus.Submitted));
        Assert.Equal("Hoàn thành tất cả công việc con trước khi nộp.", ex.Message);
        await f.Tasks.ChangeStatusAsync(f.Assignee.Id, child.Id, TaskStatus.Completed);
        var dto = await f.Tasks.ChangeStatusAsync(f.Assignee.Id, parent.Id, TaskStatus.Submitted);
        Assert.Equal("Submitted", dto.Status);
        Assert.Equal(1, dto.SubtaskCount);
        Assert.Equal(1, dto.SubtasksCompleted);
    }

    // ── A7 visibility of subtasks ──
    [Fact]
    public async Task ParentAssignee_Sees_SubtaskDetails()
    {
        var f = await SeedAsync();
        var parent = NewTask(f.P.Id, f.Assignee.Id, TaskStatus.InProgress);
        var child = NewTask(f.P.Id, f.Other.Id, TaskStatus.ToDo, "sub", parent.Id);
        f.Db.Tasks.AddRange(parent, child); await f.Db.SaveChangesAsync();

        // parent assignee (not the subtask assignee) can read details + comments
        var dto = await f.Tasks.GetAsync(f.Assignee.Id, child.Id);
        Assert.True(dto.CanViewDetails);
        var comment = await f.Detail.AddCommentAsync(f.Assignee.Id, child.Id, "watching");
        Assert.Equal(child.Id, comment.TaskId);
        // unrelated member still denied
        var nobody = NewUser("Nobody"); f.Db.Users.Add(nobody); f.Db.GroupMembers.Add(Member(f.G.Id, nobody.Id));
        await f.Db.SaveChangesAsync();
        var denied = await f.Tasks.GetAsync(nobody.Id, child.Id);
        Assert.False(denied.CanViewDetails);
        Assert.Equal(TaskPermissionsDto.None, denied.Permissions);
        await Assert.ThrowsAsync<ForbiddenException>(() => f.Detail.ListCommentsAsync(nobody.Id, child.Id));
    }

    // ── A6 deletion ──
    [Fact]
    public async Task Delete_Guards()
    {
        var f = await SeedAsync();
        var parent = NewTask(f.P.Id, f.Assignee.Id, TaskStatus.InProgress);
        var child = NewTask(f.P.Id, f.Assignee.Id, TaskStatus.ToDo, "sub", parent.Id, f.Assignee.Id);
        var linked = NewTask(f.P.Id, f.Assignee.Id, TaskStatus.ToDo, "linked");
        var done = NewTask(f.P.Id, f.Assignee.Id, TaskStatus.Completed, "done");
        var mkt = NewTask(f.P.Id, f.Assignee.Id, TaskStatus.ToDo, "mkt");
        f.Db.Tasks.AddRange(parent, child, linked, done, mkt);
        f.Db.TaskLinks.Add(new TaskLink { Id = Guid.NewGuid(), ProjectId = f.P.Id, TaskId = linked.Id, Url = "https://x.test", CreatedByUserId = f.Assignee.Id });
        f.Db.MarketplaceRequests.Add(new MarketplaceRequest { Id = Guid.NewGuid(), GroupId = f.G.Id, TaskId = mkt.Id, RequestedByUserId = f.Assignee.Id, RequestType = MarketplaceRequestType.NeedHelp, Status = MarketplaceRequestStatus.Pending, CreatedAt = DateTime.UtcNow });
        await f.Db.SaveChangesAsync();

        // completed → 400; has subtasks → 409; marketplace history → 409; stranger → 403
        await Assert.ThrowsAsync<BadRequestException>(() => f.Tasks.DeleteAsync(f.Leader.Id, done.Id));
        var exSub = await Assert.ThrowsAsync<ConflictException>(() => f.Tasks.DeleteAsync(f.Leader.Id, parent.Id));
        Assert.Equal("Hãy xóa các công việc con trước.", exSub.Message);
        var exMkt = await Assert.ThrowsAsync<ConflictException>(() => f.Tasks.DeleteAsync(f.Leader.Id, mkt.Id));
        Assert.Equal("Công việc đã có yêu cầu Marketplace nên không thể xóa để giữ lịch sử.", exMkt.Message);
        await Assert.ThrowsAsync<ForbiddenException>(() => f.Tasks.DeleteAsync(f.Other.Id, linked.Id));

        // subtask creator who is also the parent assignee can delete their own open subtask
        await f.Tasks.DeleteAsync(f.Assignee.Id, child.Id);
        Assert.Null(await f.Db.Tasks.FindAsync(child.Id));

        // leader deletes a task → its links go with it
        await f.Tasks.DeleteAsync(f.Leader.Id, linked.Id);
        Assert.Empty(await f.Db.TaskLinks.Where(l => l.TaskId == linked.Id).ToListAsync());
        Assert.Null(await f.Db.Tasks.FindAsync(linked.Id));
    }

    // ── A2 DTO permissions ──
    [Fact]
    public async Task Summary_Permissions_Per_Role()
    {
        var f = await SeedAsync();
        var t = NewTask(f.P.Id, f.Assignee.Id, TaskStatus.InProgress);
        f.Db.Tasks.Add(t); await f.Db.SaveChangesAsync();

        var leader = (await f.Tasks.ListByProjectAsync(f.Leader.Id, f.P.Id)).Single();
        Assert.True(leader.Permissions!.CanEdit && leader.Permissions.CanDelete && leader.Permissions.CanAddSubtask);
        Assert.False(leader.Permissions.CanUpdateProgress); // not the assignee
        Assert.Empty(leader.Permissions.AllowedTransitions);

        var assignee = (await f.Tasks.ListByProjectAsync(f.Assignee.Id, f.P.Id)).Single();
        Assert.True(assignee.Permissions!.CanUpdateProgress && assignee.Permissions.CanAddSubtask);
        Assert.False(assignee.Permissions.CanEdit || assignee.Permissions.CanDelete || assignee.Permissions.CanAssign);
        Assert.Equal(["ToDo", "Submitted"], assignee.Permissions.AllowedTransitions);
        Assert.Equal(0, assignee.ProgressPercent);
        Assert.Null(assignee.Points);

        var member = (await f.Tasks.ListByProjectAsync(f.Other.Id, f.P.Id)).Single();
        Assert.False(member.CanViewDetails);
        Assert.Equal(TaskPermissionsDto.None, member.Permissions);
        Assert.Null(member.ProgressPercent);
        Assert.Null(member.Points);
    }

    [Fact]
    public async Task MyTasks_IncludeCompleted30d()
    {
        var f = await SeedAsync();
        var recent = NewTask(f.P.Id, f.Assignee.Id, TaskStatus.Completed, "recent");
        recent.CompletedAt = DateTime.UtcNow.AddDays(-2);
        var old = NewTask(f.P.Id, f.Assignee.Id, TaskStatus.Completed, "old");
        old.CompletedAt = DateTime.UtcNow.AddDays(-40);
        var open = NewTask(f.P.Id, f.Assignee.Id, TaskStatus.InProgress, "open");
        f.Db.Tasks.AddRange(recent, old, open); await f.Db.SaveChangesAsync();

        var dash = new DashboardService(f.Db, new ResourceAccess(f.Db));
        var def = await dash.GetMyTasksAsync(f.Assignee.Id);
        Assert.Single(def);
        var all = await dash.GetMyTasksAsync(f.Assignee.Id, includeCompleted: true);
        Assert.Equal(2, all.Count);
        Assert.DoesNotContain(all, t => t.Title == "old");
        var item = all.Single(t => t.Title == "recent");
        Assert.NotNull(item.CompletedAt);
        Assert.NotNull(item.Permissions);
        Assert.Equal(f.G.Id, item.GroupId);
    }

    // ── Relational model check (unique index enforced only by real providers) ──
    [Fact]
    public async Task TaskSubmissions_UniqueIndex_TaskId_Version()
    {
        await using var conn = new SqliteConnection("Data Source=:memory:");
        await conn.OpenAsync();
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseSqlite(conn).Options;
        await using var db = new ApplicationDbContext(options);
        await db.Database.EnsureCreatedAsync();

        var user = NewUser("u1"); var g = NewGroup(user.Id); var p = NewProject(g.Id);
        p.CreatedByUserId = user.Id;
        var t = NewTask(p.Id, user.Id, createdBy: user.Id);
        db.Users.Add(user); db.Groups.Add(g); db.Projects.Add(p); db.Tasks.Add(t);
        await db.SaveChangesAsync();

        db.TaskSubmissions.Add(new TaskSubmission { Id = Guid.NewGuid(), TaskId = t.Id, SubmittedByUserId = user.Id, Version = 1 });
        await db.SaveChangesAsync();
        db.TaskSubmissions.Add(new TaskSubmission { Id = Guid.NewGuid(), TaskId = t.Id, SubmittedByUserId = user.Id, Version = 1 });
        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
    }
}
