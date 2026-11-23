using System.ComponentModel.DataAnnotations;

namespace GMind.API.Models.Auth;

public class ForgotPasswordRequest
{
    [Required(ErrorMessage = "Vui lòng nhập email.")]
    [EmailAddress(ErrorMessage = "Email không hợp lệ.")]
    public string Email { get; set; } = string.Empty;
}
