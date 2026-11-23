namespace GMind.Application.Common;

public sealed record EmailLink(string Label, string Url);

public sealed record EmailMessage(string To, string Subject, string HtmlBody, IReadOnlyList<EmailLink> Links);

/// <summary>Outbound email. In Development this is the local mailbox; unavailable elsewhere until a provider is configured.</summary>
public interface IEmailSender
{
    bool IsAvailable { get; }
    Task SendAsync(EmailMessage message, CancellationToken ct = default);
}
