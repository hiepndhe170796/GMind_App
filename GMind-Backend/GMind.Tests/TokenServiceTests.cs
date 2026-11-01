using GMind.Application.Services.Auth;
using GMind.Domain.Entities;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace GMind.Tests;

public class TokenServiceTests
{
    private readonly TokenService _service;

    public TokenServiceTests()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Secret"] = "test-secret-key-minimum-32-chars-long!",
                ["Jwt:Issuer"] = "GMind",
                ["Jwt:Audience"] = "GMind",
                ["Jwt:ExpiryMinutes"] = "60"
            })
            .Build();
        _service = new TokenService(config);
    }

    [Fact]
    public void GenerateAccessToken_ContainsUserIdClaim()
    {
        var user = new User { Id = Guid.NewGuid(), Email = "a@b.c", DisplayName = "A", PasswordHash = "x" };
        var token = _service.GenerateAccessToken(user);
        Assert.False(string.IsNullOrEmpty(token));

        var id = _service.GetUserIdFromToken(token);
        Assert.Equal(user.Id, id);
    }

    [Fact]
    public void GetUserIdFromToken_InvalidToken_ReturnsNull()
        => Assert.Null(_service.GetUserIdFromToken("not.a.jwt"));

    [Fact]
    public void GenerateAccessToken_ContainsAuthVersionClaim()
    {
        var user = new User { Id = Guid.NewGuid(), Email = "a@b.c", DisplayName = "A", PasswordHash = "x", AuthVersion = 3 };
        var token = _service.GenerateAccessToken(user);
        var jwt = new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler().ReadJwtToken(token);
        Assert.Equal("3", jwt.Claims.First(c => c.Type == TokenService.AuthVersionClaim).Value);
    }

    [Fact]
    public void GenerateRefreshToken_UniqueAndRandom()
    {
        var t1 = _service.GenerateRefreshToken();
        var t2 = _service.GenerateRefreshToken();
        Assert.NotEqual(t1, t2);
        Assert.True(t1.Length > 40);
    }
}
