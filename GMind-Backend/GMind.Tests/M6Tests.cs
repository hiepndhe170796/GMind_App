using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using GMind.API.Realtime;
using GMind.Application.Common;
using GMind.Application.Common.Exceptions;
using GMind.Application.Services.Auth;
using GMind.Domain.Entities;
using GMind.Domain.Enums;
using GMind.Infrastructure.Persistence;
using GMind.Infrastructure.Storage;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;
using TaskEntity = GMind.Domain.Entities.Task;
using Task = System.Threading.Tasks.Task;

namespace GMind.Tests;

/// <summary>Stage 2 M6 Part A — file storage/validation, project+task files, avatars, discussion, realtime.</summary>
public class M6Tests
{
    private const string Secret = "test-secret-key-minimum-32-chars-long!";
    private const string Password = "Password123!";

    private static WebApplicationFactory<Program> MakeFactory(string dbName, string storageDir,
        long? quotaBytes = null, int uploadsLimit = 500, int chatLimit = 500)
    {
        var f = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Issuer"] = "GMindTests", ["Jwt:Audience"] = "GMindTests", ["Jwt:Secret"] = Secret,
                ["Jwt:RefreshTokenExpiryDays"] = "7",
                ["RateLimiting:LoginPermitLimit"] = "500", ["RateLimiting:RecoveryPermitLimit"] = "500",
                ["RateLimiting:UploadPermitLimit"] = uploadsLimit.ToString(),
                ["RateLimiting:ChatSendPermitLimit"] = chatLimit.ToString(),
                ["ConnectionStrings:DefaultConnection"] =
                    "Server=(localdb)\\mssqllocaldb;Database=GMind_M6Tests_NeverUsed;Trusted_Connection=True;TrustServerCertificate=True;",
            }));
            builder.ConfigureServices(services =>
            {
                var worker = services.SingleOrDefault(d => d.ImplementationType == typeof(GMind.Infrastructure.Workers.ReminderWorker));
                if (worker is not null) services.Remove(worker);
                services.RemoveAll<DbContextOptions<ApplicationDbContext>>();
                services.RemoveAll<Microsoft.EntityFrameworkCore.Infrastructure.IDbContextOptionsConfiguration<ApplicationDbContext>>();
                services.AddDbContext<ApplicationDbContext>((sp, o) =>
                    o.UseInMemoryDatabase(dbName).AddInterceptors(sp.GetRequiredService<RealtimeChangeInterceptor>()));
                // Program.cs binds StorageOptions eagerly from builder.Configuration, which does not
                // see ConfigureAppConfiguration values — override the option instance directly.
                services.AddSingleton(Microsoft.Extensions.Options.Options.Create(new StorageOptions
                {
                    RootPath = storageDir,
                    GroupQuotaBytes = quotaBytes ?? StorageOptions.DefaultGroupQuotaBytes,
                }));
            });
        });
        _ = f.Services;
        return f;
    }

    private static string TempStorage()
        => Path.Combine(Path.GetTempPath(), $"gm-m6store-{Guid.NewGuid():N}");

    private sealed record Ws(
        WebApplicationFactory<Program> F, string StorageDir,
        User Leader, User Member1, User Member2, User Member3, User Outsider,
        Group Group, Project Project, TaskEntity Task, TaskEntity Subtask, TaskEntity Loose,
        string LeaderAccess, string Member1Access, string Member2Access, string Member3Access, string OutsiderAccess);

    private static async Task<Ws> SeedAsync(long? quotaBytes = null, int uploadsLimit = 500, int chatLimit = 500)
    {
        var dir = TempStorage();
        var f = MakeFactory($"m6-{Guid.NewGuid()}", dir, quotaBytes, uploadsLimit, chatLimit);
        User Mk(string name) => new()
        {
            Id = Guid.NewGuid(), DisplayName = name,
            Email = $"m6{Guid.NewGuid():N}@test.dev",
            PasswordHash = new PasswordHasher().HashPassword(Password), IsActive = true
        };
        var leader = Mk("M6 Leader"); var m1 = Mk("M6 Mot"); var m2 = Mk("M6 Hai"); var m3 = Mk("M6 Ba"); var o = Mk("M6 Ngoai");
        var g = new Group { Id = Guid.NewGuid(), Name = "M6 Group", CreatedByUserId = leader.Id };
        var p = new Project { Id = Guid.NewGuid(), GroupId = g.Id, Name = "M6 Project", CreatedByUserId = leader.Id };
        var t = new TaskEntity { Id = Guid.NewGuid(), ProjectId = p.Id, Title = "M6 Task", CreatedByUserId = leader.Id, AssigneeUserId = m1.Id };
        var sub = new TaskEntity { Id = Guid.NewGuid(), ProjectId = p.Id, Title = "M6 Sub", CreatedByUserId = leader.Id, ParentTaskId = t.Id, AssigneeUserId = m2.Id };
        var loose = new TaskEntity { Id = Guid.NewGuid(), ProjectId = p.Id, Title = "M6 Loose", CreatedByUserId = leader.Id, AssigneeUserId = m1.Id };
        await using (var scope = f.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            db.Users.AddRange(leader, m1, m2, m3, o);
            db.Groups.Add(g); db.Projects.Add(p); db.Tasks.AddRange(t, sub, loose);
            db.GroupMembers.AddRange(
                new GroupMember { Id = Guid.NewGuid(), GroupId = g.Id, UserId = leader.Id, Role = Role.Leader, IsActive = true },
                new GroupMember { Id = Guid.NewGuid(), GroupId = g.Id, UserId = m1.Id, Role = Role.Member, IsActive = true },
                new GroupMember { Id = Guid.NewGuid(), GroupId = g.Id, UserId = m2.Id, Role = Role.Member, IsActive = true },
                new GroupMember { Id = Guid.NewGuid(), GroupId = g.Id, UserId = m3.Id, Role = Role.Member, IsActive = true });
            // m2 is also an approved helper on the parent task.
            db.TaskHelpers.Add(new TaskHelper { Id = Guid.NewGuid(), TaskId = t.Id, HelperUserId = m2.Id, Scope = "help" });
            await db.SaveChangesAsync();
        }
        string A(User u) => LoginAsync(f, u.Email).Result;
        return new Ws(f, dir, leader, m1, m2, m3, o, g, p, t, sub, loose,
            A(leader), A(m1), A(m2), A(m3), A(o));
    }

    private static async Task<string> LoginAsync(WebApplicationFactory<Program> f, string email)
    {
        using var client = f.CreateClient();
        var r = await client.PostAsJsonAsync("/api/auth/login", new { email, password = Password });
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        using var doc = JsonDocument.Parse(await r.Content.ReadAsStringAsync());
        return doc.RootElement.GetProperty("data").GetProperty("accessToken").GetString()!;
    }

    private static HttpClient Client(WebApplicationFactory<Program> f, string? bearer = null)
    {
        var c = f.CreateClient();
        if (bearer is not null) c.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", bearer);
        return c;
    }

    private static void Cleanup(Ws w)
    {
        w.F.Dispose();
        try { if (Directory.Exists(w.StorageDir)) Directory.Delete(w.StorageDir, true); } catch { }
    }

    private static int StoredObjectCount(string dir)
        => Directory.Exists(dir) ? Directory.EnumerateFiles(dir, "*", SearchOption.AllDirectories).Count() : 0;

    // sample bytes per signature family
    private static byte[] Png() => [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3];
    private static byte[] Pdf() => "%PDF-1.4\nbody"u8.ToArray();
    private static byte[] Jpg() => [0xFF, 0xD8, 0xFF, 0xE0, 0, 0x10, 1, 2];
    private static byte[] Gif() => "GIF89a.....".Take(11).Select(c => (byte)c).ToArray();
    private static byte[] Webp() => [(byte)'R', (byte)'I', (byte)'F', (byte)'F', 0, 0, 0, 0, (byte)'W', (byte)'E', (byte)'B', (byte)'P', 1, 2];
    private static byte[] Zip() => [0x50, 0x4B, 0x03, 0x04, 1, 2, 3];
    private static byte[] Ole() => [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1, 0, 1];
    private static byte[] Txt() => "Xin chào — tệp văn bản UTF-8."u8.ToArray();

    private static HttpRequestMessage MultipartRequest(HttpMethod method, string url, string fileName, byte[] bytes)
    {
        var form = new MultipartFormDataContent();
        var content = new ByteArrayContent(bytes);
        content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        form.Add(content, "file", fileName);
        return new HttpRequestMessage(method, url) { Content = form };
    }

    private static async Task<HttpResponseMessage> Upload(HttpClient c, string url, string fileName, byte[] bytes)
        => await c.SendAsync(MultipartRequest(HttpMethod.Post, url, fileName, bytes));

    private static async Task<HttpResponseMessage> UploadPut(HttpClient c, string url, string fileName, byte[] bytes)
        => await c.SendAsync(MultipartRequest(HttpMethod.Put, url, fileName, bytes));

    // ─────────────── A1: FileValidator ───────────────

    public static IEnumerable<object[]> AllowedFiles()
    {
        yield return ["a.pdf", Pdf(), "application/pdf"];
        yield return ["a.doc", Ole(), "application/msword"];
        yield return ["a.docx", Zip(), "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
        yield return ["a.xls", Ole(), "application/vnd.ms-excel"];
        yield return ["a.xlsx", Zip(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];
        yield return ["a.ppt", Ole(), "application/vnd.ms-powerpoint"];
        yield return ["a.pptx", Zip(), "application/vnd.openxmlformats-officedocument.presentationml.presentation"];
        yield return ["a.txt", Txt(), "text/plain; charset=utf-8"];
        yield return ["a.md", Txt(), "text/markdown; charset=utf-8"];
        yield return ["a.csv", Txt(), "text/csv; charset=utf-8"];
        yield return ["a.png", Png(), "image/png"];
        yield return ["a.jpg", Jpg(), "image/jpeg"];
        yield return ["a.jpeg", Jpg(), "image/jpeg"];
        yield return ["a.gif", Gif(), "image/gif"];
        yield return ["a.webp", Webp(), "image/webp"];
        yield return ["a.zip", Zip(), "application/zip"];
    }

    [Theory]
    [MemberData(nameof(AllowedFiles))]
    public void FileValidator_AllowedTypeWithSignature_Accepted(string name, byte[] head, string contentType)
    {
        var v = FileValidator.Validate(name, 1024, head, FileValidationMode.Document, StorageOptions.DefaultMaxFileBytes);
        Assert.Equal(contentType, v.ContentType);
        Assert.EndsWith($".{v.Extension}", v.SafeName);
    }

    public static IEnumerable<object[]> WrongSignatures()
    {
        yield return ["a.pdf", Png()];   // png bytes, pdf name
        yield return ["a.png", Pdf()];
        yield return ["a.jpg", Png()];
        yield return ["a.gif", Png()];
        yield return ["a.webp", Zip()];
        yield return ["a.docx", Ole()];  // ooxml needs PK, not OLE
        yield return ["a.doc", Zip()];   // ole needs D0CF, not PK
        yield return ["a.zip", Ole()];
        yield return ["a.txt", Png()];
    }

    [Theory]
    [MemberData(nameof(WrongSignatures))]
    public void FileValidator_WrongSignature_Rejected(string name, byte[] head)
    {
        var ex = Assert.Throws<BadRequestException>(() => FileValidator.Validate(name, 1024, head, FileValidationMode.Document, StorageOptions.DefaultMaxFileBytes));
        Assert.Contains("không khớp", ex.Message);
    }

    [Theory]
    [InlineData("a.exe")] [InlineData("a.svg")] [InlineData("a.html")] [InlineData("noext")] [InlineData("a.pdf.exe")]
    public void FileValidator_DangerousOrMissingExtension_Rejected(string name)
        => Assert.Throws<BadRequestException>(() => FileValidator.Validate(name, 100, Pdf(), FileValidationMode.Document, StorageOptions.DefaultMaxFileBytes));

    [Fact]
    public void FileValidator_DoubleExtension_InnerExtWins()
    {
        var v = FileValidator.Validate("a.exe.pdf", 100, Pdf(), FileValidationMode.Document, StorageOptions.DefaultMaxFileBytes);
        Assert.Equal("pdf", v.Extension);
    }

    [Fact]
    public void FileValidator_Empty_And_OverLimit()
    {
        Assert.Equal("Tệp trống.", Assert.Throws<BadRequestException>(
            () => FileValidator.Validate("a.txt", 0, Txt(), FileValidationMode.Document, StorageOptions.DefaultMaxFileBytes)).Message);
        Assert.Equal("Tệp vượt quá 10 MB.", Assert.Throws<BadRequestException>(
            () => FileValidator.Validate("a.txt", 10_485_761, Txt(), FileValidationMode.Document, StorageOptions.DefaultMaxFileBytes)).Message);
        Assert.Equal("Tệp vượt quá 2 MB.", Assert.Throws<BadRequestException>(
            () => FileValidator.Validate("a.png", 2_097_153, Png(), FileValidationMode.Avatar, StorageOptions.DefaultMaxAvatarBytes)).Message);
    }

    [Fact]
    public void FileValidator_TextRules()
    {
        var withNul = Encoding.UTF8.GetBytes("abc\0def");
        Assert.Throws<BadRequestException>(() => FileValidator.Validate("a.txt", 100, withNul, FileValidationMode.Document, StorageOptions.DefaultMaxFileBytes));
        var invalid = new byte[] { 0xFF, 0xFE, 0xFD, 0x80 };
        Assert.Throws<BadRequestException>(() => FileValidator.Validate("a.txt", 100, invalid, FileValidationMode.Document, StorageOptions.DefaultMaxFileBytes));
        // BOM-prefixed UTF-8 is fine; a truncated multi-byte tail is tolerated.
        var bom = new byte[] { 0xEF, 0xBB, 0xBF }.Concat("xin chào"u8.ToArray()).ToArray();
        FileValidator.Validate("a.txt", 100, bom, FileValidationMode.Document, StorageOptions.DefaultMaxFileBytes);
        var truncatedTail = "xin chào"u8.ToArray()[..^1]; // cuts the last multi-byte char mid-sequence
        FileValidator.Validate("a.txt", 100, truncatedTail, FileValidationMode.Document, StorageOptions.DefaultMaxFileBytes);
    }

    [Fact]
    public void FileValidator_NameSanitization()
    {
        Assert.Equal("evil.pdf", FileValidator.Validate(@"..\..\evil.pdf", 10, Pdf(), FileValidationMode.Document, StorageOptions.DefaultMaxFileBytes).SafeName);
        Assert.Equal("evil.pdf", FileValidator.Validate("a/b/c/../../evil.pdf", 10, Pdf(), FileValidationMode.Document, StorageOptions.DefaultMaxFileBytes).SafeName);
        var ctrl = FileValidator.Validate("a\u0001\u0002b.txt", 10, Txt(), FileValidationMode.Document, StorageOptions.DefaultMaxFileBytes).SafeName;
        Assert.Equal("ab.txt", ctrl);
        var longName = new string('x', 300) + ".pdf";
        var safe = FileValidator.Validate(longName, 10, Pdf(), FileValidationMode.Document, StorageOptions.DefaultMaxFileBytes).SafeName;
        Assert.Equal(200, safe.Length);
        Assert.EndsWith(".pdf", safe);
    }

    [Fact]
    public void FileValidator_AvatarMode()
    {
        FileValidator.Validate("me.png", 100, Png(), FileValidationMode.Avatar, StorageOptions.DefaultMaxAvatarBytes);
        var ex = Assert.Throws<BadRequestException>(() => FileValidator.Validate("me.gif", 100, Gif(), FileValidationMode.Avatar, StorageOptions.DefaultMaxAvatarBytes));
        Assert.Equal("Ảnh đại diện chỉ nhận PNG, JPEG hoặc WebP.", ex.Message);
        Assert.Throws<BadRequestException>(() => FileValidator.Validate("me.txt", 100, Txt(), FileValidationMode.Avatar, StorageOptions.DefaultMaxAvatarBytes));
    }

    // ─────────────── A1: LocalFileStorage ───────────────

    [Fact]
    public async Task LocalFileStorage_PathTraversalRejected_OverLimitLeavesNothing_DeleteIdempotent()
    {
        var dir = TempStorage();
        try
        {
            var storage = new LocalFileStorage(
                Microsoft.Extensions.Options.Options.Create(new StorageOptions { RootPath = dir }),
                NullLogger<LocalFileStorage>.Instance);

            await Assert.ThrowsAsync<BadRequestException>(() => storage.OpenReadAsync("../x", default));
            await Assert.ThrowsAsync<BadRequestException>(() => storage.DeleteAsync("..\\..\\x", default));

            await Assert.ThrowsAsync<BadRequestException>(async () =>
            {
                await using var s = new MemoryStream(new byte[200]);
                await storage.SaveAsync(s, 100);
            });
            Assert.False(Directory.EnumerateFiles(dir, "*", SearchOption.AllDirectories).Any());

            await using (var s = new MemoryStream(new byte[50]))
            {
                var key = await storage.SaveAsync(s, 100);
                Assert.StartsWith($"{DateTime.UtcNow:yyyy}/", key.Replace('\\', '/'));
                var open = await storage.OpenReadAsync(key);
                Assert.NotNull(open);
                await open!.DisposeAsync();
                await storage.DeleteAsync(key);
                await storage.DeleteAsync(key); // idempotent
                Assert.Null(await storage.OpenReadAsync(key));
            }
        }
        finally { try { Directory.Delete(dir, true); } catch { } }
    }

    // ─────────────── A2: project files ───────────────

    [Fact]
    public async Task ProjectFiles_Member_Upload_List_Download_WithHeaders_And_ExactBytes()
    {
        var w = await SeedAsync();
        try
        {
            var client = Client(w.F, w.Member1Access);
            var bytes = Pdf().Concat(new byte[] { 9, 9, 9 }).ToArray();
            var up = await Upload(client, $"/api/projects/{w.Project.Id}/files", "báo cáo.pdf", bytes);
            Assert.Equal(HttpStatusCode.OK, up.StatusCode);
            var dto = JsonDocument.Parse(await up.Content.ReadAsStringAsync()).RootElement.GetProperty("data");
            var fileId = dto.GetProperty("id").GetGuid();
            Assert.Equal("project", dto.GetProperty("kind").GetString());
            Assert.True(dto.GetProperty("canDelete").GetBoolean()); // uploader

            var list = await client.GetFromJsonAsync<JsonElement>($"/api/projects/{w.Project.Id}/files");
            Assert.Single(list.GetProperty("data").EnumerateArray());

            var dl = await client.GetAsync($"/api/files/{fileId}/content");
            Assert.Equal(HttpStatusCode.OK, dl.StatusCode);
            Assert.Equal("nosniff", dl.Headers.GetValues("X-Content-Type-Options").Single());
            Assert.Contains("no-store", dl.Headers.GetValues("Cache-Control").Single());
            Assert.Contains("sandbox", dl.Headers.GetValues("Content-Security-Policy").Single());
            Assert.Equal("attachment", dl.Content.Headers.ContentDisposition!.DispositionType);
            Assert.Equal(bytes, await dl.Content.ReadAsByteArrayAsync());
        }
        finally { Cleanup(w); }
    }

    [Fact]
    public async Task ProjectFiles_NonMember_403()
    {
        var w = await SeedAsync();
        try
        {
            var client = Client(w.F, w.OutsiderAccess);
            Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/projects/{w.Project.Id}/files")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await Upload(client, $"/api/projects/{w.Project.Id}/files", "a.pdf", Pdf())).StatusCode);
        }
        finally { Cleanup(w); }
    }

    [Fact]
    public async Task ProjectFiles_ArchivedProject_404()
    {
        var w = await SeedAsync();
        try
        {
            var up = await Upload(Client(w.F, w.LeaderAccess), $"/api/projects/{w.Project.Id}/files", "a.pdf", Pdf());
            Assert.Equal(HttpStatusCode.OK, up.StatusCode);
            var fileId = JsonDocument.Parse(await up.Content.ReadAsStringAsync()).RootElement.GetProperty("data").GetProperty("id").GetGuid();

            await using (var scope = w.F.Services.CreateAsyncScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                (await db.Projects.FindAsync(w.Project.Id))!.ArchivedAt = DateTime.UtcNow;
                await db.SaveChangesAsync();
            }
            var client = Client(w.F, w.LeaderAccess);
            Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/projects/{w.Project.Id}/files")).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/files/{fileId}/content")).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync($"/api/files/{fileId}")).StatusCode);
        }
        finally { Cleanup(w); }
    }

    [Fact]
    public async Task ProjectFiles_DeleteRules_SoftDelete404()
    {
        var w = await SeedAsync();
        try
        {
            var up = await Upload(Client(w.F, w.Member1Access), $"/api/projects/{w.Project.Id}/files", "a.pdf", Pdf());
            var fileId = JsonDocument.Parse(await up.Content.ReadAsStringAsync()).RootElement.GetProperty("data").GetProperty("id").GetGuid();

            // another member cannot delete
            Assert.Equal(HttpStatusCode.Forbidden, (await Client(w.F, w.Member3Access).DeleteAsync($"/api/files/{fileId}")).StatusCode);
            // leader can
            Assert.Equal(HttpStatusCode.OK, (await Client(w.F, w.LeaderAccess).DeleteAsync($"/api/files/{fileId}")).StatusCode);
            // soft-deleted → 404
            Assert.Equal(HttpStatusCode.NotFound, (await Client(w.F, w.Member1Access).GetAsync($"/api/files/{fileId}/content")).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await Client(w.F, w.LeaderAccess).DeleteAsync($"/api/files/{fileId}")).StatusCode);
            // physical file removed
            Assert.Equal(0, StoredObjectCount(w.StorageDir));

            // uploader can delete their own
            var up2 = await Upload(Client(w.F, w.Member1Access), $"/api/projects/{w.Project.Id}/files", "b.pdf", Pdf());
            var fileId2 = JsonDocument.Parse(await up2.Content.ReadAsStringAsync()).RootElement.GetProperty("data").GetProperty("id").GetGuid();
            Assert.Equal(HttpStatusCode.OK, (await Client(w.F, w.Member1Access).DeleteAsync($"/api/files/{fileId2}")).StatusCode);
        }
        finally { Cleanup(w); }
    }

    [Fact]
    public async Task ProjectFiles_Quota409()
    {
        var w = await SeedAsync(quotaBytes: 30);
        try
        {
            var client = Client(w.F, w.LeaderAccess);
            var big = Pdf().Concat(new byte[100]).ToArray(); // ~110 bytes > 30 quota
            var r = await Upload(client, $"/api/projects/{w.Project.Id}/files", "a.pdf", big);
            Assert.Equal(HttpStatusCode.Conflict, r.StatusCode);
            Assert.Contains("dung lượng", await r.Content.ReadAsStringAsync());
            Assert.Equal(0, StoredObjectCount(w.StorageDir));
        }
        finally { Cleanup(w); }
    }

    // ─────────────── A2: task files ───────────────

    [Fact]
    public async Task TaskFiles_Permissions_AssigneeLeaderParentAssignee_Helper403_Member403()
    {
        var w = await SeedAsync();
        try
        {
            // assignee m1 uploads to task
            Assert.Equal(HttpStatusCode.OK, (await Upload(Client(w.F, w.Member1Access), $"/api/tasks/{w.Task.Id}/files", "a.pdf", Pdf())).StatusCode);
            // leader uploads
            Assert.Equal(HttpStatusCode.OK, (await Upload(Client(w.F, w.LeaderAccess), $"/api/tasks/{w.Task.Id}/files", "b.pdf", Pdf())).StatusCode);
            // parent-task assignee m1 uploads to the subtask
            Assert.Equal(HttpStatusCode.OK, (await Upload(Client(w.F, w.Member1Access), $"/api/tasks/{w.Subtask.Id}/files", "c.pdf", Pdf())).StatusCode);
            // helper m2: list + download ok on parent task, upload 403
            var list = await Client(w.F, w.Member2Access).GetFromJsonAsync<JsonElement>($"/api/tasks/{w.Task.Id}/files");
            var first = list.GetProperty("data").EnumerateArray().First();
            Assert.Equal(HttpStatusCode.OK, (await Client(w.F, w.Member2Access).GetAsync($"/api/files/{first.GetProperty("id").GetGuid()}/content")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await Upload(Client(w.F, w.Member2Access), $"/api/tasks/{w.Task.Id}/files", "d.pdf", Pdf())).StatusCode);
            // unrelated member: 403 list and upload
            Assert.Equal(HttpStatusCode.Forbidden, (await Client(w.F, w.Member3Access).GetAsync($"/api/tasks/{w.Task.Id}/files")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await Upload(Client(w.F, w.Member3Access), $"/api/tasks/{w.Task.Id}/files", "e.pdf", Pdf())).StatusCode);
        }
        finally { Cleanup(w); }
    }

    [Fact]
    public async Task TaskDelete_SoftDeletesFiles_And_RemovesPhysical()
    {
        var w = await SeedAsync();
        try
        {
            // The parent task has a subtask ("Hãy xóa các công việc con trước."), so use the childless one.
            var up = await Upload(Client(w.F, w.Member1Access), $"/api/tasks/{w.Loose.Id}/files", "a.pdf", Pdf());
            var fileId = JsonDocument.Parse(await up.Content.ReadAsStringAsync()).RootElement.GetProperty("data").GetProperty("id").GetGuid();

            // deleting the task clears TaskId + marks DeletedAt and removes the object
            var del = await Client(w.F, w.LeaderAccess).DeleteAsync($"/api/tasks/{w.Loose.Id}");
            Assert.Equal(HttpStatusCode.OK, del.StatusCode);
            Assert.Equal(0, StoredObjectCount(w.StorageDir));
            await using var scope = w.F.Services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var row = await db.StoredFiles.FindAsync(fileId);
            Assert.NotNull(row!.DeletedAt);
            Assert.Null(row.TaskId);
        }
        finally { Cleanup(w); }
    }

    // ─────────────── A3: avatar ───────────────

    [Fact]
    public async Task Avatar_Upload_AnonymousGet_Replace_Delete()
    {
        var w = await SeedAsync();
        try
        {
            var client = Client(w.F, w.Member1Access);
            var up = await UploadPut(client, "/api/me/avatar", "me.png", Png());
            Assert.Equal(HttpStatusCode.OK, up.StatusCode);
            var url = JsonDocument.Parse(await up.Content.ReadAsStringAsync()).RootElement.GetProperty("data").GetProperty("avatarUrl").GetString()!;
            Assert.Matches(@"^/api/avatars/[0-9a-f-]{36}$", url);

            // anonymous GET → inline bytes with public cache + security headers
            using var anon = w.F.CreateClient();
            var get = await anon.GetAsync(url);
            Assert.Equal(HttpStatusCode.OK, get.StatusCode);
            Assert.Equal("image/png", get.Content.Headers.ContentType!.MediaType);
            Assert.Contains("immutable", get.Headers.GetValues("Cache-Control").Single());
            Assert.Equal("same-site", get.Headers.GetValues("Cross-Origin-Resource-Policy").Single());
            Assert.NotEqual("attachment", get.Content.Headers.ContentDisposition?.DispositionType);
            Assert.Equal(Png(), await get.Content.ReadAsByteArrayAsync());

            // replace → old id 404
            var up2 = await UploadPut(client, "/api/me/avatar", "me2.jpg", Jpg());
            var url2 = JsonDocument.Parse(await up2.Content.ReadAsStringAsync()).RootElement.GetProperty("data").GetProperty("avatarUrl").GetString()!;
            Assert.NotEqual(url, url2);
            Assert.Equal(HttpStatusCode.NotFound, (await anon.GetAsync(url)).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await anon.GetAsync(url2)).StatusCode);

            // DELETE clears and 404s
            Assert.Equal(HttpStatusCode.OK, (await client.DeleteAsync("/api/me/avatar")).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await anon.GetAsync(url2)).StatusCode);
            var me = await client.GetFromJsonAsync<JsonElement>("/api/me");
            Assert.Equal(JsonValueKind.Null, me.GetProperty("data").GetProperty("avatarUrl").ValueKind);
        }
        finally { Cleanup(w); }
    }

    [Fact]
    public async Task Avatar_ProfileRules_And_Gif400()
    {
        var w = await SeedAsync();
        try
        {
            var c1 = Client(w.F, w.Member1Access);
            var c2 = Client(w.F, w.Member2Access);
            // gif → 400 with the avatar-specific message
            var gif = await UploadPut(c1, "/api/me/avatar", "me.gif", Gif());
            Assert.Equal(HttpStatusCode.BadRequest, gif.StatusCode);
            Assert.Contains("PNG, JPEG hoặc WebP", await gif.Content.ReadAsStringAsync());

            var up1 = await UploadPut(c1, "/api/me/avatar", "me.png", Png());
            var url1 = JsonDocument.Parse(await up1.Content.ReadAsStringAsync()).RootElement.GetProperty("data").GetProperty("avatarUrl").GetString()!;
            var up2 = await UploadPut(c2, "/api/me/avatar", "other.png", Png());
            var url2 = JsonDocument.Parse(await up2.Content.ReadAsStringAsync()).RootElement.GetProperty("data").GetProperty("avatarUrl").GetString()!;

            // PATCH own managed path ok; another user's managed path 400
            var okPatch = await c1.PatchAsJsonAsync("/api/me", new { displayName = "M6 Mot", avatarUrl = url1 });
            Assert.Equal(HttpStatusCode.OK, okPatch.StatusCode);
            var badPatch = await c1.PatchAsJsonAsync("/api/me", new { displayName = "M6 Mot", avatarUrl = url2 });
            Assert.Equal(HttpStatusCode.BadRequest, badPatch.StatusCode);
            Assert.Contains("không hợp lệ", await badPatch.Content.ReadAsStringAsync());

            // moving to an http URL deletes the managed file → old path 404
            var move = await c1.PatchAsJsonAsync("/api/me", new { displayName = "M6 Mot", avatarUrl = "https://example.com/a.png" });
            Assert.Equal(HttpStatusCode.OK, move.StatusCode);
            using var anon = w.F.CreateClient();
            Assert.Equal(HttpStatusCode.NotFound, (await anon.GetAsync(url1)).StatusCode);
            var me = await c1.GetFromJsonAsync<JsonElement>("/api/me");
            Assert.Equal("https://example.com/a.png", me.GetProperty("data").GetProperty("avatarUrl").GetString());
        }
        finally { Cleanup(w); }
    }

    // ─────────────── A4: discussion ───────────────

    private static async Task<HttpResponseMessage> SendMessage(HttpClient c, Guid projectId,
        string? body = null, Guid? replyTo = null, IEnumerable<Guid>? mentions = null,
        IEnumerable<(string Name, byte[] Bytes)>? files = null)
    {
        using var form = new MultipartFormDataContent();
        if (body is not null) form.Add(new StringContent(body), "body");
        if (replyTo is Guid r) form.Add(new StringContent(r.ToString()), "replyToMessageId");
        foreach (var m in mentions ?? []) form.Add(new StringContent(m.ToString()), "mentionUserIds");
        foreach (var (name, bytes) in files ?? [])
        {
            var content = new ByteArrayContent(bytes);
            content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
            form.Add(content, "files", name);
        }
        return await c.PostAsync($"/api/projects/{projectId}/messages", form);
    }

    [Fact]
    public async Task Discussion_Send_And_CursorPaging_IdenticalTimestamps()
    {
        var w = await SeedAsync();
        try
        {
            var c1 = Client(w.F, w.Member1Access);
            var send = await SendMessage(c1, w.Project.Id, body: "tin nhắn đầu");
            Assert.Equal(HttpStatusCode.OK, send.StatusCode);
            var msg = JsonDocument.Parse(await send.Content.ReadAsStringAsync()).RootElement.GetProperty("data");
            Assert.True(msg.GetProperty("isMine").GetBoolean());
            Assert.True(msg.GetProperty("canEdit").GetBoolean());

            // three more messages sharing one timestamp → cursor page must not dup/skip
            var stamp = DateTime.UtcNow;
            await using (var scope = w.F.Services.CreateAsyncScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                for (var i = 0; i < 3; i++)
                    db.ProjectMessages.Add(new ProjectMessage
                    { Id = Guid.NewGuid(), ProjectId = w.Project.Id, AuthorUserId = w.Leader.Id, Body = $"same-ts {i}", CreatedAt = stamp });
                await db.SaveChangesAsync();
            }
            var page1 = await c1.GetFromJsonAsync<JsonElement>($"/api/projects/{w.Project.Id}/messages?take=2");
            var data1 = page1.GetProperty("data");
            Assert.Equal(2, data1.GetProperty("items").GetArrayLength());
            var cursor = data1.GetProperty("nextCursor").GetString()!;
            var page2 = await c1.GetFromJsonAsync<JsonElement>($"/api/projects/{w.Project.Id}/messages?take=2&cursor={Uri.EscapeDataString(cursor)}");
            var ids = data1.GetProperty("items").EnumerateArray().Concat(page2.GetProperty("data").GetProperty("items").EnumerateArray())
                .Select(i => i.GetProperty("id").GetGuid()).ToList();
            Assert.Equal(ids.Count, ids.Distinct().Count());
            Assert.Equal(4, ids.Count);
            Assert.Null(page2.GetProperty("data").GetProperty("nextCursor").GetString());

            // bad cursor 400, take bounds 400
            Assert.Equal(HttpStatusCode.BadRequest, (await c1.GetAsync($"/api/projects/{w.Project.Id}/messages?cursor=@@@")).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await c1.GetAsync($"/api/projects/{w.Project.Id}/messages?take=0")).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await c1.GetAsync($"/api/projects/{w.Project.Id}/messages?take=51")).StatusCode);
        }
        finally { Cleanup(w); }
    }

    [Fact]
    public async Task Discussion_NonMember403_Archived404()
    {
        var w = await SeedAsync();
        try
        {
            var co = Client(w.F, w.OutsiderAccess);
            Assert.Equal(HttpStatusCode.Forbidden, (await co.GetAsync($"/api/projects/{w.Project.Id}/messages")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await SendMessage(co, w.Project.Id, body: "hi")).StatusCode);

            await using (var scope = w.F.Services.CreateAsyncScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                (await db.Projects.FindAsync(w.Project.Id))!.ArchivedAt = DateTime.UtcNow;
                await db.SaveChangesAsync();
            }
            var c1 = Client(w.F, w.LeaderAccess);
            Assert.Equal(HttpStatusCode.NotFound, (await c1.GetAsync($"/api/projects/{w.Project.Id}/messages")).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await SendMessage(c1, w.Project.Id, body: "hi")).StatusCode);
        }
        finally { Cleanup(w); }
    }

    [Fact]
    public async Task Discussion_Reply_Mention_Notifications()
    {
        var w = await SeedAsync();
        try
        {
            var c1 = Client(w.F, w.Member1Access);
            var first = await SendMessage(c1, w.Project.Id, body: "câu hỏi");
            var firstId = JsonDocument.Parse(await first.Content.ReadAsStringAsync()).RootElement.GetProperty("data").GetProperty("id").GetGuid();

            // m2 replies AND mentions the author → exactly one DiscussionReply (mention wins, no dup)
            var c2 = Client(w.F, w.Member2Access);
            var reply = await SendMessage(c2, w.Project.Id, body: "trả lời @author", replyTo: firstId, mentions: [w.Member1.Id]);
            Assert.Equal(HttpStatusCode.OK, reply.StatusCode);
            var rd = JsonDocument.Parse(await reply.Content.ReadAsStringAsync()).RootElement.GetProperty("data");
            var replyDto = rd.GetProperty("replyTo");
            Assert.Equal(firstId, replyDto.GetProperty("id").GetGuid());
            Assert.False(replyDto.GetProperty("isDeleted").GetBoolean());
            Assert.Contains("câu hỏi", replyDto.GetProperty("excerpt").GetString());
            Assert.Equal(w.Member1.Id, rd.GetProperty("mentions")[0].GetProperty("userId").GetGuid());

            await using var scope = w.F.Services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var notifs = await db.Notifications.Where(n => n.RecipientUserId == w.Member1.Id).ToListAsync();
            var mention = Assert.Single(notifs, n => n.Type == NotificationType.MentionedInDiscussion);
            Assert.Equal("Bạn được nhắc trong thảo luận", mention.Title);
            Assert.Equal("Project", mention.RelatedEntityType);
            // reply author was the mentioned sender → no extra DiscussionReply
            Assert.DoesNotContain(notifs, n => n.Type == NotificationType.DiscussionReply);

            // m3 replies to m1's message without mentioning → m1 gets DiscussionReply
            await SendMessage(Client(w.F, w.Member3Access), w.Project.Id, body: "m3 replying", replyTo: firstId);
            var after = await db.Notifications.Where(n => n.RecipientUserId == w.Member1.Id).ToListAsync();
            var dr = Assert.Single(after, n => n.Type == NotificationType.DiscussionReply);
            Assert.Equal("Có người trả lời bạn", dr.Title);
        }
        finally { Cleanup(w); }
    }

    [Fact]
    public async Task Discussion_ReplyValidation_And_MentionValidation()
    {
        var w = await SeedAsync();
        try
        {
            var c1 = Client(w.F, w.Member1Access);
            // reply to a message in another project → 400
            var otherProject = new Project { Id = Guid.NewGuid(), GroupId = w.Group.Id, Name = "P2", CreatedByUserId = w.Leader.Id };
            Guid foreignMsgId;
            await using (var scope = w.F.Services.CreateAsyncScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                db.Projects.Add(otherProject);
                var fm = new ProjectMessage { Id = Guid.NewGuid(), ProjectId = otherProject.Id, AuthorUserId = w.Leader.Id, Body = "x" };
                db.ProjectMessages.Add(fm);
                await db.SaveChangesAsync();
                foreignMsgId = fm.Id;
            }
            var r1 = await SendMessage(c1, w.Project.Id, body: "x", replyTo: foreignMsgId);
            Assert.Equal(HttpStatusCode.BadRequest, r1.StatusCode);
            Assert.Contains("Không tìm thấy tin nhắn được trả lời", await r1.Content.ReadAsStringAsync());

            // reply to a deleted message → 400
            var m = await SendMessage(c1, w.Project.Id, body: "to be deleted");
            var mid = JsonDocument.Parse(await m.Content.ReadAsStringAsync()).RootElement.GetProperty("data").GetProperty("id").GetGuid();
            await c1.DeleteAsync($"/api/messages/{mid}");
            var r2 = await SendMessage(c1, w.Project.Id, body: "x", replyTo: mid);
            Assert.Equal(HttpStatusCode.BadRequest, r2.StatusCode);
            Assert.Contains("đã bị xóa", await r2.Content.ReadAsStringAsync());

            // mention a non-member → 400
            var r3 = await SendMessage(c1, w.Project.Id, body: "x", mentions: [w.Outsider.Id]);
            Assert.Equal(HttpStatusCode.BadRequest, r3.StatusCode);
            Assert.Contains("không còn trong nhóm", await r3.Content.ReadAsStringAsync());
        }
        finally { Cleanup(w); }
    }

    [Fact]
    public async Task Discussion_Edit_OnlyAuthor_NewMentionsNotify()
    {
        var w = await SeedAsync();
        try
        {
            var c1 = Client(w.F, w.Member1Access);
            var send = await SendMessage(c1, w.Project.Id, body: "bản nháp", mentions: [w.Member2.Id]);
            var mid = JsonDocument.Parse(await send.Content.ReadAsStringAsync()).RootElement.GetProperty("data").GetProperty("id").GetGuid();

            // non-author edit → 403
            Assert.Equal(HttpStatusCode.Forbidden,
                (await Client(w.F, w.Member2Access).PatchAsJsonAsync($"/api/messages/{mid}", new { body = "hack" })).StatusCode);

            // author edits, swapping mention m2 → m3: only m3 gets a notification
            var patch = await c1.PatchAsJsonAsync($"/api/messages/{mid}", new { body = "đã sửa", mentionUserIds = new[] { w.Member3.Id } });
            Assert.Equal(HttpStatusCode.OK, patch.StatusCode);
            var dto = JsonDocument.Parse(await patch.Content.ReadAsStringAsync()).RootElement.GetProperty("data");
            Assert.NotEqual(JsonValueKind.Null, dto.GetProperty("updatedAt").ValueKind);
            Assert.Equal(w.Member3.Id, dto.GetProperty("mentions")[0].GetProperty("userId").GetGuid());

            await using var scope = w.F.Services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            Assert.Single(await db.Notifications.Where(n => n.RecipientUserId == w.Member3.Id && n.Type == NotificationType.MentionedInDiscussion).ToListAsync());
            Assert.Single(await db.Notifications.Where(n => n.RecipientUserId == w.Member2.Id && n.Type == NotificationType.MentionedInDiscussion).ToListAsync()); // from send only
        }
        finally { Cleanup(w); }
    }

    [Fact]
    public async Task Discussion_Delete_Permissions_Placeholder_ModerationLog()
    {
        var w = await SeedAsync();
        try
        {
            var c1 = Client(w.F, w.Member1Access);
            var send = await SendMessage(c1, w.Project.Id, body: "xóa tôi", files: [("f.txt", Txt())]);
            var mid = JsonDocument.Parse(await send.Content.ReadAsStringAsync()).RootElement.GetProperty("data").GetProperty("id").GetGuid();

            // other member cannot delete
            Assert.Equal(HttpStatusCode.Forbidden, (await Client(w.F, w.Member2Access).DeleteAsync($"/api/messages/{mid}")).StatusCode);
            // leader deletes someone else's → logged
            Assert.Equal(HttpStatusCode.OK, (await Client(w.F, w.LeaderAccess).DeleteAsync($"/api/messages/{mid}")).StatusCode);

            var list = await c1.GetFromJsonAsync<JsonElement>($"/api/projects/{w.Project.Id}/messages");
            var dto = list.GetProperty("data").GetProperty("items")[0];
            Assert.True(dto.GetProperty("isDeleted").GetBoolean());
            Assert.Equal(JsonValueKind.Null, dto.GetProperty("body").ValueKind);
            Assert.Empty(dto.GetProperty("mentions").EnumerateArray());
            Assert.Empty(dto.GetProperty("attachments").EnumerateArray());
            Assert.False(dto.GetProperty("canEdit").GetBoolean());
            Assert.False(dto.GetProperty("canDelete").GetBoolean());

            await using var scope = w.F.Services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var log = await db.ActivityLogs.SingleAsync(a => a.EntityType == "ProjectMessage");
            Assert.Equal("DeleteMessage", log.Action);
            Assert.Contains("Xóa tin nhắn của", log.Summary);
            // attachments were deleted from storage
            Assert.Equal(0, StoredObjectCount(w.StorageDir));

            // author deletes their own
            var send2 = await SendMessage(c1, w.Project.Id, body: "mine");
            var mid2 = JsonDocument.Parse(await send2.Content.ReadAsStringAsync()).RootElement.GetProperty("data").GetProperty("id").GetGuid();
            Assert.Equal(HttpStatusCode.OK, (await c1.DeleteAsync($"/api/messages/{mid2}")).StatusCode);
            Assert.False(await db.ActivityLogs.AnyAsync(a => a.EntityType == "ProjectMessage" && a.EntityId == mid2));
        }
        finally { Cleanup(w); }
    }

    [Fact]
    public async Task Discussion_BodyLimits_EmptyOrTooManyFiles()
    {
        var w = await SeedAsync();
        try
        {
            var c1 = Client(w.F, w.Member1Access);
            var tooLong = await SendMessage(c1, w.Project.Id, body: new string('x', 4001));
            Assert.Equal(HttpStatusCode.BadRequest, tooLong.StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await SendMessage(c1, w.Project.Id, body: new string('x', 4000))).StatusCode);

            var empty = await SendMessage(c1, w.Project.Id, body: "   ");
            Assert.Equal(HttpStatusCode.BadRequest, empty.StatusCode);
            Assert.Contains("nội dung", await empty.Content.ReadAsStringAsync());

            var six = await SendMessage(c1, w.Project.Id, body: "nhiều tệp",
                files: Enumerable.Range(0, 6).Select(i => ($"f{i}.txt", Txt())));
            Assert.Equal(HttpStatusCode.BadRequest, six.StatusCode);
            Assert.Contains("tối đa 5 tệp", await six.Content.ReadAsStringAsync());

            // file-only message ok; excerpt becomes [Tệp đính kèm] in mention notification
            var fileOnly = await SendMessage(c1, w.Project.Id, mentions: [w.Member2.Id], files: [("only.txt", Txt())]);
            Assert.Equal(HttpStatusCode.OK, fileOnly.StatusCode);
            var attach = JsonDocument.Parse(await fileOnly.Content.ReadAsStringAsync()).RootElement
                .GetProperty("data").GetProperty("attachments")[0];
            Assert.Equal("only.txt", attach.GetProperty("name").GetString());
            Assert.False(attach.GetProperty("canDelete").GetBoolean());
        }
        finally { Cleanup(w); }
    }

    [Fact]
    public async Task DiscussionAttachment_Delete400_DownloadAfterDelete404()
    {
        var w = await SeedAsync();
        try
        {
            var c1 = Client(w.F, w.Member1Access);
            var send = await SendMessage(c1, w.Project.Id, body: "kèm tệp", files: [("note.txt", Txt())]);
            var data = JsonDocument.Parse(await send.Content.ReadAsStringAsync()).RootElement.GetProperty("data");
            var msgId = data.GetProperty("id").GetGuid();
            var fileId = data.GetProperty("attachments")[0].GetProperty("id").GetGuid();

            // member can download while the message is alive
            Assert.Equal(HttpStatusCode.OK, (await Client(w.F, w.Member2Access).GetAsync($"/api/files/{fileId}/content")).StatusCode);
            // direct delete → 400
            var del = await Client(w.F, w.Member1Access).DeleteAsync($"/api/files/{fileId}");
            Assert.Equal(HttpStatusCode.BadRequest, del.StatusCode);
            Assert.Contains("xóa tin nhắn", await del.Content.ReadAsStringAsync());
            // after message delete → 404
            Assert.Equal(HttpStatusCode.OK, (await c1.DeleteAsync($"/api/messages/{msgId}")).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await Client(w.F, w.Member2Access).GetAsync($"/api/files/{fileId}/content")).StatusCode);
        }
        finally { Cleanup(w); }
    }

    // ─────────────── A5: realtime ───────────────

    [Fact]
    public async Task Interceptor_MessagesAndFiles_LandInRightLists()
    {
        var outbox = new RealtimeOutbox(NullLogger<RealtimeOutbox>.Instance);
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"m6-ic-{Guid.NewGuid()}")
            .AddInterceptors(new RealtimeChangeInterceptor(outbox))
            .Options;
        await using var db = new ApplicationDbContext(options);
        var uid = Guid.NewGuid();
        var g = new Group { Id = Guid.NewGuid(), Name = "G", CreatedByUserId = uid };
        var p = new Project { Id = Guid.NewGuid(), GroupId = g.Id, Name = "P", CreatedByUserId = uid };
        var t = new TaskEntity { Id = Guid.NewGuid(), ProjectId = p.Id, Title = "T", CreatedByUserId = uid };
        db.Users.Add(new User { Id = uid, DisplayName = "U", Email = "u@t.dev", PasswordHash = "x" });
        db.Groups.Add(g); db.Projects.Add(p); db.Tasks.Add(t);
        await db.SaveChangesAsync();
        Assert.True(outbox.Reader.TryRead(out var seedBatch)); // seed write produced a batch

        var msg = new ProjectMessage { Id = Guid.NewGuid(), ProjectId = p.Id, AuthorUserId = uid, Body = "hi" };
        db.ProjectMessages.Add(msg);
        db.StoredFiles.Add(new StoredFile
        {
            Id = Guid.NewGuid(), Kind = FileKind.Message, GroupId = g.Id, ProjectId = p.Id, MessageId = msg.Id,
            UploadedByUserId = uid, OriginalName = "a.txt", Extension = "txt",
            ContentType = "text/plain; charset=utf-8", SizeBytes = 5, StorageKey = "k1"
        });
        db.StoredFiles.Add(new StoredFile
        {
            Id = Guid.NewGuid(), Kind = FileKind.Task, GroupId = g.Id, ProjectId = p.Id, TaskId = t.Id,
            UploadedByUserId = uid, OriginalName = "b.txt", Extension = "txt",
            ContentType = "text/plain; charset=utf-8", SizeBytes = 5, StorageKey = "k2"
        });
        db.StoredFiles.Add(new StoredFile
        {
            Id = Guid.NewGuid(), Kind = FileKind.Project, GroupId = g.Id, ProjectId = p.Id,
            UploadedByUserId = uid, OriginalName = "c.txt", Extension = "txt",
            ContentType = "text/plain; charset=utf-8", SizeBytes = 5, StorageKey = "k3"
        });
        db.StoredFiles.Add(new StoredFile
        {
            Id = Guid.NewGuid(), Kind = FileKind.Avatar,
            UploadedByUserId = uid, OriginalName = "d.png", Extension = "png",
            ContentType = "image/png", SizeBytes = 5, StorageKey = "k4"
        });
        db.TaskLinks.Add(new TaskLink { Id = Guid.NewGuid(), ProjectId = p.Id, TaskId = null, Url = "https://x.dev", CreatedByUserId = uid });
        await db.SaveChangesAsync();

        Assert.True(outbox.Reader.TryRead(out var batch));
        Assert.Contains(p.Id, batch!.DiscussionProjectIds);
        Assert.Contains(t.Id, batch.TaskIds);
        Assert.Contains(p.Id, batch.ProjectIds);
        Assert.DoesNotContain(batch.DiscussionProjectIds, i => i != p.Id);
    }

    private sealed class FakeClientProxy(FakeHubContext owner, string kind, string key) : IClientProxy
    {
        public Task SendCoreAsync(string method, object?[] args, CancellationToken cancellationToken = default)
        {
            owner.Sent.Add((kind, key, method, args.FirstOrDefault()));
            return Task.CompletedTask;
        }
    }

    private sealed class FakeHubClients(FakeHubContext owner) : IHubClients
    {
        public IClientProxy All => new FakeClientProxy(owner, "all", "");
        public IClientProxy AllExcept(IReadOnlyList<string> excludedConnectionIds) => All;
        public IClientProxy Client(string connectionId) => new FakeClientProxy(owner, "client", connectionId);
        public IClientProxy Clients(IReadOnlyList<string> connectionIds) => new FakeClientProxy(owner, "clients", string.Join(',', connectionIds));
        public IClientProxy Group(string groupName) => new FakeClientProxy(owner, "group", groupName);
        public IClientProxy GroupExcept(string groupName, IReadOnlyList<string> excludedConnectionIds) => Group(groupName);
        public IClientProxy Groups(IReadOnlyList<string> groupNames) => new FakeClientProxy(owner, "groups", string.Join(',', groupNames));
        public IClientProxy User(string userId) => new FakeClientProxy(owner, "user", userId);
        public IClientProxy Users(IReadOnlyList<string> userIds) => new FakeClientProxy(owner, "users", string.Join(',', userIds));
    }

    private sealed class FakeHubContext : IHubContext<RealtimeHub>
    {
        public List<(string Kind, string Key, string Method, object? Arg)> Sent { get; } = new();
        public IHubClients Clients => new FakeHubClients(this);
        public IGroupManager Groups => throw new NotImplementedException();
    }

    [Fact]
    public async Task Dispatcher_DiscussionEvent_OnlyToActiveMembersOfRightGroup()
    {
        var dbName = $"m6-dsp-{Guid.NewGuid()}";
        var services = new ServiceCollection()
            .AddDbContext<ApplicationDbContext>(o => o.UseInMemoryDatabase(dbName))
            .BuildServiceProvider();

        var memberId = Guid.NewGuid(); var otherId = Guid.NewGuid(); var inactiveId = Guid.NewGuid();
        var g = new Group { Id = Guid.NewGuid(), Name = "G", CreatedByUserId = memberId };
        var g2 = new Group { Id = Guid.NewGuid(), Name = "G2", CreatedByUserId = memberId };
        var p = new Project { Id = Guid.NewGuid(), GroupId = g.Id, Name = "P", CreatedByUserId = memberId };
        var pOther = new Project { Id = Guid.NewGuid(), GroupId = g2.Id, Name = "P2", CreatedByUserId = memberId };
        var pArchived = new Project { Id = Guid.NewGuid(), GroupId = g.Id, Name = "PA", CreatedByUserId = memberId, ArchivedAt = DateTime.UtcNow };
        await using (var scope = services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            db.Users.AddRange(
                new User { Id = memberId, DisplayName = "M", Email = "m@t.dev", PasswordHash = "x", IsActive = true },
                new User { Id = otherId, DisplayName = "O", Email = "o@t.dev", PasswordHash = "x", IsActive = true },
                new User { Id = inactiveId, DisplayName = "I", Email = "i@t.dev", PasswordHash = "x", IsActive = true });
            db.Groups.AddRange(g, g2); db.Projects.AddRange(p, pOther, pArchived);
            db.GroupMembers.AddRange(
                new GroupMember { Id = Guid.NewGuid(), GroupId = g.Id, UserId = memberId, IsActive = true },
                new GroupMember { Id = Guid.NewGuid(), GroupId = g.Id, UserId = inactiveId, IsActive = false },
                new GroupMember { Id = Guid.NewGuid(), GroupId = g2.Id, UserId = otherId, IsActive = true });
            await db.SaveChangesAsync();
        }

        var outbox = new RealtimeOutbox(NullLogger<RealtimeOutbox>.Instance);
        var hub = new FakeHubContext();
        var dispatcher = new RealtimeDispatcher(services, outbox, hub, NullLogger<RealtimeDispatcher>.Instance);
        outbox.Enqueue(new RealtimeBatch([], [], [], [], [], [p.Id, pOther.Id, pArchived.Id]));
        await dispatcher.StartAsync(default);
        var deadline = DateTime.UtcNow.AddSeconds(10);
        while (hub.Sent.Count(s => s.Method == "discussion") < 2 && DateTime.UtcNow < deadline) await Task.Delay(50);
        await dispatcher.StopAsync(default);

        var disc = hub.Sent.Where(s => s.Method == "discussion").ToList();
        Assert.Equal(2, disc.Count);
        var toG = Assert.Single(disc, s => s.Key.Contains(memberId.ToString()));
        Assert.DoesNotContain(disc, s => s.Key.Contains(inactiveId.ToString()));
        var payloads = disc.Select(s => s.Arg!.GetType().GetProperty("projectId")!.GetValue(s.Arg)).Cast<Guid>().ToList();
        Assert.Contains(p.Id, payloads);
        Assert.Contains(pOther.Id, payloads);
        Assert.DoesNotContain(pArchived.Id, payloads);
    }

    // ─────────────── pipeline ───────────────

    [Fact]
    public async Task RateLimit_PerUser_Uploads_And_ChatSend()
    {
        var w = await SeedAsync(uploadsLimit: 2, chatLimit: 2);
        try
        {
            var cA = Client(w.F, w.Member1Access);
            var cB = Client(w.F, w.Member2Access);

            // member1 hits the uploads cap at 2 → the 3rd upload is 429 with the VN envelope
            Assert.Equal(HttpStatusCode.OK, (await Upload(cA, $"/api/projects/{w.Project.Id}/files", "a1.pdf", Pdf())).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await Upload(cA, $"/api/projects/{w.Project.Id}/files", "a2.pdf", Pdf())).StatusCode);
            var third = await Upload(cA, $"/api/projects/{w.Project.Id}/files", "a3.pdf", Pdf());
            Assert.Equal((HttpStatusCode)429, third.StatusCode);
            Assert.Contains("quá nhiều lần", await third.Content.ReadAsStringAsync());
            // member2's own bucket is untouched — the limiter sees the user, not the IP
            Assert.Equal(HttpStatusCode.OK, (await Upload(cB, $"/api/projects/{w.Project.Id}/files", "b1.pdf", Pdf())).StatusCode);

            // chat-send: same per-user shape
            Assert.Equal(HttpStatusCode.OK, (await SendMessage(cA, w.Project.Id, body: "m1")).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await SendMessage(cA, w.Project.Id, body: "m2")).StatusCode);
            var thirdMsg = await SendMessage(cA, w.Project.Id, body: "m3");
            Assert.Equal((HttpStatusCode)429, thirdMsg.StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await SendMessage(cB, w.Project.Id, body: "vẫn gửi được")).StatusCode);
        }
        finally { Cleanup(w); }
    }

    [Fact]
    public async Task RequestTooLarge_413_Envelope()
    {
        // TestServer has no transport body limit, so the pipeline-level 413 can only be produced by
        // Kestrel (covered by the real-API smoke). Here the exception handler maps it directly.
        var handler = new GMind.API.Common.GlobalExceptionHandler(
            NullLogger<GMind.API.Common.GlobalExceptionHandler>.Instance);
        var ctx = new DefaultHttpContext();
        ctx.Response.Body = new MemoryStream();
        var handled = await handler.TryHandleAsync(ctx,
            new BadHttpRequestException("Request body too large", StatusCodes.Status413RequestEntityTooLarge),
            default);
        Assert.True(handled);
        Assert.Equal(StatusCodes.Status413RequestEntityTooLarge, ctx.Response.StatusCode);
        ctx.Response.Body.Seek(0, SeekOrigin.Begin);
        var json = JsonDocument.Parse(ctx.Response.Body).RootElement;
        Assert.False(json.GetProperty("success").GetBoolean());
        Assert.Equal("Tệp vượt quá giới hạn dung lượng cho phép.", json.GetProperty("message").GetString());
    }
}
