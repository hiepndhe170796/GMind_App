namespace GMind.Application.Services.Auth;

public interface IPasswordResetDelivery
{
    bool IsAvailable { get; }
    System.Threading.Tasks.Task SendAsync(string email, string token, DateTime expiresAtUtc, CancellationToken ct = default);
}
