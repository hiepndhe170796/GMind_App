using System.Net;
using GMind.Application.Services.Auth;

namespace GMind.API.Common;

public sealed class DevelopmentPasswordResetDelivery : IPasswordResetDelivery
{
    private readonly IHostEnvironment _environment;
    private readonly IConfiguration _configuration;

    public DevelopmentPasswordResetDelivery(IHostEnvironment environment, IConfiguration configuration)
    {
        _environment = environment;
        _configuration = configuration;
    }

    public bool IsAvailable => _environment.IsDevelopment();

    public async Task SendAsync(string email, string token, DateTime expiresAtUtc, CancellationToken ct = default)
    {
        if (!IsAvailable)
            throw new InvalidOperationException("Password reset delivery is only available in Development");

        var frontendBase = _configuration["Auth:FrontendUrl"] ?? "http://localhost:5173";
        if (!Uri.TryCreate(frontendBase, UriKind.Absolute, out var baseUri)
            || (baseUri.Scheme != Uri.UriSchemeHttp && baseUri.Scheme != Uri.UriSchemeHttps))
            throw new InvalidOperationException("Auth:FrontendUrl must be an absolute http/https URI");

        var resetLink = new Uri(baseUri, "/reset-password").AbsoluteUri + "#token=" + Uri.EscapeDataString(token);

        var mailboxPath = _configuration["Auth:LocalMailboxPath"]
            ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "GMind", "Mailbox");
        Directory.CreateDirectory(mailboxPath);

        var html = string.Concat(
            "<!DOCTYPE html>\n<html lang=\"vi\">\n",
            "<head><meta charset=\"utf-8\"><meta name=\"referrer\" content=\"no-referrer\"><title>GMind — Đặt lại mật khẩu</title></head>\n",
            "<body style=\"font-family:'Segoe UI',Arial,sans-serif;background:#f5f7fb;padding:24px\">\n",
            "  <div style=\"max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e7ecf4;border-radius:16px;padding:32px\">\n",
            "    <h1 style=\"font-size:22px;margin:0 0 8px\">GMind</h1>\n",
            "    <h2 style=\"font-size:18px;margin:0 0 16px\">Đặt lại mật khẩu</h2>\n",
            $"    <p>Xin chào {WebUtility.HtmlEncode(email)},</p>\n",
            "    <p>Bạn vừa yêu cầu đặt lại mật khẩu GMind. Nhấn liên kết dưới đây để đặt mật khẩu mới:</p>\n",
            $"    <p><a href=\"{WebUtility.HtmlEncode(resetLink)}\">Đặt lại mật khẩu</a></p>\n",
            $"    <p>Liên kết hết hạn lúc {expiresAtUtc:yyyy-MM-dd HH:mm} UTC.</p>\n",
            "    <p>Nếu bạn không yêu cầu thay đổi này, hãy bỏ qua thư.</p>\n",
            "  </div>\n</body>\n</html>\n");

        var tmpPath = Path.Combine(mailboxPath, $"{Guid.NewGuid():N}.tmp");
        var finalPath = Path.ChangeExtension(tmpPath, ".html");
        try
        {
            await File.WriteAllTextAsync(tmpPath, html, ct);
            File.Move(tmpPath, finalPath);
        }
        catch
        {
            if (File.Exists(tmpPath)) File.Delete(tmpPath);
            throw;
        }
    }
}
