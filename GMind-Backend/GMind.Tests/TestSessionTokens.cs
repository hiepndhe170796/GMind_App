using GMind.Application.Services.Auth;
using GMind.Domain.Entities;
using GMind.Infrastructure.Persistence;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace GMind.Tests;

/// <summary>Mints a sid-carrying access token backed by a real UserSession row (M5 validator requires it).</summary>
public static class TestSessionTokens
{
    public static string Mint(IServiceProvider services, IConfiguration config, User user)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var now = DateTime.UtcNow;
        var session = new UserSession
        {
            Id = Guid.NewGuid(), UserId = user.Id,
            RefreshTokenHash = $"test-{Guid.NewGuid():N}",
            CreatedAt = now, LastSeenAt = now,
            ExpiresAt = now.AddDays(7), AbsoluteExpiresAt = now.AddDays(30)
        };
        db.UserSessions.Add(session);
        db.SaveChanges();
        return new TokenService(config).GenerateAccessToken(user, session.Id);
    }

    public static IConfiguration JwtConfig(string secret, string issuer = "GMindTests", string audience = "GMindTests")
        => new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:Secret"] = secret, ["Jwt:Issuer"] = issuer,
            ["Jwt:Audience"] = audience, ["Jwt:ExpiryMinutes"] = "60"
        }).Build();
}
