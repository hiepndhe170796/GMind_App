using System.ComponentModel.DataAnnotations;

namespace GMind.API.Models.Auth;

public class ForgotPasswordRequest
{
    [Required]
    [EmailAddress]
    public string Email { get; set; } = string.Empty;
}
