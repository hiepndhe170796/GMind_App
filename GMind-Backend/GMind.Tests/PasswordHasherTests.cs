using GMind.Application.Services.Auth;
using Xunit;

namespace GMind.Tests;

public class PasswordHasherTests
{
    private readonly PasswordHasher _hasher = new();

    [Fact]
    public void HashPassword_ProducesVerifiableHash()
    {
        var hash = _hasher.HashPassword("Password123!");
        Assert.NotEqual("Password123!", hash);
        Assert.True(_hasher.VerifyPassword("Password123!", hash));
    }

    [Fact]
    public void VerifyPassword_WrongPassword_ReturnsFalse()
    {
        var hash = _hasher.HashPassword("Password123!");
        Assert.False(_hasher.VerifyPassword("WrongPassword!", hash));
    }

    [Fact]
    public void VerifyPassword_InvalidHash_ReturnsFalse()
        => Assert.False(_hasher.VerifyPassword("any", "not-a-bcrypt-hash"));

    [Fact]
    public void HashPassword_SamePassword_DifferentSalts()
    {
        var h1 = _hasher.HashPassword("Password123!");
        var h2 = _hasher.HashPassword("Password123!");
        Assert.NotEqual(h1, h2);
    }
}
