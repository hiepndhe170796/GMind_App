using GMind.Application.Common;
using GMind.Application.Common.Exceptions;
using GMind.Application.DTOs;
using GMind.Domain.Entities;
using GMind.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Task = System.Threading.Tasks.Task;

namespace GMind.Application.Services.Files;

public sealed class FileService(
    IApplicationDbContext context,
    IResourceAccess access,
    IFileStorage storage,
    IOptions<StorageOptions> storageOptions,
    ILogger<FileService> logger) : IFileService
{
    private readonly StorageOptions _options = storageOptions.Value;

    private static string KindName(FileKind kind) => kind switch
    {
        FileKind.Project => "project",
        FileKind.Task => "task",
        FileKind.Message => "message",
        _ => "avatar",
    };

    private async Task<Project> RequireLiveProjectAsync(Guid projectId, CancellationToken ct)
        => await context.Projects.FirstOrDefaultAsync(p => p.Id == projectId && p.ArchivedAt == null, ct)
            ?? throw new NotFoundException("Không tìm thấy dự án này.");

    private static bool IsLeader(GroupMember member) => member.Role == Role.Leader;

    private static FileDto ToDto(StoredFile f, string uploaderName, Guid currentUserId, bool isLeader)
        => new(f.Id, KindName(f.Kind), f.ProjectId, f.TaskId, f.MessageId, f.OriginalName,
            f.Extension, f.ContentType, f.SizeBytes, f.UploadedByUserId, uploaderName,
            f.CreatedAt, f.ContentType.StartsWith("image/", StringComparison.Ordinal),
            f.Kind != FileKind.Message && (f.UploadedByUserId == currentUserId || isLeader));

    // ─────────────── project files ───────────────

    public async Task<List<FileDto>> ListProjectFilesAsync(Guid userId, Guid projectId, CancellationToken ct = default)
    {
        var project = await RequireLiveProjectAsync(projectId, ct);
        var member = await access.RequireMemberAsync(userId, project.GroupId, ct);
        var isLeader = IsLeader(member);
        return await context.StoredFiles
            .Where(f => f.ProjectId == projectId && f.Kind == FileKind.Project && f.DeletedAt == null)
            .OrderByDescending(f => f.CreatedAt)
            .Select(f => new FileDto(f.Id, "project", f.ProjectId, f.TaskId, f.MessageId,
                f.OriginalName, f.Extension, f.ContentType, f.SizeBytes,
                f.UploadedByUserId, f.UploadedBy.DisplayName, f.CreatedAt,
                f.ContentType.StartsWith("image/"),
                f.UploadedByUserId == userId || isLeader))
            .ToListAsync(ct);
    }

    public async Task<FileDto> UploadProjectFileAsync(Guid userId, Guid projectId, UploadedFile file, CancellationToken ct = default)
    {
        var project = await RequireLiveProjectAsync(projectId, ct);
        var member = await access.RequireMemberAsync(userId, project.GroupId, ct);

        var (validated, key) = await ValidateAndStoreAsync(project.GroupId, file, FileValidationMode.Document, ct);
        var row = new StoredFile
        {
            Id = Guid.NewGuid(), Kind = FileKind.Project,
            GroupId = project.GroupId, ProjectId = projectId,
            UploadedByUserId = userId, OriginalName = validated.SafeName,
            Extension = validated.Extension, ContentType = validated.ContentType,
            SizeBytes = file.Length, StorageKey = key,
        };
        context.StoredFiles.Add(row);
        context.ActivityLogs.Add(Log(userId, project.GroupId, projectId, "StoredFile", row.Id, "AddFile",
            $"Tải lên tệp '{row.OriginalName}' vào dự án '{project.Name}'"));
        try
        {
            await context.SaveChangesAsync(ct);
        }
        catch
        {
            await storage.DeleteAsync(key, ct);
            throw;
        }
        var uploaderName = await context.Users.Where(u => u.Id == userId).Select(u => u.DisplayName).FirstAsync(ct);
        return ToDto(row, uploaderName, userId, IsLeader(member));
    }

    // ─────────────── task files ───────────────

    public async Task<List<FileDto>> ListTaskFilesAsync(Guid userId, Guid taskId, CancellationToken ct = default)
    {
        var task = await access.RequireTaskDetailsAsync(userId, taskId, ct);
        var isLeader = await context.GroupMembers
            .AnyAsync(m => m.GroupId == task.Project.GroupId && m.UserId == userId && m.IsActive && m.Role == Role.Leader, ct);
        return await context.StoredFiles
            .Where(f => f.TaskId == taskId && f.Kind == FileKind.Task && f.DeletedAt == null)
            .OrderByDescending(f => f.CreatedAt)
            .Select(f => new FileDto(f.Id, "task", f.ProjectId, f.TaskId, f.MessageId,
                f.OriginalName, f.Extension, f.ContentType, f.SizeBytes,
                f.UploadedByUserId, f.UploadedBy.DisplayName, f.CreatedAt,
                f.ContentType.StartsWith("image/"),
                f.UploadedByUserId == userId || isLeader))
            .ToListAsync(ct);
    }

    public async Task<FileDto> UploadTaskFileAsync(Guid userId, Guid taskId, UploadedFile file, CancellationToken ct = default)
    {
        var task = await access.RequireTaskContributorAsync(userId, taskId, ct);
        var member = await access.RequireMemberAsync(userId, task.Project.GroupId, ct);

        var (validated, key) = await ValidateAndStoreAsync(task.Project.GroupId, file, FileValidationMode.Document, ct);
        var row = new StoredFile
        {
            Id = Guid.NewGuid(), Kind = FileKind.Task,
            GroupId = task.Project.GroupId, ProjectId = task.ProjectId, TaskId = taskId,
            UploadedByUserId = userId, OriginalName = validated.SafeName,
            Extension = validated.Extension, ContentType = validated.ContentType,
            SizeBytes = file.Length, StorageKey = key,
        };
        context.StoredFiles.Add(row);
        context.ActivityLogs.Add(Log(userId, task.Project.GroupId, task.ProjectId, "StoredFile", row.Id, "AddFile",
            $"Tải lên tệp '{row.OriginalName}' vào công việc '{task.Title}'"));
        try
        {
            await context.SaveChangesAsync(ct);
        }
        catch
        {
            await storage.DeleteAsync(key, ct);
            throw;
        }
        var uploaderName = await context.Users.Where(u => u.Id == userId).Select(u => u.DisplayName).FirstAsync(ct);
        return ToDto(row, uploaderName, userId, IsLeader(member));
    }

    // ─────────────── delete / download ───────────────

    public async Task DeleteFileAsync(Guid userId, Guid fileId, CancellationToken ct = default)
    {
        var file = await context.StoredFiles.FirstOrDefaultAsync(f => f.Id == fileId && f.DeletedAt == null, ct)
            ?? throw new NotFoundException("Không tìm thấy tệp này.");
        if (file.Kind == FileKind.Message)
            throw new BadRequestException("Hãy xóa tin nhắn để xóa tệp đính kèm.");
        if (file.Kind == FileKind.Avatar)
            throw new NotFoundException("Không tìm thấy tệp này.");

        GroupMember member;
        if (file.Kind == FileKind.Task && file.TaskId is Guid taskId)
        {
            var task = await access.RequireTaskDetailsAsync(userId, taskId, ct);
            member = await access.RequireMemberAsync(userId, task.Project.GroupId, ct);
        }
        else
        {
            await RequireLiveProjectAsync(file.ProjectId ?? Guid.Empty, ct);
            member = await access.RequireMemberAsync(userId, file.GroupId ?? Guid.Empty, ct);
        }
        if (file.UploadedByUserId != userId && !IsLeader(member))
            throw new ForbiddenException("Chỉ người tải lên hoặc Trưởng nhóm mới có thể xóa tệp này.");

        file.DeletedAt = DateTime.UtcNow;
        context.ActivityLogs.Add(Log(userId, member.GroupId, file.ProjectId, "StoredFile", file.Id, "DeleteFile",
            $"Xóa tệp '{file.OriginalName}'"));
        await context.SaveChangesAsync(ct);
        await storage.DeleteAsync(file.StorageKey, ct);
    }

    public async Task<FileDownload> OpenDownloadAsync(Guid userId, Guid fileId, CancellationToken ct = default)
    {
        var file = await context.StoredFiles.FirstOrDefaultAsync(f => f.Id == fileId && f.DeletedAt == null, ct)
            ?? throw new NotFoundException("Không tìm thấy tệp này.");

        switch (file.Kind)
        {
            case FileKind.Avatar:
                throw new NotFoundException("Không tìm thấy tệp này.");
            case FileKind.Project:
                await RequireLiveProjectAsync(file.ProjectId ?? Guid.Empty, ct);
                await access.RequireMemberAsync(userId, file.GroupId ?? Guid.Empty, ct);
                break;
            case FileKind.Task when file.TaskId is Guid taskId:
                await access.RequireTaskDetailsAsync(userId, taskId, ct);
                break;
            case FileKind.Message:
                await RequireLiveProjectAsync(file.ProjectId ?? Guid.Empty, ct);
                await access.RequireMemberAsync(userId, file.GroupId ?? Guid.Empty, ct);
                var alive = await context.ProjectMessages
                    .AnyAsync(m => m.Id == file.MessageId && m.DeletedAt == null, ct);
                if (!alive) throw new NotFoundException("Không tìm thấy tệp này.");
                break;
        }

        var stream = await storage.OpenReadAsync(file.StorageKey, ct);
        if (stream is null)
        {
            logger.LogWarning("Stored file {FileId} row exists but object {Key} is missing", file.Id, file.StorageKey);
            throw new NotFoundException("Không tìm thấy tệp này.");
        }
        return new FileDownload(stream, file.ContentType, file.OriginalName);
    }

    // ─────────────── avatar ───────────────

    public async Task<UserDto> SetAvatarAsync(Guid userId, UploadedFile file, CancellationToken ct = default)
    {
        var user = await context.Users.FirstOrDefaultAsync(u => u.Id == userId, ct)
            ?? throw new NotFoundException("Không tìm thấy người dùng này.");

        var (validated, key) = await ValidateAndStoreAsync(null, file, FileValidationMode.Avatar, ct);
        var row = new StoredFile
        {
            Id = Guid.NewGuid(), Kind = FileKind.Avatar,
            UploadedByUserId = userId, OriginalName = validated.SafeName,
            Extension = validated.Extension, ContentType = validated.ContentType,
            SizeBytes = file.Length, StorageKey = key,
        };
        var previousId = user.AvatarFileId;
        context.StoredFiles.Add(row);
        user.AvatarFileId = row.Id;
        user.AvatarUrl = $"/api/avatars/{row.Id}";
        user.UpdatedAt = DateTime.UtcNow;
        try
        {
            await context.SaveChangesAsync(ct);
        }
        catch
        {
            await storage.DeleteAsync(key, ct);
            throw;
        }
        await RetireManagedAvatarAsync(userId, previousId, ct);
        return new UserDto(user.Id, user.DisplayName, user.Email, user.AvatarUrl);
    }

    public async Task<UserDto> ClearAvatarAsync(Guid userId, CancellationToken ct = default)
    {
        var user = await context.Users.FirstOrDefaultAsync(u => u.Id == userId, ct)
            ?? throw new NotFoundException("Không tìm thấy người dùng này.");
        var previousId = user.AvatarFileId;
        if (previousId is null)
            return new UserDto(user.Id, user.DisplayName, user.Email, user.AvatarUrl);
        user.AvatarFileId = null;
        user.AvatarUrl = null;
        user.UpdatedAt = DateTime.UtcNow;
        await context.SaveChangesAsync(ct);
        await RetireManagedAvatarAsync(userId, previousId, ct);
        return new UserDto(user.Id, user.DisplayName, user.Email, user.AvatarUrl);
    }

    /// <summary>Anonymous avatar fetch: only a managed, live avatar file is served.</summary>
    public async Task<FileDownload> OpenAvatarAsync(Guid fileId, CancellationToken ct = default)
    {
        var file = await context.StoredFiles.FirstOrDefaultAsync(
            f => f.Id == fileId && f.Kind == FileKind.Avatar && f.DeletedAt == null, ct)
            ?? throw new NotFoundException("Không tìm thấy tệp này.");
        var referenced = await context.Users.AnyAsync(u => u.AvatarFileId == fileId, ct);
        if (!referenced) throw new NotFoundException("Không tìm thấy tệp này.");
        var stream = await storage.OpenReadAsync(file.StorageKey, ct);
        if (stream is null)
        {
            logger.LogWarning("Avatar file {FileId} row exists but object {Key} is missing", file.Id, file.StorageKey);
            throw new NotFoundException("Không tìm thấy tệp này.");
        }
        return new FileDownload(stream, file.ContentType, file.OriginalName);
    }

    /// <summary>Soft-deletes a replaced managed avatar row and removes its object after the save.</summary>
    internal async Task RetireManagedAvatarAsync(Guid userId, Guid? previousId, CancellationToken ct)
    {
        if (previousId is null) return;
        var old = await context.StoredFiles.FirstOrDefaultAsync(
            f => f.Id == previousId && f.Kind == FileKind.Avatar && f.DeletedAt == null, ct);
        if (old is null) return;
        old.DeletedAt = DateTime.UtcNow;
        await context.SaveChangesAsync(ct);
        await storage.DeleteAsync(old.StorageKey, ct);
    }

    // ─────────────── shared helpers ───────────────

    /// <summary>Validate → group quota → write. Returns the validated metadata and the storage key.</summary>
    internal async Task<(ValidatedFile Validated, string Key)> ValidateAndStoreAsync(
        Guid? groupId, UploadedFile file, FileValidationMode mode, CancellationToken ct)
    {
        var head = new byte[512];
        int headLen;
        await using (var headStream = file.OpenReadStream())
            headLen = await headStream.ReadAtLeastAsync(head, Math.Min(512, Math.Max(1, (int)Math.Min(file.Length, 512))), false, ct);
        var max = mode == FileValidationMode.Avatar ? _options.MaxAvatarBytes : _options.MaxFileBytes;
        var validated = FileValidator.Validate(file.FileName, file.Length, head.AsSpan(0, headLen), mode, max);

        if (groupId is Guid gid)
            await CheckQuotaAsync(gid, file.Length, ct);

        await using var stream = file.OpenReadStream();
        var key = await storage.SaveAsync(stream, max, ct);
        return (validated, key);
    }

    /// <summary>Group-quota check shared with message attachments.</summary>
    internal Task CheckQuotaAsync(Guid groupId, long additionalBytes, CancellationToken ct)
        => StorageQuota.CheckAsync(context, _options.GroupQuotaBytes, groupId, additionalBytes, ct);

    private static ActivityLog Log(Guid actor, Guid groupId, Guid? projectId, string entityType, Guid? entityId, string action, string summary)
        => new() { Id = Guid.NewGuid(), ActorUserId = actor, GroupId = groupId, ProjectId = projectId, EntityType = entityType, EntityId = entityId, Action = action, Summary = summary };
}
