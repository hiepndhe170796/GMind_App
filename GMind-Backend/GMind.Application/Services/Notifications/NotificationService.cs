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
    Task<int> GetUnreadCountAsync(Guid userId, CancellationToken ct = default);
    Task MarkReadAsync(Guid userId, Guid notificationId, CancellationToken ct = default);
    Task<int> MarkAllReadAsync(Guid userId, CancellationToken ct = default);
}

public record NotificationDto(Guid Id, string Type, string Title, string Body, string? RelatedEntityType,
    Guid? RelatedEntityId, bool IsRead, DateTime CreatedAt);

public class NotificationService : INotificationService
{
    private readonly IApplicationDbContext _context;

    public NotificationService(IApplicationDbContext context) => _context = context;

    private IQueryable<Notification> VisibleTo(Guid userId)
        => _context.Notifications.Where(n => n.RecipientUserId == userId && n.Recipient.IsActive
            && (n.GroupId == null || n.Type == NotificationType.MemberRemoved
                || _context.GroupMembers.Any(m => m.GroupId == n.GroupId && m.UserId == userId
                    && m.IsActive && m.User.IsActive && !m.Group.IsArchived)));

    public async Task NotifyAsync(Guid recipientUserId, Guid? groupId, NotificationType type, string title, string body,
        string? relatedEntityType = null, Guid? relatedEntityId = null, CancellationToken ct = default)
    {
        if (!await _context.Users.AnyAsync(u => u.Id == recipientUserId && u.IsActive, ct)) return;
        if (groupId != null && type != NotificationType.MemberRemoved
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
                n.RelatedEntityType, n.RelatedEntityId, n.ReadAt != null, n.CreatedAt))
            .ToListAsync(ct);
    }

    public async Task<int> GetUnreadCountAsync(Guid userId, CancellationToken ct = default)
        => await VisibleTo(userId).CountAsync(n => n.ReadAt == null, ct);

    public async Task MarkReadAsync(Guid userId, Guid notificationId, CancellationToken ct = default)
    {
        var n = await VisibleTo(userId).FirstOrDefaultAsync(x => x.Id == notificationId, ct)
            ?? throw new NotFoundException("Notification not found");
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
}
