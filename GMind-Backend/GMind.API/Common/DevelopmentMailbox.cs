using System.Text.Json;
using GMind.Application.Common;

namespace GMind.API.Common;

/// <summary>Development-only IEmailSender: writes {id}.html + {id}.json atomically into Auth:LocalMailboxPath.</summary>
public sealed class DevelopmentMailbox : IEmailSender
{
    private readonly IHostEnvironment _environment;
    private readonly IConfiguration _configuration;

    public DevelopmentMailbox(IHostEnvironment environment, IConfiguration configuration)
    {
        _environment = environment;
        _configuration = configuration;
    }

    public bool IsAvailable => _environment.IsDevelopment();

    public static string MailboxPath(IConfiguration configuration)
        => configuration["Auth:LocalMailboxPath"]
            ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "GMind", "Mailbox");

    public async Task SendAsync(EmailMessage message, CancellationToken ct = default)
    {
        if (!IsAvailable)
            throw new InvalidOperationException("Email delivery is only available in Development");

        var mailboxPath = MailboxPath(_configuration);
        Directory.CreateDirectory(mailboxPath);

        var id = Guid.NewGuid().ToString("N");
        var json = JsonSerializer.Serialize(new
        {
            id,
            to = message.To,
            subject = message.Subject,
            createdAt = DateTime.UtcNow,
            links = message.Links.Select(l => new { label = l.Label, url = l.Url })
        });

        await WriteAtomicAsync(Path.Combine(mailboxPath, $"{id}.html"), message.HtmlBody, ct);
        await WriteAtomicAsync(Path.Combine(mailboxPath, $"{id}.json"), json, ct);
    }

    private static async Task WriteAtomicAsync(string finalPath, string contents, CancellationToken ct)
    {
        var tmpPath = finalPath + ".tmp";
        try
        {
            await File.WriteAllTextAsync(tmpPath, contents, ct);
            File.Move(tmpPath, finalPath);
        }
        catch
        {
            if (File.Exists(tmpPath)) File.Delete(tmpPath);
            throw;
        }
    }
}
