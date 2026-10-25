using System.ComponentModel.DataAnnotations;
using GMind.API.Common;
using GMind.Application.Services.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GMind.API.Controllers;

[ApiController]
[Route("api/me")]
[Authorize]
public class MeController : ControllerBase
{
    private readonly IAuthService _authService;

    public MeController(IAuthService authService)
    {
        _authService = authService;
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
}

public class UpdateProfileRequest
{
    [Required]
    [MaxLength(100)]
    public string DisplayName { get; set; } = string.Empty;

    [MaxLength(500)]
    [Url]
    public string? AvatarUrl { get; set; }
}

public class ChangePasswordRequest
{
    [Required]
    public string CurrentPassword { get; set; } = string.Empty;

    [Required]
    [MinLength(8)]
    public string NewPassword { get; set; } = string.Empty;

    [Required]
    [Compare(nameof(NewPassword))]
    public string ConfirmPassword { get; set; } = string.Empty;
}
