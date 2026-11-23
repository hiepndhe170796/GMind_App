namespace GMind.API.Common;

/// <summary>
/// Sets baseline security headers on every response (including error responses)
/// without overwriting headers already set downstream. CSP is skipped for
/// /swagger so Swagger UI keeps working in Development.
/// </summary>
public sealed class SecurityHeadersMiddleware
{
    private const string Csp = "default-src 'none'; frame-ancestors 'none'";
    private readonly RequestDelegate _next;

    public SecurityHeadersMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context)
    {
        var isSwagger = context.Request.Path.StartsWithSegments("/swagger");
        context.Response.OnStarting(static state =>
        {
            var (ctx, skipCsp) = ((HttpContext, bool))state;
            SetIfMissing(ctx, "X-Content-Type-Options", "nosniff");
            SetIfMissing(ctx, "X-Frame-Options", "DENY");
            SetIfMissing(ctx, "Referrer-Policy", "strict-origin-when-cross-origin");
            if (!skipCsp)
                SetIfMissing(ctx, "Content-Security-Policy", Csp);
            return Task.CompletedTask;
        }, (context, isSwagger));

        await _next(context);
    }

    private static void SetIfMissing(HttpContext context, string name, string value)
    {
        if (!context.Response.Headers.ContainsKey(name))
            context.Response.Headers[name] = value;
    }
}
