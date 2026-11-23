using GMind.Application.Common;
using GMind.Application.Common.Exceptions;
using GMind.Application.Services.Files;
using GMind.Application.Services.Notifications;
using GMind.Domain.Entities;
using GMind.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Task = System.Threading.Tasks.Task;

namespace GMind.Application.Services.Discussion;

public sealed class DiscussionService(
    IApplicationDbContext context,
    IResourceAccess access,
    INotificationService notifications,
    IFileStorage storage,
    IOptions<StorageOptions> storageOptions) : IDiscussionService
{
    private readonly StorageOptions _options = storageOptions.Value;

    private async Task<(Project Project, GroupMember Member)> RequireAccessAsync(Guid userId, Guid projectId, CancellationToken ct)
    {
        var project = await context.Projects
            .FirstOrDefaultAsync(p => p.Id == projectId && p.ArchivedAt == null, ct)
            ?? throw new NotFoundException("Không tìm thấy dự án này.");
        var member = await access.RequireMemberAsync(userId, project.GroupId, ct);
        return (project, member);
    }

    // ─────────────── list ───────────────

    public async Task<MessagePageDto> ListAsync(Guid userId, Guid projectId, string? cursor, int take, CancellationToken ct = default)
    {
        if (take is < 1 or > 50) throw new BadRequestException("Giá trị 'take' phải từ 1 đến 50.");
        var (_, member) = await RequireAccessAsync(userId, projectId, ct);

        var q = context.ProjectMessages.Where(m => m.ProjectId == projectId);
        if (!string.IsNullOrEmpty(cursor))
        {
            var (boundary, boundaryIds) = BoundaryCursor.Decode(cursor);
            var boundaryUtc = DateTime.SpecifyKind(boundary, DateTimeKind.Utc);
            q = q.Where(m => m.CreatedAt < boundaryUtc || (m.CreatedAt == boundaryUtc && !boundaryIds.Contains(m.Id)));
        }

        var rows = await q.OrderByDescending(m => m.CreatedAt).ThenByDescending(m => m.Id)
            .Take(take + 1).ToListAsync(ct);

        string? next = null;
        if (rows.Count > take)
        {
            rows.RemoveAt(take);
            var boundary = rows[^1].CreatedAt;
            next = BoundaryCursor.Encode(boundary, rows.Where(r => r.CreatedAt == boundary).Select(r => r.Id));
        }

        var items = await ToDtosAsync(rows, userId, member.Role == Role.Leader, ct);
        return new MessagePageDto(items, next);
    }

    /// <summary>Batched DTO projection: authors, reply targets, mentions and attachments in grouped queries.</summary>
    private async Task<List<MessageDto>> ToDtosAsync(List<ProjectMessage> rows, Guid userId, bool isLeader, CancellationToken ct)
    {
        if (rows.Count == 0) return [];
        var ids = rows.Select(m => m.Id).ToList();
        var authorIds = rows.Select(m => m.AuthorUserId).Distinct().ToList();
        var replyIds = rows.Where(m => m.ReplyToMessageId != null).Select(m => m.ReplyToMessageId!.Value).ToList();

        var authors = await context.Users.AsNoTracking()
            .Where(u => authorIds.Contains(u.Id))
            .Select(u => new { u.Id, u.DisplayName, u.AvatarUrl })
            .ToDictionaryAsync(u => u.Id, ct);

        var replies = replyIds.Count == 0 ? [] : await context.ProjectMessages.AsNoTracking()
            .Where(m => replyIds.Contains(m.Id))
            .Select(m => new { m.Id, m.Body, m.DeletedAt, m.Author.DisplayName })
            .ToDictionaryAsync(m => m.Id, ct);

        var mentions = await context.ProjectMessageMentions.AsNoTracking()
            .Where(mm => ids.Contains(mm.MessageId))
            .Select(mm => new { mm.MessageId, mm.UserId, mm.User.DisplayName })
            .ToListAsync(ct);
        var mentionsByMsg = mentions.GroupBy(m => m.MessageId)
            .ToDictionary(g => g.Key, g => g.Select(m => new MentionDto(m.UserId, m.DisplayName)).ToList());

        var files = await context.StoredFiles.AsNoTracking()
            .Where(f => f.Kind == FileKind.Message && f.DeletedAt == null && f.MessageId != null && ids.Contains(f.MessageId.Value))
            .OrderBy(f => f.CreatedAt)
            .Select(f => new { f.MessageId, f.Id, f.ProjectId, f.TaskId, f.OriginalName, f.Extension,
                f.ContentType, f.SizeBytes, f.UploadedByUserId, f.CreatedAt, UploaderName = f.UploadedBy.DisplayName })
            .ToListAsync(ct);
        var filesByMsg = files.GroupBy(f => f.MessageId!.Value)
            .ToDictionary(g => g.Key, g => g.Select(f => new FileDto(f.Id, "message", f.ProjectId, f.TaskId,
                g.Key, f.OriginalName, f.Extension, f.ContentType, f.SizeBytes, f.UploadedByUserId,
                f.UploaderName, f.CreatedAt, f.ContentType.StartsWith("image/"), false)).ToList());

        return rows.Select(m =>
        {
            var deleted = m.DeletedAt != null;
            authors.TryGetValue(m.AuthorUserId, out var author);
            MessageReplyDto? reply = null;
            if (m.ReplyToMessageId is Guid rid && replies.TryGetValue(rid, out var r))
                reply = new MessageReplyDto(r.Id, r.DisplayName,
                    r.DeletedAt != null ? null : r.Body[..Math.Min(120, r.Body.Length)], r.DeletedAt != null);
            return new MessageDto(m.Id, m.ProjectId, m.AuthorUserId,
                author?.DisplayName ?? "", author?.AvatarUrl,
                deleted ? null : m.Body, m.CreatedAt, m.UpdatedAt, deleted,
                deleted ? null : reply,
                deleted ? [] : mentionsByMsg.GetValueOrDefault(m.Id, []),
                deleted ? [] : filesByMsg.GetValueOrDefault(m.Id, []),
                m.AuthorUserId == userId,
                !deleted && m.AuthorUserId == userId,
                !deleted && (m.AuthorUserId == userId || isLeader));
        }).ToList();
    }

    // ─────────────── send ───────────────

    public async Task<MessageDto> SendAsync(Guid userId, Guid projectId, string? body, Guid? replyToMessageId,
        IReadOnlyList<Guid> mentionUserIds, IReadOnlyList<UploadedFile> files, CancellationToken ct = default)
    {
        var (project, member) = await RequireAccessAsync(userId, projectId, ct);

        var text = body?.Trim() ?? string.Empty;
        if (text.Length > 4000) throw new BadRequestException("Tin nhắn tối đa 4000 ký tự.");
        if (files.Count > _options.MaxAttachmentsPerMessage)
            throw new BadRequestException($"Mỗi tin nhắn đính kèm tối đa {_options.MaxAttachmentsPerMessage} tệp.");
        if (text.Length == 0 && files.Count == 0)
            throw new BadRequestException("Hãy nhập nội dung hoặc đính kèm tệp.");

        ProjectMessage? replyTarget = null;
        if (replyToMessageId is Guid rid)
        {
            replyTarget = await context.ProjectMessages
                .FirstOrDefaultAsync(m => m.Id == rid && m.ProjectId == projectId, ct)
                ?? throw new BadRequestException("Không tìm thấy tin nhắn được trả lời.");
            if (replyTarget.DeletedAt != null)
                throw new BadRequestException("Không thể trả lời tin nhắn đã bị xóa.");
        }

        var mentionIds = await ValidateMentionsAsync(mentionUserIds, userId, project.GroupId, ct);

        // Validate every file first, then check the group quota against the total new bytes.
        var validated = new List<(UploadedFile File, ValidatedFile Meta)>();
        foreach (var f in files)
        {
            var head = new byte[512];
            int headLen;
            await using (var s = f.OpenReadStream())
                headLen = await s.ReadAtLeastAsync(head, Math.Min(512, Math.Max(1, (int)Math.Min(f.Length, 512))), false, ct);
            validated.Add((f, FileValidator.Validate(f.FileName, f.Length, head.AsSpan(0, headLen),
                FileValidationMode.Document, _options.MaxFileBytes)));
        }
        if (validated.Count > 0)
            await StorageQuota.CheckAsync(context, _options.GroupQuotaBytes, project.GroupId,
                validated.Sum(v => v.File.Length), ct);

        var keys = new List<string>();
        try
        {
            foreach (var (f, _) in validated)
            {
                await using var stream = f.OpenReadStream();
                keys.Add(await storage.SaveAsync(stream, _options.MaxFileBytes, ct));
            }
        }
        catch
        {
            foreach (var k in keys) await storage.DeleteAsync(k, ct);
            throw;
        }

        var message = new ProjectMessage
        {
            Id = Guid.NewGuid(), ProjectId = projectId, AuthorUserId = userId,
            Body = text, ReplyToMessageId = replyTarget?.Id,
        };
        context.ProjectMessages.Add(message);
        foreach (var uid in mentionIds)
            context.ProjectMessageMentions.Add(new ProjectMessageMention { MessageId = message.Id, UserId = uid });
        for (var i = 0; i < validated.Count; i++)
        {
            var (f, meta) = validated[i];
            context.StoredFiles.Add(new StoredFile
            {
                Id = Guid.NewGuid(), Kind = FileKind.Message,
                GroupId = project.GroupId, ProjectId = projectId, MessageId = message.Id,
                UploadedByUserId = userId, OriginalName = meta.SafeName,
                Extension = meta.Extension, ContentType = meta.ContentType,
                SizeBytes = f.Length, StorageKey = keys[i],
            });
        }
        try
        {
            await context.SaveChangesAsync(ct);
        }
        catch
        {
            foreach (var k in keys) await storage.DeleteAsync(k, ct);
            throw;
        }

        // Notifications: mentioned users and the replied-to author (once, never the sender).
        var authorName = await context.Users.Where(u => u.Id == userId).Select(u => u.DisplayName).FirstAsync(ct);
        var excerpt = text.Length > 0 ? text[..Math.Min(120, text.Length)] : "[Tệp đính kèm]";
        foreach (var uid in mentionIds)
            await notifications.NotifyAsync(uid, project.GroupId, NotificationType.MentionedInDiscussion,
                "Bạn được nhắc trong thảo luận", $"{authorName} trong '{project.Name}': {excerpt}",
                "Project", projectId, ct);
        if (replyTarget is not null && replyTarget.AuthorUserId != userId && !mentionIds.Contains(replyTarget.AuthorUserId)
            && await context.GroupMembers.AnyAsync(m => m.GroupId == project.GroupId && m.UserId == replyTarget.AuthorUserId
                && m.IsActive && m.User.IsActive, ct))
            await notifications.NotifyAsync(replyTarget.AuthorUserId, project.GroupId, NotificationType.DiscussionReply,
                "Có người trả lời bạn", $"{authorName} trả lời bạn trong '{project.Name}': {excerpt}",
                "Project", projectId, ct);

        var dto = await ToDtosAsync([message], userId, member.Role == Role.Leader, ct);
        return dto[0];
    }

    // ─────────────── edit / delete ───────────────

    public async Task<MessageDto> UpdateAsync(Guid userId, Guid messageId, string body,
        IReadOnlyList<Guid> mentionUserIds, CancellationToken ct = default)
    {
        var message = await context.ProjectMessages
            .FirstOrDefaultAsync(m => m.Id == messageId && m.DeletedAt == null, ct)
            ?? throw new NotFoundException("Không tìm thấy tin nhắn này.");
        var (project, member) = await RequireAccessAsync(userId, message.ProjectId, ct);
        if (message.AuthorUserId != userId)
            throw new ForbiddenException("Chỉ tác giả mới có thể sửa tin nhắn này.");

        var text = body?.Trim() ?? string.Empty;
        if (text.Length > 4000) throw new BadRequestException("Tin nhắn tối đa 4000 ký tự.");
        if (text.Length == 0 && !await context.StoredFiles
                .AnyAsync(f => f.Kind == FileKind.Message && f.MessageId == messageId && f.DeletedAt == null, ct))
            throw new BadRequestException("Hãy nhập nội dung hoặc đính kèm tệp.");

        var mentionIds = await ValidateMentionsAsync(mentionUserIds, userId, project.GroupId, ct);
        var existing = await context.ProjectMessageMentions
            .Where(m => m.MessageId == messageId).ToListAsync(ct);
        var previous = existing.Select(m => m.UserId).ToHashSet();
        context.ProjectMessageMentions.RemoveRange(existing);
        foreach (var uid in mentionIds)
            context.ProjectMessageMentions.Add(new ProjectMessageMention { MessageId = messageId, UserId = uid });

        message.Body = text;
        message.UpdatedAt = DateTime.UtcNow;
        await context.SaveChangesAsync(ct);

        var authorName = await context.Users.Where(u => u.Id == userId).Select(u => u.DisplayName).FirstAsync(ct);
        var excerpt = text.Length > 0 ? text[..Math.Min(120, text.Length)] : "[Tệp đính kèm]";
        foreach (var uid in mentionIds.Where(u => !previous.Contains(u)))
            await notifications.NotifyAsync(uid, project.GroupId, NotificationType.MentionedInDiscussion,
                "Bạn được nhắc trong thảo luận", $"{authorName} trong '{project.Name}': {excerpt}",
                "Project", project.Id, ct);

        var dto = await ToDtosAsync([message], userId, member.Role == Role.Leader, ct);
        return dto[0];
    }

    public async Task DeleteAsync(Guid userId, Guid messageId, CancellationToken ct = default)
    {
        var message = await context.ProjectMessages
            .FirstOrDefaultAsync(m => m.Id == messageId && m.DeletedAt == null, ct)
            ?? throw new NotFoundException("Không tìm thấy tin nhắn này.");
        var (project, member) = await RequireAccessAsync(userId, message.ProjectId, ct);
        var isLeader = member.Role == Role.Leader;
        if (message.AuthorUserId != userId && !isLeader)
            throw new ForbiddenException("Chỉ tác giả hoặc Trưởng nhóm mới có thể xóa tin nhắn này.");

        var attachments = await context.StoredFiles
            .Where(f => f.Kind == FileKind.Message && f.MessageId == messageId && f.DeletedAt == null)
            .ToListAsync(ct);
        var mentions = await context.ProjectMessageMentions
            .Where(m => m.MessageId == messageId).ToListAsync(ct);

        var now = DateTime.UtcNow;
        message.DeletedAt = now;
        message.DeletedByUserId = userId;
        message.Body = string.Empty;
        context.ProjectMessageMentions.RemoveRange(mentions);
        foreach (var f in attachments) f.DeletedAt = now;

        if (message.AuthorUserId != userId)
        {
            var authorName = await context.Users.Where(u => u.Id == message.AuthorUserId)
                .Select(u => u.DisplayName).FirstAsync(ct);
            context.ActivityLogs.Add(new ActivityLog
            {
                Id = Guid.NewGuid(), ActorUserId = userId, GroupId = project.GroupId,
                ProjectId = project.Id, EntityType = "ProjectMessage", EntityId = message.Id,
                Action = "DeleteMessage",
                Summary = $"Xóa tin nhắn của {authorName} trong thảo luận dự án '{project.Name}'",
            });
        }
        await context.SaveChangesAsync(ct);
        foreach (var f in attachments) await storage.DeleteAsync(f.StorageKey, ct);
    }

    private async Task<List<Guid>> ValidateMentionsAsync(IReadOnlyList<Guid> mentionUserIds, Guid senderId, Guid groupId, CancellationToken ct)
    {
        var ids = mentionUserIds.Where(id => id != senderId).Distinct().ToList();
        if (ids.Count == 0) return ids;
        var valid = await context.GroupMembers
            .Where(m => m.GroupId == groupId && ids.Contains(m.UserId) && m.IsActive && m.User.IsActive)
            .Select(m => m.UserId).ToListAsync(ct);
        if (valid.Count != ids.Count)
            throw new BadRequestException("Người được nhắc không còn trong nhóm.");
        return ids;
    }
}
