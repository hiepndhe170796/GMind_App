using System.ComponentModel.DataAnnotations;

namespace GMind.API.Models.Auth;

public class RefreshTokenRequest
{
    [Required]
    public string RefreshToken { get; set; } = string.Empty;
}
