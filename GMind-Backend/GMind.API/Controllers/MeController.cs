using System.ComponentModel.DataAnnotations;
using GMind.API.Common;
using GMind.Application.Services.Auth;
using GMind.Application.Services.Notifications;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace GMind.API.Controllers;

[ApiController]
[Route("api/me")]
[Authorize]
public class MeController : ControllerBase
{
    private readonly IAuthService _authService;
    private readonly INotificationService _notifications;

    public MeController(IAuthService authService, INotificationService notifications)
    {
        _authService = authService;
        _notifications = notifications;
    }

    /// <summary>Lấy hồ sơ người dùng hiện tại.</summary>
    [HttpGet]
    public async Task<IActionResult> GetProfile(CancellationToken ct)
    {
        var user = await _authService.GetProfileAsync(User.GetUserId(), ct);
        return Ok(user);
    }

    /// <summary>Cập nhật hồ sơ (tên hiển thị, avatar).</summary>
    [HttpPatch]
    public async Task<IActionResult> UpdateProfile([FromBody] UpdateProfileRequest request, CancellationToken ct)
    {
        var user = await _authService.UpdateProfileAsync(User.GetUserId(), request.DisplayName, request.AvatarUrl, ct);
        return Ok(user);
    }

    /// <summary>Đổi mật khẩu.</summary>
    [HttpPatch("password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request, CancellationToken ct)
    {
        await _authService.ChangePasswordAsync(User.GetUserId(), request.CurrentPassword, request.NewPassword, ct);
        return Ok(new { message = "Password changed" });
    }

    /// <summary>Danh sách phiên đăng nhập đang hoạt động (phiên hiện tại lên đầu).</summary>
    [HttpGet("sessions")]
    public async Task<IActionResult> ListSessions(CancellationToken ct)
        => Ok(await _authService.GetSessionsAsync(User.GetUserId(), User.GetSessionId(), ct));

    /// <summary>Đăng xuất một phiên cụ thể; thu hồi phiên hiện tại = đăng xuất.</summary>
    [HttpDelete("sessions/{id:guid}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> RevokeSession(Guid id, CancellationToken ct)
    {
        await _authService.RevokeSessionAsync(User.GetUserId(), id, ct);
        return Ok(new { message = "Session revoked" });
    }

    /// <summary>Đăng xuất mọi phiên khác.</summary>
    [HttpPost("sessions/revoke-others")]
    public async Task<IActionResult> RevokeOtherSessions(CancellationToken ct)
        => Ok(new { revoked = await _authService.RevokeOtherSessionsAsync(User.GetUserId(), User.GetSessionId(), ct) });

    /// <summary>Tùy chọn nhắc hạn (4 mốc; mặc định bật tất cả).</summary>
    [HttpGet("notification-preferences")]
    public async Task<IActionResult> GetNotificationPreferences(CancellationToken ct)
        => Ok(await _notifications.GetPreferencesAsync(User.GetUserId(), ct));

    [HttpPut("notification-preferences")]
    public async Task<IActionResult> UpdateNotificationPreferences([FromBody] NotificationPreferencesRequest request, CancellationToken ct)
        => Ok(await _notifications.UpdatePreferencesAsync(User.GetUserId(),
            request.Reminder3Days, request.Reminder1Day, request.Reminder3Hours, request.OverdueAlert, ct));

    /// <summary>Bắt đầu đổi email: gửi thư xác minh tới địa chỉ mới.</summary>
    [EnableRateLimiting("auth-recovery")]
    [HttpPost("email-change")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> RequestEmailChange([FromBody] EmailChangeRequest request, CancellationToken ct)
        => Ok(await _authService.RequestEmailChangeAsync(User.GetUserId(), request.NewEmail, request.CurrentPassword, ct));

    /// <summary>Yêu cầu đổi email đang chờ xác minh (hoặc null).</summary>
    [HttpGet("email-change")]
    public async Task<IActionResult> GetPendingEmailChange(CancellationToken ct)
        => Ok(await _authService.GetPendingEmailChangeAsync(User.GetUserId(), ct));

    /// <summary>Hủy yêu cầu đổi email đang chờ (idempotent).</summary>
    [HttpDelete("email-change")]
    public async Task<IActionResult> CancelEmailChange(CancellationToken ct)
    {
        await _authService.CancelEmailChangeAsync(User.GetUserId(), ct);
        return Ok(new { message = "Cancelled" });
    }
}

public class UpdateProfileRequest : IValidatableObject
{
    [Required(ErrorMessage = "Vui lòng nhập tên hiển thị.")]
    [MaxLength(100, ErrorMessage = "Tên hiển thị tối đa 100 ký tự.")]
    public string DisplayName { get; set; } = string.Empty;

    [MaxLength(500, ErrorMessage = "Đường dẫn ảnh đại diện tối đa 500 ký tự.")]
    public string? AvatarUrl { get; set; }

    public IEnumerable<ValidationResult> Validate(ValidationContext _)
    {
        if (AvatarUrl is null) yield break;
        if (string.IsNullOrWhiteSpace(AvatarUrl) || !Uri.TryCreate(AvatarUrl, UriKind.Absolute, out var uri)
            || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
            || string.IsNullOrWhiteSpace(uri.Host) || !string.IsNullOrEmpty(uri.UserInfo)
            || AvatarUrl.Any(char.IsControl))
            yield return new ValidationResult("Đường dẫn ảnh đại diện phải là liên kết http(s) hợp lệ.", new[] { nameof(AvatarUrl) });
    }
}

public class ChangePasswordRequest
{
    [Required(ErrorMessage = "Vui lòng nhập mật khẩu hiện tại.")]
    public string CurrentPassword { get; set; } = string.Empty;

    [Required(ErrorMessage = "Vui lòng nhập mật khẩu mới.")]
    [MinLength(8, ErrorMessage = "Mật khẩu phải có ít nhất 8 ký tự.")]
    public string NewPassword { get; set; } = string.Empty;

    [Required(ErrorMessage = "Vui lòng xác nhận mật khẩu.")]
    [Compare(nameof(NewPassword), ErrorMessage = "Mật khẩu xác nhận không khớp.")]
    public string ConfirmPassword { get; set; } = string.Empty;
}

public class NotificationPreferencesRequest
{
    public bool Reminder3Days { get; set; } = true;
    public bool Reminder1Day { get; set; } = true;
    public bool Reminder3Hours { get; set; } = true;
    public bool OverdueAlert { get; set; } = true;
}

public class EmailChangeRequest
{
    [Required(ErrorMessage = "Vui lòng nhập email mới.")]
    [EmailAddress(ErrorMessage = "Email mới không hợp lệ.")]
    [MaxLength(256)]
    public string NewEmail { get; set; } = string.Empty;

    [Required(ErrorMessage = "Vui lòng nhập mật khẩu hiện tại.")]
    public string CurrentPassword { get; set; } = string.Empty;
}
