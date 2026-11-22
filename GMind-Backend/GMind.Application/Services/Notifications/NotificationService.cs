using System.Text;
using GMind.Application.Common;
using GMind.Application.Common.Exceptions;
using GMind.Domain.Entities;
using GMind.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Task = System.Threading.Tasks.Task;

namespace GMind.Application.Services.Notifications;

public interface INotificationService
{
    Task NotifyAsync(Guid recipientUserId, Guid? groupId, NotificationType type, string title, string body,
        string? relatedEntityType = null, Guid? relatedEntityId = null, CancellationToken ct = default);
    Task<List<NotificationDto>> GetMyAsync(Guid userId, bool unreadOnly, int take, CancellationToken ct = default);
    Task<NotificationPageDto> GetPageAsync(Guid userId, bool unreadOnly, string? cursor, int take, CancellationToken ct = default);
    Task<int> GetUnreadCountAsync(Guid userId, CancellationToken ct = default);
    Task MarkReadAsync(Guid userId, Guid notificationId, CancellationToken ct = default);
    Task<int> MarkAllReadAsync(Guid userId, CancellationToken ct = default);
    Task<NotificationPreferenceDto> GetPreferencesAsync(Guid userId, CancellationToken ct = default);
    Task<NotificationPreferenceDto> UpdatePreferencesAsync(Guid userId, bool reminder3Days, bool reminder1Day,
        bool reminder3Hours, bool overdueAlert, CancellationToken ct = default);
}

public record NotificationDto(Guid Id, string Type, string Title, string Body, string? RelatedEntityType,
    Guid? RelatedEntityId, bool IsRead, DateTime CreatedAt, Guid? GroupId = null);

public record NotificationPageDto(List<NotificationDto> Items, string? NextCursor);

public record NotificationPreferenceDto(bool Reminder3Days, bool Reminder1Day, bool Reminder3Hours, bool OverdueAlert);

public class NotificationService : INotificationService
{
    private readonly IApplicationDbContext _context;

    public NotificationService(IApplicationDbContext context) => _context = context;

    private IQueryable<Notification> VisibleTo(Guid userId)
        => _context.Notifications.Where(n => n.RecipientUserId == userId && n.Recipient.IsActive
            && (n.GroupId == null || n.Type == NotificationType.MemberRemoved
                || n.Type == NotificationType.GroupArchived
                || _context.GroupMembers.Any(m => m.GroupId == n.GroupId && m.UserId == userId
                    && m.IsActive && m.User.IsActive && !m.Group.IsArchived)));

    public async Task NotifyAsync(Guid recipientUserId, Guid? groupId, NotificationType type, string title, string body,
        string? relatedEntityType = null, Guid? relatedEntityId = null, CancellationToken ct = default)
    {
        if (!await _context.Users.AnyAsync(u => u.Id == recipientUserId && u.IsActive, ct)) return;
        if (groupId != null && type != NotificationType.MemberRemoved && type != NotificationType.GroupArchived
            && !await _context.GroupMembers.AnyAsync(m => m.GroupId == groupId && m.UserId == recipientUserId
                && m.IsActive && !m.Group.IsArchived, ct)) return;
        _context.Notifications.Add(new Notification
        {
            Id = Guid.NewGuid(),
            RecipientUserId = recipientUserId,
            GroupId = groupId,
            Type = type,
            Title = title,
            Body = body,
            RelatedEntityType = relatedEntityType,
            RelatedEntityId = relatedEntityId
        });
        await _context.SaveChangesAsync(ct);
    }

    public async Task<List<NotificationDto>> GetMyAsync(Guid userId, bool unreadOnly, int take, CancellationToken ct = default)
    {
        var q = VisibleTo(userId);
        if (unreadOnly) q = q.Where(n => n.ReadAt == null);
        return await q.OrderByDescending(n => n.CreatedAt)
            .Take(Math.Clamp(take, 1, 100))
            .Select(n => new NotificationDto(n.Id, n.Type.ToString(), n.Title, n.Body,
                n.RelatedEntityType, n.RelatedEntityId, n.ReadAt != null, n.CreatedAt, n.GroupId))
            .ToListAsync(ct);
    }

    /// <summary>Stable cursor page: boundary timestamp + the ids sharing it, so new/updated rows can't shift the window.</summary>
    public async Task<NotificationPageDto> GetPageAsync(Guid userId, bool unreadOnly, string? cursor, int take, CancellationToken ct = default)
    {
        take = Math.Clamp(take, 1, 50);
        var q = VisibleTo(userId);
        if (unreadOnly) q = q.Where(n => n.ReadAt == null);

        if (!string.IsNullOrEmpty(cursor))
        {
            var (boundary, boundaryIds) = DecodeCursor(cursor);
            var boundaryUtc = DateTime.SpecifyKind(boundary, DateTimeKind.Utc);
            q = q.Where(n => n.CreatedAt < boundaryUtc || (n.CreatedAt == boundaryUtc && !boundaryIds.Contains(n.Id)));
        }

        var rows = await q.OrderByDescending(n => n.CreatedAt).ThenByDescending(n => n.Id)
            .Take(take + 1)
            .Select(n => new NotificationDto(n.Id, n.Type.ToString(), n.Title, n.Body,
                n.RelatedEntityType, n.RelatedEntityId, n.ReadAt != null, n.CreatedAt, n.GroupId))
            .ToListAsync(ct);

        string? next = null;
        if (rows.Count > take)
        {
            rows.RemoveAt(take);
            var boundary = rows[^1].CreatedAt;
            var ids = rows.Where(r => r.CreatedAt == boundary).Select(r => r.Id);
            next = EncodeCursor(boundary, ids);
        }
        return new NotificationPageDto(rows, next);
    }

    private static string EncodeCursor(DateTime boundary, IEnumerable<Guid> ids)
    {
        var raw = $"{boundary.Ticks}|{string.Join(',', ids)}";
        return Convert.ToBase64String(Encoding.UTF8.GetBytes(raw)).Replace('+', '-').Replace('/', '_').TrimEnd('=');
    }

    private static (DateTime Boundary, HashSet<Guid> Ids) DecodeCursor(string cursor)
    {
        try
        {
            var raw = Encoding.UTF8.GetString(Convert.FromBase64String(PadBase64(cursor)));
            var parts = raw.Split('|', 2);
            if (parts.Length != 2 || !long.TryParse(parts[0], out var ticks)) throw new FormatException();
            var boundary = new DateTime(ticks, DateTimeKind.Utc);
            var ids = parts[1].Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Select(s => Guid.Parse(s)).ToHashSet();
            return (boundary, ids);
        }
        catch
        {
            throw new BadRequestException("Con trỏ phân trang không hợp lệ.");
        }
    }

    private static string PadBase64(string base64Url)
    {
        var s = base64Url.Replace('-', '+').Replace('_', '/');
        return s.PadRight(s.Length + (4 - s.Length % 4) % 4, '=');
    }

    public async Task<int> GetUnreadCountAsync(Guid userId, CancellationToken ct = default)
        => await VisibleTo(userId).CountAsync(n => n.ReadAt == null, ct);

    public async Task MarkReadAsync(Guid userId, Guid notificationId, CancellationToken ct = default)
    {
        var n = await VisibleTo(userId).FirstOrDefaultAsync(x => x.Id == notificationId, ct)
            ?? throw new NotFoundException("Không tìm thấy thông báo này.");
        n.ReadAt ??= DateTime.UtcNow;
        await _context.SaveChangesAsync(ct);
    }

    public async Task<int> MarkAllReadAsync(Guid userId, CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;
        return await VisibleTo(userId)
            .Where(n => n.ReadAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(n => n.ReadAt, now), ct);
    }

    public async Task<NotificationPreferenceDto> GetPreferencesAsync(Guid userId, CancellationToken ct = default)
    {
        var p = await _context.NotificationPreferences.AsNoTracking()
            .FirstOrDefaultAsync(x => x.UserId == userId, ct);
        return p is null
            ? new NotificationPreferenceDto(true, true, true, true)
            : new NotificationPreferenceDto(p.Reminder3Days, p.Reminder1Day, p.Reminder3Hours, p.OverdueAlert);
    }

    public async Task<NotificationPreferenceDto> UpdatePreferencesAsync(Guid userId, bool reminder3Days, bool reminder1Day,
        bool reminder3Hours, bool overdueAlert, CancellationToken ct = default)
    {
        var p = await _context.NotificationPreferences.FirstOrDefaultAsync(x => x.UserId == userId, ct);
        if (p is null)
        {
            p = new NotificationPreference { Id = Guid.NewGuid(), UserId = userId };
            _context.NotificationPreferences.Add(p);
        }
        p.Reminder3Days = reminder3Days;
        p.Reminder1Day = reminder1Day;
        p.Reminder3Hours = reminder3Hours;
        p.OverdueAlert = overdueAlert;
        await _context.SaveChangesAsync(ct);
        return new NotificationPreferenceDto(p.Reminder3Days, p.Reminder1Day, p.Reminder3Hours, p.OverdueAlert);
    }
}
