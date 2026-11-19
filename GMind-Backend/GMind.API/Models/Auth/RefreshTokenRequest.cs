using System.ComponentModel.DataAnnotations;

namespace GMind.API.Models.Auth;

public class RefreshTokenRequest
{
    [Required(ErrorMessage = "Thiếu mã làm mới phiên.")]
    public string RefreshToken { get; set; } = string.Empty;
}
