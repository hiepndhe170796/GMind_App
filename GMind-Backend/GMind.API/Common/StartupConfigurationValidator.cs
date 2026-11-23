using System.Text;

namespace GMind.API.Common;

/// <summary>
/// Fails fast on missing or unsafe startup configuration. Runs before the service
/// collection is built; must never log or include configured secret values.
/// </summary>
public static class StartupConfigurationValidator
{
    private const string DevSecret = "GMind_Dev_Only_Secret_Change_Me_In_Production_MinLen32";
    private const int MinSecretBytes = 32;

    public static void Validate(IConfiguration config, IHostEnvironment env)
    {
        var problems = new List<string>();

        var secret = config["Jwt:Secret"];
        if (string.IsNullOrWhiteSpace(secret))
        {
            problems.Add("Jwt:Secret is missing or empty. Set it via the Jwt__Secret environment variable or your platform's secret manager.");
        }
        else
        {
            if (Encoding.UTF8.GetByteCount(secret) < MinSecretBytes)
                problems.Add("Jwt:Secret must be at least 32 bytes (UTF-8). Set a longer value via the Jwt__Secret environment variable or your platform's secret manager.");
            if (!env.IsDevelopment()
                && (string.Equals(secret, DevSecret, StringComparison.Ordinal)
                    || secret.Contains("Change_Me", StringComparison.OrdinalIgnoreCase)))
                problems.Add("Jwt:Secret still uses the development placeholder. Set a unique secret via the Jwt__Secret environment variable or your platform's secret manager before running outside Development.");
        }

        if (string.IsNullOrWhiteSpace(config["Jwt:Issuer"]))
            problems.Add("Jwt:Issuer is missing or empty. Set it in configuration (e.g. the Jwt__Issuer environment variable).");
        if (string.IsNullOrWhiteSpace(config["Jwt:Audience"]))
            problems.Add("Jwt:Audience is missing or empty. Set it in configuration (e.g. the Jwt__Audience environment variable).");

        if (config["Jwt:ExpiryMinutes"] is { } expiryMinutes
            && (!int.TryParse(expiryMinutes, out var em) || em <= 0))
            problems.Add("Jwt:ExpiryMinutes must be a positive integer.");
        if (config["Jwt:RefreshTokenExpiryDays"] is { } refreshDays
            && (!int.TryParse(refreshDays, out var rd) || rd <= 0))
            problems.Add("Jwt:RefreshTokenExpiryDays must be a positive integer.");

        if (problems.Count > 0)
            throw new InvalidOperationException(
                "Invalid startup configuration: " + string.Join(' ', problems.Select((p, i) => $"[{i + 1}] {p}")));
    }
}
