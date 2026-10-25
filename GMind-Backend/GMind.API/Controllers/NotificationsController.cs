using GMind.API.Common;
using GMind.Application.Services.Notifications;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GMind.API.Controllers;

[ApiController]
[Route("api/notifications")]
[Authorize]
public class NotificationsController : ControllerBase
{
    private readonly INotificationService _notifications;

    public NotificationsController(INotificationService notifications) => _notifications = notifications;

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] bool unreadOnly = false, [FromQuery] int take = 50, CancellationToken ct = default)
        => Ok(await _notifications.GetMyAsync(User.GetUserId(), unreadOnly, take, ct));

    [HttpGet("unread-count")]
    public async Task<IActionResult> UnreadCount(CancellationToken ct)
        => Ok(new { count = await _notifications.GetUnreadCountAsync(User.GetUserId(), ct) });

    [HttpPost("{id:guid}/read")]
    public async Task<IActionResult> MarkRead(Guid id, CancellationToken ct)
    {
        await _notifications.MarkReadAsync(User.GetUserId(), id, ct);
        return Ok(new { message = "Marked as read" });
    }

    [HttpPost("read-all")]
    public async Task<IActionResult> MarkAllRead(CancellationToken ct)
        => Ok(new { count = await _notifications.MarkAllReadAsync(User.GetUserId(), ct) });
}
