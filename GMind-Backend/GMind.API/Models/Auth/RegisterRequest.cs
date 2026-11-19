using System.ComponentModel.DataAnnotations;

namespace GMind.API.Models.Auth;

public class RegisterRequest
{
    [Required(ErrorMessage = "Vui lòng nhập tên hiển thị.")]
    [MaxLength(100, ErrorMessage = "Tên hiển thị tối đa 100 ký tự.")]
    public string DisplayName { get; set; } = string.Empty;

    [Required(ErrorMessage = "Vui lòng nhập email.")]
    [EmailAddress(ErrorMessage = "Email không hợp lệ.")]
    [MaxLength(256, ErrorMessage = "Email tối đa 256 ký tự.")]
    public string Email { get; set; } = string.Empty;

    [Required(ErrorMessage = "Vui lòng nhập mật khẩu.")]
    [MinLength(8, ErrorMessage = "Mật khẩu phải có ít nhất 8 ký tự.")]
    public string Password { get; set; } = string.Empty;

    [Required(ErrorMessage = "Vui lòng xác nhận mật khẩu.")]
    [Compare(nameof(Password), ErrorMessage = "Mật khẩu xác nhận không khớp.")]
    public string ConfirmPassword { get; set; } = string.Empty;
}
