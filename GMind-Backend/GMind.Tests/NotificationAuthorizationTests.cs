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
using Task = System.Threading.Tasks.Task;

namespace GMind.Tests;

public class NotificationAuthorizationTests
{
    private const string Secret = "notification-tests-secret-minimum-32-characters!";

    private sealed class Fixture : IAsyncDisposable
    {
        public required WebApplicationFactory<Program> Factory { get; init; }
        public required User Owner { get; init; }
        public required User Other { get; init; }
        public required User Inactive { get; init; }
        public required Group ActiveGroup { get; init; }
        public required GroupMember Membership { get; init; }
        public required Notification Visible { get; init; }
        public required Notification OtherPrivate { get; init; }
        public required Guid[] VisibleIds { get; init; }

        public HttpClient Client(User? user)
        {
            var client = Factory.CreateClient();
            if (user is not null)
            {
                var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["Jwt:Secret"] = Secret, ["Jwt:Issuer"] = "GMindTests",
                    ["Jwt:Audience"] = "GMindTests", ["Jwt:ExpiryMinutes"] = "60"
                }).Build();
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", new TokenService(config).GenerateAccessToken(user));
            }
            return client;
        }

        public async Task<DateTime?> ReadAt(Guid id)
        {
            await using var scope = Factory.Services.CreateAsyncScope();
            return await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>()
                .Notifications.Where(n => n.Id == id).Select(n => n.ReadAt).SingleAsync();
        }

        public async ValueTask DisposeAsync() => await Factory.DisposeAsync();
    }

    private static async Task<Fixture> SeedAsync(int extra = 0)
    {
        var dbName = $"notifications-{Guid.NewGuid()}";
        var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Secret"] = Secret, ["Jwt:Issuer"] = "GMindTests", ["Jwt:Audience"] = "GMindTests",
                ["ConnectionStrings:DefaultConnection"] = "Server=(localdb)\\mssqllocaldb;Database=GMind_NotificationTests_NeverUsed;Trusted_Connection=True;TrustServerCertificate=True;"
            }));
            builder.ConfigureServices(services =>
            {
                var worker = services.SingleOrDefault(d => d.ImplementationType == typeof(ReminderWorker));
                if (worker is not null) services.Remove(worker);
                services.RemoveAll<DbContextOptions<ApplicationDbContext>>();
                services.RemoveAll<Microsoft.EntityFrameworkCore.Infrastructure.IDbContextOptionsConfiguration<ApplicationDbContext>>();
                services.AddDbContext<ApplicationDbContext>(options => options.UseInMemoryDatabase(dbName));
            });
        });
        _ = factory.Services;
        var owner = new User { Id = Guid.NewGuid(), DisplayName = "Owner", Email = "owner@notifications.test", PasswordHash = "x" };
        var other = new User { Id = Guid.NewGuid(), DisplayName = "Other", Email = "other@notifications.test", PasswordHash = "x" };
        var inactive = new User { Id = Guid.NewGuid(), DisplayName = "Inactive", Email = "inactive@notifications.test", PasswordHash = "x", IsActive = false };
        var group = new Group { Id = Guid.NewGuid(), Name = "Active", CreatedByUserId = owner.Id };
        var archived = new Group { Id = Guid.NewGuid(), Name = "Archived", CreatedByUserId = owner.Id, IsArchived = true };
        var former = new Group { Id = Guid.NewGuid(), Name = "Former", CreatedByUserId = other.Id };
        var membership = new GroupMember { Id = Guid.NewGuid(), GroupId = group.Id, UserId = owner.Id, Role = Role.Member };
        Notification Notice(User recipient, Guid? groupId, NotificationType type, string title) => new()
        {
            Id = Guid.NewGuid(), RecipientUserId = recipient.Id, GroupId = groupId,
            Type = type, Title = title, Body = $"BODY_{title}", CreatedAt = DateTime.UtcNow,
            RelatedEntityType = "Group", RelatedEntityId = groupId
        };
        var visible = Notice(owner, group.Id, NotificationType.TaskAssigned, "VISIBLE");
        var read = Notice(owner, group.Id, NotificationType.TaskApproved, "ALREADY_READ");
        read.ReadAt = DateTime.UtcNow.AddMinutes(-1);
        var otherPrivate = Notice(other, group.Id, NotificationType.TaskAssigned, "OTHER_PRIVATE");
        var removed = Notice(owner, former.Id, NotificationType.MemberRemoved, "REMOVED");
        var archivedRemoved = Notice(owner, archived.Id, NotificationType.MemberRemoved, "ARCHIVED_REMOVAL");
        var ungrouped = Notice(owner, null, NotificationType.CommentAdded, "UNGROUPED");
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            db.Users.AddRange(owner, other, inactive);
            db.Groups.AddRange(group, archived, former);
            db.GroupMembers.AddRange(membership,
                new GroupMember { Id = Guid.NewGuid(), GroupId = group.Id, UserId = other.Id, Role = Role.Leader },
                new GroupMember { Id = Guid.NewGuid(), GroupId = archived.Id, UserId = owner.Id, Role = Role.Member },
                new GroupMember { Id = Guid.NewGuid(), GroupId = former.Id, UserId = owner.Id, Role = Role.Member, IsActive = false });
            db.Notifications.AddRange(visible, read, otherPrivate, removed, archivedRemoved, ungrouped,
                Notice(owner, former.Id, NotificationType.TaskAssigned, "FORMER_PRIVATE"),
                Notice(owner, archived.Id, NotificationType.TaskAssigned, "ARCHIVED_PRIVATE"),
                Notice(inactive, null, NotificationType.TaskAssigned, "INACTIVE_PRIVATE"));
            for (var i = 0; i < extra; i++)
                db.Notifications.Add(Notice(owner, null, NotificationType.TaskUpdated, $"EXTRA_{i}"));
            await db.SaveChangesAsync();
        }
        return new Fixture
        {
            Factory = factory, Owner = owner, Other = other, Inactive = inactive,
            ActiveGroup = group, Membership = membership, Visible = visible, OtherPrivate = otherPrivate,
            VisibleIds = [visible.Id, read.Id, removed.Id, archivedRemoved.Id, ungrouped.Id]
        };
    }

    private static async Task<JsonElement> Data(HttpResponseMessage response)
    {
        response.EnsureSuccessStatusCode();
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        return json.GetProperty("data");
    }

    [Fact]
    public async Task ListAndCountRespectRecipientMembershipArchiveAndRemovalExceptions()
    {
        await using var f = await SeedAsync();
        using var client = f.Client(f.Owner);
        var rows = (await Data(await client.GetAsync("/api/notifications?take=100"))).EnumerateArray().ToArray();
        Assert.Equal(f.VisibleIds.Order(), rows.Select(n => n.GetProperty("id").GetGuid()).Order());
        Assert.DoesNotContain(rows, n => n.GetProperty("title").GetString()!.Contains("PRIVATE"));
        var count = await Data(await client.GetAsync("/api/notifications/unread-count"));
        Assert.Equal(4, count.GetProperty("count").GetInt32());
    }

    [Fact]
    public async Task UnreadFilterAndGroupIdUseTheActualVisibleNotification()
    {
        await using var f = await SeedAsync();
        using var client = f.Client(f.Owner);
        var rows = (await Data(await client.GetAsync("/api/notifications?unreadOnly=true&take=100"))).EnumerateArray().ToArray();
        Assert.Equal(4, rows.Length);
        Assert.All(rows, row => Assert.False(row.GetProperty("isRead").GetBoolean()));
        var visible = rows.Single(n => n.GetProperty("id").GetGuid() == f.Visible.Id);
        Assert.Equal(f.ActiveGroup.Id, visible.GetProperty("groupId").GetGuid());
        Assert.Equal(JsonValueKind.Null, rows.Single(n => n.GetProperty("title").GetString() == "UNGROUPED").GetProperty("groupId").ValueKind);
    }

    [Fact]
    public async Task AnotherRecipientsNotificationCannotBeMarkedOrSelectedByQuery()
    {
        await using var f = await SeedAsync();
        using var client = f.Client(f.Owner);
        var denied = await client.PostAsync($"/api/notifications/{f.OtherPrivate.Id}/read", null);
        Assert.Equal(HttpStatusCode.NotFound, denied.StatusCode);
        Assert.Null(await f.ReadAt(f.OtherPrivate.Id));
        var rows = (await Data(await client.GetAsync($"/api/notifications?userId={f.Other.Id}"))).EnumerateArray().ToArray();
        Assert.DoesNotContain(rows, n => n.GetProperty("id").GetGuid() == f.OtherPrivate.Id);
    }

    [Fact]
    public async Task MarkReadPersistsIsIdempotentAndDoesNotChangeAnotherRecipientsCount()
    {
        await using var f = await SeedAsync();
        using var client = f.Client(f.Owner);
        using var other = f.Client(f.Other);
        (await client.PostAsync($"/api/notifications/{f.Visible.Id}/read", null)).EnsureSuccessStatusCode();
        var first = await f.ReadAt(f.Visible.Id);
        Assert.NotNull(first);
        (await client.PostAsync($"/api/notifications/{f.Visible.Id}/read", null)).EnsureSuccessStatusCode();
        Assert.Equal(first, await f.ReadAt(f.Visible.Id));
        Assert.Equal(3, (await Data(await client.GetAsync("/api/notifications/unread-count"))).GetProperty("count").GetInt32());
        Assert.Equal(1, (await Data(await other.GetAsync("/api/notifications/unread-count"))).GetProperty("count").GetInt32());
    }

    [Theory]
    [InlineData(-10, 1)]
    [InlineData(0, 1)]
    [InlineData(2, 2)]
    [InlineData(1000, 100)]
    public async Task TakeIsClampedByTheServer(int take, int expected)
    {
        await using var f = await SeedAsync(120);
        using var client = f.Client(f.Owner);
        var rows = await Data(await client.GetAsync($"/api/notifications?take={take}"));
        Assert.Equal(expected, rows.GetArrayLength());
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task AnonymousOrInactiveUsersCannotReadPrivateNotifications(bool inactive)
    {
        await using var f = await SeedAsync();
        using var client = f.Client(inactive ? f.Inactive : null);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/notifications")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/notifications/unread-count")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsync($"/api/notifications/{f.Visible.Id}/read", null)).StatusCode);
    }

    [Fact]
    public async Task RevokedMembershipHidesOldNotificationsAndPreventsFurtherReadMutation()
    {
        await using var f = await SeedAsync();
        using var client = f.Client(f.Owner);
        (await client.GetAsync("/api/notifications")).EnsureSuccessStatusCode();
        await using (var scope = f.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await db.GroupMembers.SingleAsync(m => m.Id == f.Membership.Id)).IsActive = false;
            await db.SaveChangesAsync();
        }
        var rows = (await Data(await client.GetAsync("/api/notifications"))).EnumerateArray().ToArray();
        Assert.DoesNotContain(rows, n => n.GetProperty("id").GetGuid() == f.Visible.Id);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsync($"/api/notifications/{f.Visible.Id}/read", null)).StatusCode);
        Assert.Null(await f.ReadAt(f.Visible.Id));
    }
}
