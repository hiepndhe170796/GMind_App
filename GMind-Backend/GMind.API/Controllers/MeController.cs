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

public class UpdateProfileRequest : IValidatableObject
{
    [Required]
    [MaxLength(100)]
    public string DisplayName { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? AvatarUrl { get; set; }

    public IEnumerable<ValidationResult> Validate(ValidationContext _)
    {
        if (AvatarUrl is null) yield break;
        if (string.IsNullOrWhiteSpace(AvatarUrl) || !Uri.TryCreate(AvatarUrl, UriKind.Absolute, out var uri)
            || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
            || string.IsNullOrWhiteSpace(uri.Host) || !string.IsNullOrEmpty(uri.UserInfo)
            || AvatarUrl.Any(char.IsControl))
            yield return new ValidationResult("Avatar URL must be a valid http(s) URL", new[] { nameof(AvatarUrl) });
    }
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
