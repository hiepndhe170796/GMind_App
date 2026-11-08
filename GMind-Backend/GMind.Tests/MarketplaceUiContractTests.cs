using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using GMind.Application.Services.Auth;
using GMind.Domain.Entities;
using GMind.Infrastructure.Persistence;
using GMind.Infrastructure.Workers;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using TaskEntity = GMind.Domain.Entities.Task;
using Task = System.Threading.Tasks.Task;

namespace GMind.Tests;

public class MarketplaceUiContractTests
{
    private const string Secret = "test-secret-key-minimum-32-chars-long!";

    private static WebApplicationFactory<Program> MakeFactory(string dbName) =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
            builder.ConfigureAppConfiguration((_, config) =>
            {
                config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["Jwt:Issuer"] = "GMindTests", ["Jwt:Audience"] = "GMindTests",
                    ["Jwt:Secret"] = Secret,
                    ["ConnectionStrings:DefaultConnection"] =
                        "Server=(localdb)\\mssqllocaldb;Database=GMind_MkTests_NeverUsed;Trusted_Connection=True;TrustServerCertificate=True;"
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

    private static HttpClient ClientFor(WebApplicationFactory<Program> f, User u)
    {
        var c = f.CreateClient();
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:Secret"] = Secret, ["Jwt:Issuer"] = "GMindTests",
            ["Jwt:Audience"] = "GMindTests", ["Jwt:ExpiryMinutes"] = "60"
        }).Build();
        c.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", new TokenService(config).GenerateAccessToken(u));
        return c;
    }

    private static async Task<(WebApplicationFactory<Program> f, Fixture dbx, User leader, User member, Group g, Project p, TaskEntity mine, TaskEntity other)> SeedAsync()
    {
        var f = MakeFactory($"mk-{Guid.NewGuid()}");
        _ = f.Services;
        var scope = f.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var leader = new User { Id = Guid.NewGuid(), DisplayName = "Same Name", Email = "l@t.dev", PasswordHash = "x" };
        var member = new User { Id = Guid.NewGuid(), DisplayName = "Same Name", Email = "m@t.dev", PasswordHash = "x" };
        var g = new Group { Id = Guid.NewGuid(), Name = "G", CreatedByUserId = leader.Id };
        var p = new Project { Id = Guid.NewGuid(), GroupId = g.Id, Name = "P", CreatedByUserId = leader.Id };
        var mine = new TaskEntity { Id = Guid.NewGuid(), ProjectId = p.Id, Title = "Mine", AssigneeUserId = member.Id, Status = GMind.Domain.Enums.TaskStatus.InProgress, CreatedByUserId = leader.Id };
        var other = new TaskEntity { Id = Guid.NewGuid(), ProjectId = p.Id, Title = "Other", AssigneeUserId = leader.Id, Status = GMind.Domain.Enums.TaskStatus.InProgress, CreatedByUserId = member.Id };
        db.Users.AddRange(leader, member);
        db.Groups.Add(g); db.Projects.Add(p); db.Tasks.AddRange(mine, other);
        db.GroupMembers.AddRange(
            new GroupMember { GroupId = g.Id, UserId = leader.Id, Role = GMind.Domain.Enums.Role.Leader, IsActive = true },
            new GroupMember { GroupId = g.Id, UserId = member.Id, Role = GMind.Domain.Enums.Role.Member, IsActive = true });
        await db.SaveChangesAsync();
        return (f, new Fixture(scope, db), leader, member, g, p, mine, other);
    }

    private sealed record Fixture(IAsyncDisposable Scope, ApplicationDbContext Db) : IAsyncDisposable
    {
        public async ValueTask DisposeAsync() { await Db.DisposeAsync(); await Scope.DisposeAsync(); }
    }

    private static async Task<JsonElement> DataAsync(HttpResponseMessage r)
    {
        using var doc = JsonDocument.Parse(await r.Content.ReadAsStringAsync());
        return doc.RootElement.GetProperty("data").Clone();
    }

    [Fact]
    public async Task Swap_create_returns_full_pair_ids_and_names()
    {
        var (f, dbx, leader, member, g, _, mine, other) = await SeedAsync();
        var db = dbx.Db;
        var client = ClientFor(f, member);
        var create = await client.PostAsJsonAsync($"/api/groups/{g.Id}/marketplace-requests",
            new { requestType = 3, taskId = mine.Id, targetUserId = leader.Id, relatedTaskId = other.Id, reason = "swap" });
        Assert.Equal(HttpStatusCode.OK, create.StatusCode);
        var d = await DataAsync(create);
        Assert.Equal(mine.Id.ToString(), d.GetProperty("taskId").GetString());
        Assert.Equal(member.Id.ToString(), d.GetProperty("requestedByUserId").GetString());
        Assert.Equal(leader.Id.ToString(), d.GetProperty("targetUserId").GetString());
        Assert.Equal(other.Id.ToString(), d.GetProperty("relatedTaskId").GetString());
        Assert.Equal("Other", d.GetProperty("relatedTaskTitle").GetString());
        Assert.Equal("Same Name", d.GetProperty("targetName").GetString());

        var list = await ClientFor(f, leader).GetAsync($"/api/groups/{g.Id}/marketplace-requests");
        var row = (await DataAsync(list))[0];
        Assert.Equal(member.Id.ToString(), row.GetProperty("requestedByUserId").GetString());
        Assert.Equal(other.Id.ToString(), row.GetProperty("relatedTaskId").GetString());
        Assert.Equal("Other", row.GetProperty("relatedTaskTitle").GetString());
        await dbx.DisposeAsync();
        await f.DisposeAsync();
    }

    [Fact]
    public async Task Swap_approve_reassigns_exactly_the_pair_member_cannot_approve()
    {
        var (f, dbx, leader, member, g, _, mine, other) = await SeedAsync();
        var db = dbx.Db;
        var memberClient = ClientFor(f, member);
        var create = await memberClient.PostAsJsonAsync($"/api/groups/{g.Id}/marketplace-requests",
            new { requestType = 3, taskId = mine.Id, targetUserId = leader.Id, relatedTaskId = other.Id, reason = "swap" });
        var id = (await DataAsync(create)).GetProperty("id").GetString();
        Assert.Equal(HttpStatusCode.Forbidden,
            (await memberClient.PostAsJsonAsync($"/api/marketplace-requests/{id}/approve", new { })).StatusCode);
        var ok = await ClientFor(f, leader).PostAsJsonAsync($"/api/marketplace-requests/{id}/approve", new { comment = "ok" });
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        await db.Entry(mine).ReloadAsync(); await db.Entry(other).ReloadAsync();
        Assert.Equal(leader.Id, mine.AssigneeUserId);
        Assert.Equal(member.Id, other.AssigneeUserId);
        await dbx.DisposeAsync();
        await f.DisposeAsync();
    }

    [Fact]
    public async Task Cancel_only_by_requester_id_and_reject_keeps_assignee()
    {
        var (f, dbx, leader, member, g, _, mine, _) = await SeedAsync();
        var db = dbx.Db;
        var create = await ClientFor(f, member).PostAsJsonAsync($"/api/groups/{g.Id}/marketplace-requests",
            new { requestType = 2, taskId = mine.Id, targetUserId = leader.Id, reason = "move" });
        var id = (await DataAsync(create)).GetProperty("id").GetString();
        Assert.Equal(HttpStatusCode.Forbidden,
            (await ClientFor(f, leader).PostAsJsonAsync($"/api/marketplace-requests/{id}/cancel", new { })).StatusCode);
        var reject = await ClientFor(f, leader).PostAsJsonAsync($"/api/marketplace-requests/{id}/reject", new { comment = "no" });
        Assert.Equal(HttpStatusCode.OK, reject.StatusCode);
        await db.Entry(mine).ReloadAsync();
        Assert.Equal(member.Id, mine.AssigneeUserId);
        await dbx.DisposeAsync();
        await f.DisposeAsync();
    }

    [Fact]
    public async Task Activity_includes_project_id_and_is_leader_only()
    {
        var (f, dbx, leader, member, g, p, mine, _) = await SeedAsync();
        var db = dbx.Db;
        await ClientFor(f, member).PostAsJsonAsync($"/api/groups/{g.Id}/marketplace-requests",
            new { requestType = 1, taskId = mine.Id, reason = "help" });
        Assert.Equal(HttpStatusCode.Forbidden,
            (await ClientFor(f, member).GetAsync($"/api/groups/{g.Id}/activity")).StatusCode);
        var list = await ClientFor(f, leader).GetAsync($"/api/groups/{g.Id}/activity");
        Assert.Equal(HttpStatusCode.OK, list.StatusCode);
        var rows = await DataAsync(list);
        Assert.True(rows.GetArrayLength() > 0);
        Assert.Equal(p.Id.ToString(), rows[0].GetProperty("projectId").GetString());
        await dbx.DisposeAsync();
        await f.DisposeAsync();
    }


    [Fact]
    public async Task Transfer_approve_changes_only_requested_task_and_member_denied_group_writes()
    {
        var (f, dbx, leader, member, g, p, mine, other) = await SeedAsync();
        var db = dbx.Db;
        var memberClient = ClientFor(f, member);
        var create = await memberClient.PostAsJsonAsync($"/api/groups/{g.Id}/marketplace-requests",
            new { requestType = 2, taskId = mine.Id, targetUserId = leader.Id, reason = "move" });
        var id = (await DataAsync(create)).GetProperty("id").GetString();
        await db.Entry(mine).ReloadAsync();
        Assert.Equal(member.Id, mine.AssigneeUserId); // Pending: unchanged
        Assert.Equal(HttpStatusCode.Forbidden,
            (await memberClient.PatchAsJsonAsync($"/api/groups/{g.Id}", new { name = "X" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await memberClient.PatchAsJsonAsync($"/api/groups/{g.Id}/members/{member.Id}", new { role = 1 })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await memberClient.PatchAsJsonAsync($"/api/projects/{p.Id}", new { name = "Y" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await memberClient.PostAsJsonAsync($"/api/projects/{p.Id}/archive", new { })).StatusCode);
        var outsider = new User { Id = Guid.NewGuid(), DisplayName = "Out", Email = "o@t.dev", PasswordHash = "x" };
        db.Users.Add(outsider); await db.SaveChangesAsync();
        var oc = ClientFor(f, outsider);
        Assert.Equal(HttpStatusCode.Forbidden, (await oc.GetAsync($"/api/groups/{g.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await oc.GetAsync($"/api/groups/{g.Id}/marketplace-requests")).StatusCode);
        var ok = await ClientFor(f, leader).PostAsJsonAsync($"/api/marketplace-requests/{id}/approve", new { comment = "ok" });
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        await db.Entry(mine).ReloadAsync(); await db.Entry(other).ReloadAsync();
        Assert.Equal(leader.Id, mine.AssigneeUserId);   // only the requested task moved
        Assert.Equal(leader.Id, other.AssigneeUserId);  // untouched
        await dbx.DisposeAsync(); await f.DisposeAsync();
    }
}
