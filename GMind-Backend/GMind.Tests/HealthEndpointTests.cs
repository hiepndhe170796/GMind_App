using System.Net;
using GMind.Infrastructure.Workers;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace GMind.Tests;

public class HealthEndpointTests
{
    private static WebApplicationFactory<Program> CreateFactory(bool databaseHealthy)
        => new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
            builder.ConfigureAppConfiguration((_, config) =>
            {
                config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["Jwt:Issuer"] = "GMindTests",
                    ["Jwt:Audience"] = "GMindTests",
                    ["Jwt:Secret"] = "test-secret-key-minimum-32-chars-long!",
                    ["ConnectionStrings:DefaultConnection"] =
                        "Server=(localdb)\\mssqllocaldb;Database=GMind_HealthTests_NeverUsed;Trusted_Connection=True;TrustServerCertificate=True;"
                });
            });
            builder.ConfigureServices(services =>
            {
                var worker = services.SingleOrDefault(d => d.ImplementationType == typeof(ReminderWorker));
                if (worker is not null) services.Remove(worker);

                services.PostConfigure<HealthCheckServiceOptions>(options =>
                {
                    options.Registrations.Clear();
                    options.Registrations.Add(new HealthCheckRegistration(
                        "database",
                        _ => new StubHealthCheck(databaseHealthy),
                        failureStatus: null,
                        tags: new[] { "ready" }));
                });
            });
        });

    [Theory]
    [InlineData(true, HttpStatusCode.OK, "Healthy")]
    [InlineData(false, HttpStatusCode.ServiceUnavailable, "Unhealthy")]
    public async Task Ready_ReflectsDatabaseHealthCheck(bool databaseHealthy, HttpStatusCode expectedStatus, string expectedBody)
    {
        await using var factory = CreateFactory(databaseHealthy);
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

        var response = await client.GetAsync("/api/health/ready");

        Assert.Equal(expectedStatus, response.StatusCode);
        Assert.Equal(expectedBody, await response.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Live_ReturnsOk_RegardlessOfDatabaseHealth(bool databaseHealthy)
    {
        await using var factory = CreateFactory(databaseHealthy);
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

        var response = await client.GetAsync("/api/health/live");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Healthy", await response.Content.ReadAsStringAsync());
    }

    private sealed class StubHealthCheck(bool healthy) : IHealthCheck
    {
        public System.Threading.Tasks.Task<HealthCheckResult> CheckHealthAsync(
            HealthCheckContext context, CancellationToken cancellationToken = default)
            => System.Threading.Tasks.Task.FromResult(
                healthy ? HealthCheckResult.Healthy() : HealthCheckResult.Unhealthy("stub"));
    }
}
