using System.Text;
using GMind.API;
using GMind.API.Common;
using GMind.Application;
using GMind.Infrastructure;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddPresentation();
builder.Services.AddApplication();
builder.Services.AddInfrastructureSqlServer(builder.Configuration);

builder.Services.AddScoped<SessionTokenValidator>();
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.EventsType = typeof(SessionTokenValidator);
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Secret"]!)),
            ClockSkew = TimeSpan.Zero
        };
    });

builder.Services.AddAuthorization();

// Per-client-IP fixed-window limits on auth endpoints; config-overridable via RateLimiting:*.
var rl = builder.Configuration.GetSection("RateLimiting");
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = 429;
    options.OnRejected = async (ctx, _) =>
    {
        ctx.HttpContext.Response.StatusCode = 429;
        await ctx.HttpContext.Response.WriteAsJsonAsync(new GMind.API.Models.ApiResponse<object>
        {
            Success = false,
            Message = "Bạn thao tác quá nhiều lần. Vui lòng thử lại sau ít phút.",
            Errors = null
        });
    };
    options.AddPolicy("auth-login", httpContext => System.Threading.RateLimiting.RateLimitPartition.GetFixedWindowLimiter(
        partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        factory: _ => new System.Threading.RateLimiting.FixedWindowRateLimiterOptions
        {
            PermitLimit = rl.GetValue<int?>("LoginPermitLimit") ?? 10,
            Window = TimeSpan.FromMinutes(rl.GetValue<double?>("LoginWindowMinutes") ?? 1),
            QueueLimit = 0,
        }));
    options.AddPolicy("auth-recovery", httpContext => System.Threading.RateLimiting.RateLimitPartition.GetFixedWindowLimiter(
        partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        factory: _ => new System.Threading.RateLimiting.FixedWindowRateLimiterOptions
        {
            PermitLimit = rl.GetValue<int?>("RecoveryPermitLimit") ?? 5,
            Window = TimeSpan.FromMinutes(rl.GetValue<double?>("RecoveryWindowMinutes") ?? 15),
            QueueLimit = 0,
        }));
});

builder.Services.AddHealthChecks().AddCheck<DatabaseReadinessCheck>("database", tags: ["ready"]);

builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        var origins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
            ?? ["http://localhost:5173"];
        policy.WithOrigins(origins)
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

var app = builder.Build();

app.UseExceptionHandler();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "GMind API v1");
        c.ConfigObject.PersistAuthorization = true;
    });
}

app.UseCors("Frontend");
if (!app.Environment.IsDevelopment()) app.UseHttpsRedirection();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapHub<GMind.API.Realtime.RealtimeHub>("/hubs/realtime",
    options => options.CloseOnAuthenticationExpiration = true);
if (app.Environment.IsDevelopment()) app.MapDevMailbox();

app.MapHealthChecks("/api/health/live", new HealthCheckOptions { Predicate = _ => false }).AllowAnonymous();
app.MapHealthChecks("/api/health/ready", new HealthCheckOptions { Predicate = registration => registration.Tags.Contains("ready") }).AllowAnonymous();

app.Run();

public partial class Program { }
