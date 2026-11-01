using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using GMind.Application.Services.Auth;
using GMind.Domain.Entities;
using GMind.Domain.Enums;
using GMind.Infrastructure.Persistence;
using GMind.Infrastructure.Workers;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Xunit;
using TaskEntity = GMind.Domain.Entities.Task;
using TaskStatusEnum = GMind.Domain.Enums.TaskStatus;
using Task = System.Threading.Tasks.Task;

namespace GMind.Tests;

public class TaskAuthorizationTests
{
    private const string Secret = "test-secret-key-minimum-32-chars-long!";
    private const string PrivateDescription = "PRIVATE_SENTINEL_DESCRIPTION";
    private const string PrivateLink = "https://private.example/sentinel";

    private static readonly string[] PrivateFields =
        ["description", "progressPercent", "estimateHours", "points", "createdByUserId", "createdAt", "submittedAt", "completedAt"];

    private sealed class Fixture : IAsyncDisposable
    {
        public required WebApplicationFactory<Program> Factory { get; init; }
        public required User Leader { get; init; }
        public required User Assignee { get; init; }
        public required User OtherMember { get; init; }
        public required User Outsider { get; init; }
        public required User InactiveUser { get; init; }
        public required Group GroupG { get; init; }
        public required Group GroupH { get; init; }
        public required Project ProjectP { get; init; }
        public required TaskEntity TaskT { get; init; }
        public required TaskEntity TaskUnassigned { get; init; }
        public required TaskEntity TaskChild { get; init; }
        public required TaskEntity TaskSubmitted { get; init; }
        public required TaskComment CommentByB { get; init; }
        public required TaskComment CommentByC { get; init; }
        public required TaskLink LinkByC { get; init; }
        public required TaskReview ReviewOnT { get; init; }

        public HttpClient ClientFor(User user)
        {
            var client = Factory.CreateClient();
            var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Secret"] = Secret,
                ["Jwt:Issuer"] = "GMindTests",
                ["Jwt:Audience"] = "GMindTests",
                ["Jwt:ExpiryMinutes"] = "60"
            }).Build();
            var token = new TokenService(config).GenerateAccessToken(user);
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
            return client;
        }

        public async Task<(int tasks, int logs, int notifications, int comments, int links, string taskState)> SnapshotAsync()
        {
            await using var scope = Factory.Services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var state = await db.Tasks.AsNoTracking().OrderBy(t => t.Id)
                .Select(t => new { t.Id, t.Title, t.Description, t.AssigneeUserId, t.Status, t.Priority, t.DeadlineAt, t.EstimateHours, t.Points, t.ProgressPercent, t.UpdatedAt }).ToListAsync();
            return (await db.Tasks.CountAsync(), await db.ActivityLogs.CountAsync(),
                await db.Notifications.CountAsync(), await db.TaskComments.CountAsync(), await db.TaskLinks.CountAsync(),
                JsonSerializer.Serialize(state));
        }

        public async ValueTask DisposeAsync() => await Factory.DisposeAsync();
    }

    private static async Task<Fixture> SeedAsync(bool archiveGroup = false, bool archiveProject = false, bool deactivateAssignee = false)
    {
        var dbName = $"authz-{Guid.NewGuid()}";
        var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
            builder.ConfigureAppConfiguration((_, config) =>
            {
                config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["Jwt:Issuer"] = "GMindTests",
                    ["Jwt:Audience"] = "GMindTests",
                    ["Jwt:Secret"] = Secret,
                    ["ConnectionStrings:DefaultConnection"] =
                        "Server=(localdb)\\mssqllocaldb;Database=GMind_AuthTests_NeverUsed;Trusted_Connection=True;TrustServerCertificate=True;"
                });
            });
            builder.ConfigureServices(services =>
            {
                var worker = services.SingleOrDefault(d => d.ImplementationType == typeof(ReminderWorker));
                if (worker is not null) services.Remove(worker);

                services.RemoveAll<DbContextOptions<ApplicationDbContext>>();
                services.RemoveAll<Microsoft.EntityFrameworkCore.Infrastructure.IDbContextOptionsConfiguration<ApplicationDbContext>>();
                services.AddDbContext<ApplicationDbContext>(o => o.UseInMemoryDatabase(dbName));
            });
        });

        _ = factory.Services;

        var leader = new User { Id = Guid.NewGuid(), DisplayName = "Leader A", Email = "a@test.dev", PasswordHash = "x" };
        var assignee = new User { Id = Guid.NewGuid(), DisplayName = "Assignee B", Email = "b@test.dev", PasswordHash = "x" };
        var other = new User { Id = Guid.NewGuid(), DisplayName = "Member C", Email = "c@test.dev", PasswordHash = "x" };
        var outsider = new User { Id = Guid.NewGuid(), DisplayName = "Outsider D", Email = "d@test.dev", PasswordHash = "x" };
        var inactive = new User { Id = Guid.NewGuid(), DisplayName = "Inactive E", Email = "e@test.dev", PasswordHash = "x", IsActive = false };

        var groupG = new Group { Id = Guid.NewGuid(), Name = "Group G", CreatedByUserId = leader.Id, IsArchived = archiveGroup };
        var groupH = new Group { Id = Guid.NewGuid(), Name = "Group H", CreatedByUserId = other.Id };
        var projectP = new Project { Id = Guid.NewGuid(), GroupId = groupG.Id, Name = "Project P", CreatedByUserId = leader.Id, ArchivedAt = archiveProject ? DateTime.UtcNow : null };

        var taskT = new TaskEntity
        {
            Id = Guid.NewGuid(), ProjectId = projectP.Id, Title = "Task T",
            Description = PrivateDescription, AssigneeUserId = assignee.Id,
            Status = TaskStatusEnum.ToDo, ProgressPercent = 40, EstimateHours = 8m, Points = 3,
            CreatedByUserId = other.Id
        };
        var taskUnassigned = new TaskEntity
        {
            Id = Guid.NewGuid(), ProjectId = projectP.Id, Title = "Unassigned",
            CreatedByUserId = leader.Id
        };
        var taskChild = new TaskEntity
        {
            Id = Guid.NewGuid(), ProjectId = projectP.Id, ParentTaskId = taskT.Id,
            Title = "Child of T", AssigneeUserId = other.Id, CreatedByUserId = leader.Id
        };
        var taskSubmitted = new TaskEntity
        {
            Id = Guid.NewGuid(), ProjectId = projectP.Id, Title = "Submitted S",
            AssigneeUserId = assignee.Id, Status = TaskStatusEnum.Submitted,
            ProgressPercent = 70, SubmittedAt = DateTime.UtcNow, CreatedByUserId = leader.Id
        };

        var commentB = new TaskComment { Id = Guid.NewGuid(), TaskId = taskT.Id, AuthorUserId = assignee.Id, Body = "B note" };
        var commentC = new TaskComment { Id = Guid.NewGuid(), TaskId = taskT.Id, AuthorUserId = other.Id, Body = "C note" };
        var linkC = new TaskLink { Id = Guid.NewGuid(), ProjectId = projectP.Id, TaskId = taskT.Id, Url = PrivateLink, CreatedByUserId = other.Id };
        var review = new TaskReview { Id = Guid.NewGuid(), TaskId = taskT.Id, ReviewerUserId = leader.Id, Decision = TaskStatusEnum.ChangesRequested, Comment = "fix it", SubmissionVersion = 1 };

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            db.Users.AddRange(leader, assignee, other, outsider, inactive);
            db.Groups.AddRange(groupG, groupH);
            db.GroupMembers.AddRange(
                new GroupMember { Id = Guid.NewGuid(), GroupId = groupG.Id, UserId = leader.Id, Role = Role.Leader },
                new GroupMember { Id = Guid.NewGuid(), GroupId = groupG.Id, UserId = assignee.Id, Role = Role.Member, IsActive = !deactivateAssignee },
                new GroupMember { Id = Guid.NewGuid(), GroupId = groupG.Id, UserId = other.Id, Role = Role.Member },
                new GroupMember { Id = Guid.NewGuid(), GroupId = groupG.Id, UserId = inactive.Id, Role = Role.Member },
                new GroupMember { Id = Guid.NewGuid(), GroupId = groupH.Id, UserId = other.Id, Role = Role.Leader });
            db.Projects.Add(projectP);
            db.Tasks.AddRange(taskT, taskUnassigned, taskChild, taskSubmitted);
            db.TaskComments.AddRange(commentB, commentC);
            db.TaskLinks.Add(linkC);
            db.TaskReviews.Add(review);
            await db.SaveChangesAsync();
        }

        return new Fixture
        {
            Factory = factory, Leader = leader, Assignee = assignee, OtherMember = other,
            Outsider = outsider, InactiveUser = inactive, GroupG = groupG, GroupH = groupH,
            ProjectP = projectP, TaskT = taskT, TaskUnassigned = taskUnassigned,
            TaskChild = taskChild, TaskSubmitted = taskSubmitted,
            CommentByB = commentB, CommentByC = commentC, LinkByC = linkC, ReviewOnT = review
        };
    }

    private static async Task<JsonElement> DataAsync(HttpResponseMessage response)
    {
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return doc.RootElement.GetProperty("data").Clone();
    }

    private static void AssertNoPrivateFields(JsonElement task)
    {
        foreach (var field in PrivateFields)
            Assert.False(task.TryGetProperty(field, out _), $"summary leaked {field}");
    }

    [Theory]
    [InlineData("leader")]
    [InlineData("assignee")]
    [InlineData("member")]
    public async Task ListByProject_ReturnsSummaryOnly_ForEveryRole(string who)
    {
        await using var f = await SeedAsync();
        var user = who switch { "leader" => f.Leader, "assignee" => f.Assignee, _ => f.OtherMember };
        using var client = f.ClientFor(user);

        var response = await client.GetAsync($"/api/projects/{f.ProjectP.Id}/tasks");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var data = await DataAsync(response);
        Assert.Equal(4, data.GetArrayLength());
        foreach (var item in data.EnumerateArray())
        {
            Assert.True(item.TryGetProperty("title", out _));
            Assert.True(item.TryGetProperty("status", out _));
            Assert.True(item.TryGetProperty("priority", out _));
            Assert.True(item.TryGetProperty("deadlineAt", out _));
            Assert.True(item.TryGetProperty("assigneeUserId", out _));
            AssertNoPrivateFields(item);
        }
        foreach (var item in data.EnumerateArray())
        {
            var id = item.GetProperty("id").GetGuid();
            var canView = item.GetProperty("canViewDetails").GetBoolean();
            var expected = who == "leader" || (who == "assignee" && (id == f.TaskT.Id || id == f.TaskSubmitted.Id))
                || (who == "member" && id == f.TaskChild.Id);
            Assert.Equal(expected, canView);
        }
    }

    [Fact]
    public async Task GetTask_ReturnsFullDetail_ForLeaderAndAssignee()
    {
        await using var f = await SeedAsync();
        foreach (var user in new[] { f.Leader, f.Assignee })
        {
            using var client = f.ClientFor(user);
            var response = await client.GetAsync($"/api/tasks/{f.TaskT.Id}");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var data = await DataAsync(response);
            Assert.True(data.GetProperty("canViewDetails").GetBoolean());
            Assert.Equal(PrivateDescription, data.GetProperty("description").GetString());
            Assert.Equal(40, data.GetProperty("progressPercent").GetInt32());
            Assert.Equal(8m, data.GetProperty("estimateHours").GetDecimal());
            Assert.Equal(3, data.GetProperty("points").GetInt32());
        }
    }

    [Fact]
    public async Task GetTask_ReturnsSummaryOnly_ForNonAssigneeMember_LeaderElsewhere()
    {
        await using var f = await SeedAsync();
        using var client = f.ClientFor(f.OtherMember);

        var response = await client.GetAsync($"/api/tasks/{f.TaskT.Id}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var data = await DataAsync(response);
        Assert.False(data.GetProperty("canViewDetails").GetBoolean());
        AssertNoPrivateFields(data);
    }

    [Fact]
    public async Task TaskSubResources_DenyNonAssigneeMember_AllowLeaderAndAssignee()
    {
        await using var f = await SeedAsync();
        using var cClient = f.ClientFor(f.OtherMember);
        Assert.Equal(HttpStatusCode.Forbidden, (await cClient.GetAsync($"/api/tasks/{f.TaskT.Id}/comments")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await cClient.GetAsync($"/api/tasks/{f.TaskT.Id}/links")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await cClient.GetAsync($"/api/tasks/{f.TaskT.Id}/reviews")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await cClient.PostAsJsonAsync($"/api/tasks/{f.TaskT.Id}/comments", new { body = "hi" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await cClient.PostAsJsonAsync($"/api/tasks/{f.TaskT.Id}/links", new { url = "https://x.example" })).StatusCode);

        using var bClient = f.ClientFor(f.Assignee);
        Assert.Equal(HttpStatusCode.OK, (await bClient.GetAsync($"/api/tasks/{f.TaskT.Id}/comments")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await bClient.GetAsync($"/api/tasks/{f.TaskT.Id}/links")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await bClient.GetAsync($"/api/tasks/{f.TaskT.Id}/reviews")).StatusCode);
    }

    [Fact]
    public async Task CommentAuthorship_DoesNotBypassTaskDetailAccess()
    {
        await using var f = await SeedAsync();
        using var cClient = f.ClientFor(f.OtherMember);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await cClient.PatchAsJsonAsync($"/api/comments/{f.CommentByC.Id}", new { body = "edited" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await cClient.DeleteAsync($"/api/comments/{f.CommentByC.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await cClient.DeleteAsync($"/api/links/{f.LinkByC.Id}")).StatusCode);

        using var bClient = f.ClientFor(f.Assignee);
        Assert.Equal(HttpStatusCode.OK,
            (await bClient.PatchAsJsonAsync($"/api/comments/{f.CommentByB.Id}", new { body = "edited by B" })).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await bClient.PostAsJsonAsync($"/api/tasks/{f.TaskT.Id}/comments", new { body = "B adds" })).StatusCode);
    }

    [Theory]
    [InlineData("assignee")]
    [InlineData("member")]
    public async Task TaskMutations_RequireLeader_MemberAndLegacyCreatorDenied(string who)
    {
        await using var f = await SeedAsync();
        var user = who == "assignee" ? f.Assignee : f.OtherMember;
        using var client = f.ClientFor(user);
        var before = await f.SnapshotAsync();

        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync(
            $"/api/projects/{f.ProjectP.Id}/tasks", new { title = "self", assigneeUserId = user.Id })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync(
            $"/api/projects/{f.ProjectP.Id}/tasks", new { title = "unassigned" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync(
            $"/api/projects/{f.ProjectP.Id}/tasks", new { title = "other", assigneeUserId = f.Leader.Id })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PatchAsJsonAsync(
            $"/api/tasks/{f.TaskT.Id}", new { title = "renamed", priority = 2 })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync(
            $"/api/tasks/{f.TaskT.Id}/assign", new { assigneeUserId = user.Id })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.DeleteAsync($"/api/tasks/{f.TaskT.Id}")).StatusCode);

        Assert.Equal(before, await f.SnapshotAsync());
    }

    [Fact]
    public async Task StatusTransitions_EnforceAssigneeAndLeaderActors()
    {
        await using var f = await SeedAsync();
        using var bClient = f.ClientFor(f.Assignee);
        using var cClient = f.ClientFor(f.OtherMember);
        using var aClient = f.ClientFor(f.Leader);

        Assert.Equal(HttpStatusCode.OK, (await bClient.PostAsJsonAsync(
            $"/api/tasks/{f.TaskT.Id}/status", new { status = (int)TaskStatusEnum.InProgress })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await cClient.PostAsJsonAsync(
            $"/api/tasks/{f.TaskT.Id}/status", new { status = (int)TaskStatusEnum.Submitted })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await bClient.PostAsJsonAsync(
            $"/api/tasks/{f.TaskSubmitted.Id}/status", new { status = (int)TaskStatusEnum.Completed })).StatusCode);

        var approve = await aClient.PostAsJsonAsync(
            $"/api/tasks/{f.TaskSubmitted.Id}/status", new { status = (int)TaskStatusEnum.Completed });
        Assert.Equal(HttpStatusCode.OK, approve.StatusCode);
        var data = await DataAsync(approve);
        Assert.Equal("Completed", data.GetProperty("status").GetString());
        Assert.Equal(100, data.GetProperty("progressPercent").GetInt32());
    }

    [Fact]
    public async Task ChangeStatus_InvalidEnumValue_Returns400()
    {
        await using var f = await SeedAsync();
        using var client = f.ClientFor(f.Assignee);
        var response = await client.PostAsJsonAsync($"/api/tasks/{f.TaskT.Id}/status", new { status = 99 });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task GroupActivityAndProgress_AreLeaderOnly()
    {
        await using var f = await SeedAsync();
        using var cClient = f.ClientFor(f.OtherMember);
        Assert.Equal(HttpStatusCode.Forbidden, (await cClient.GetAsync($"/api/groups/{f.GroupG.Id}/activity")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await cClient.GetAsync($"/api/groups/{f.GroupG.Id}/progress")).StatusCode);

        using var aClient = f.ClientFor(f.Leader);
        Assert.Equal(HttpStatusCode.OK, (await aClient.GetAsync($"/api/groups/{f.GroupG.Id}/activity")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await aClient.GetAsync($"/api/groups/{f.GroupG.Id}/progress")).StatusCode);
    }

    [Fact]
    public async Task RevokedMembership_LosesAllTaskAccess_AndDashboardExcludesTask()
    {
        await using var f = await SeedAsync(deactivateAssignee: true);
        using var bClient = f.ClientFor(f.Assignee);

        Assert.Equal(HttpStatusCode.Forbidden, (await bClient.GetAsync($"/api/tasks/{f.TaskT.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await bClient.GetAsync($"/api/tasks/{f.TaskT.Id}/comments")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await bClient.GetAsync($"/api/tasks/{f.TaskT.Id}/links")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await bClient.GetAsync($"/api/tasks/{f.TaskT.Id}/reviews")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await bClient.PatchAsJsonAsync($"/api/comments/{f.CommentByB.Id}", new { body = "edit" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await bClient.GetAsync($"/api/projects/{f.ProjectP.Id}/tasks")).StatusCode);

        var myTasks = await bClient.GetAsync("/api/dashboard/my-tasks");
        Assert.Equal(HttpStatusCode.OK, myTasks.StatusCode);
        var data = await DataAsync(myTasks);
        Assert.DoesNotContain(data.EnumerateArray(), t => t.GetProperty("id").GetGuid() == f.TaskT.Id);

        using var aClient = f.ClientFor(f.Leader);
        Assert.Equal(HttpStatusCode.OK, (await aClient.GetAsync($"/api/tasks/{f.TaskT.Id}")).StatusCode);
    }

    [Fact]
    public async Task Outsider_And_InactiveUser_AreDenied()
    {
        await using var f = await SeedAsync();
        using var dClient = f.ClientFor(f.Outsider);
        Assert.Equal(HttpStatusCode.Forbidden, (await dClient.GetAsync($"/api/tasks/{f.TaskT.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await dClient.GetAsync($"/api/projects/{f.ProjectP.Id}/tasks")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await dClient.GetAsync($"/api/groups/{f.GroupG.Id}/activity")).StatusCode);

        using var eClient = f.ClientFor(f.InactiveUser);
        Assert.Equal(HttpStatusCode.Unauthorized, (await eClient.GetAsync($"/api/tasks/{f.TaskT.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await eClient.GetAsync($"/api/groups/{f.GroupG.Id}/activity")).StatusCode);
    }

    [Fact]
    public async Task ArchivedGroup_DeniesWith403()
    {
        await using var f = await SeedAsync(archiveGroup: true);
        using var bClient = f.ClientFor(f.Assignee);
        Assert.Equal(HttpStatusCode.Forbidden, (await bClient.GetAsync($"/api/tasks/{f.TaskT.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await bClient.GetAsync($"/api/projects/{f.ProjectP.Id}/tasks")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await bClient.PostAsJsonAsync($"/api/tasks/{f.TaskT.Id}/comments", new { body = "hi" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await bClient.GetAsync($"/api/tasks/{f.TaskT.Id}/links")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await bClient.GetAsync($"/api/tasks/{f.TaskT.Id}/reviews")).StatusCode);
    }

    [Fact]
    public async Task ArchivedProject_Returns404OnGetListAndWrites()
    {
        await using var f = await SeedAsync(archiveProject: true);
        using var bClient = f.ClientFor(f.Assignee);
        using var aClient = f.ClientFor(f.Leader);
        Assert.Equal(HttpStatusCode.NotFound, (await bClient.GetAsync($"/api/tasks/{f.TaskT.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await aClient.GetAsync($"/api/projects/{f.ProjectP.Id}/tasks")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await bClient.PostAsJsonAsync($"/api/tasks/{f.TaskT.Id}/comments", new { body = "hi" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bClient.GetAsync($"/api/tasks/{f.TaskT.Id}/links")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bClient.GetAsync($"/api/tasks/{f.TaskT.Id}/reviews")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await aClient.PostAsJsonAsync($"/api/projects/{f.ProjectP.Id}/tasks", new { title = "x" })).StatusCode);
    }

    [Theory]
    [InlineData("   ", null, null, null, null)]
    [InlineData(null, null, -1.0, null, null)]
    [InlineData(null, null, 1000.0, null, null)]
    [InlineData(null, null, null, 0, null)]
    [InlineData(null, null, null, null, 99)]
    public async Task Create_InvalidMetadata_Returns400_NoMutation(
        string? title, string? description, double? estimate, int? points, int? priority)
    {
        await using var f = await SeedAsync();
        using var client = f.ClientFor(f.Leader);
        var before = await f.SnapshotAsync();

        var response = await client.PostAsJsonAsync($"/api/projects/{f.ProjectP.Id}/tasks", new
        {
            title = title ?? "Valid title",
            description,
            estimateHours = estimate,
            points,
            priority = priority ?? 2
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(before, await f.SnapshotAsync());
    }

    [Fact]
    public async Task Create_TitleOver200_And_DescriptionOver2000_Return400()
    {
        await using var f = await SeedAsync();
        using var client = f.ClientFor(f.Leader);
        var before = await f.SnapshotAsync();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(
            $"/api/projects/{f.ProjectP.Id}/tasks", new { title = new string('x', 201) })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(
            $"/api/projects/{f.ProjectP.Id}/tasks", new { title = "ok", description = new string('x', 2001) })).StatusCode);
        Assert.Equal(before, await f.SnapshotAsync());
    }

    [Fact]
    public async Task Create_LeaderMinimal_Succeeds()
    {
        await using var f = await SeedAsync();
        using var client = f.ClientFor(f.Leader);
        var response = await client.PostAsJsonAsync($"/api/projects/{f.ProjectP.Id}/tasks", new { title = "Leader task" });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var data = await DataAsync(response);
        Assert.Equal("Leader task", data.GetProperty("title").GetString());
        Assert.True(data.GetProperty("canViewDetails").GetBoolean());
    }
}
