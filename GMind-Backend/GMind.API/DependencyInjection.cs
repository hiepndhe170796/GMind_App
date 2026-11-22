using System.Reflection;
using System.Text.Json;
using GMind.API.Common;
using Mapster;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.OpenApi;

namespace GMind.API;

public static class DependencyInjection
{
    public static IServiceCollection AddPresentation(this IServiceCollection services)
    {
        services.AddControllers(options =>
        {
            options.Filters.Add<ApiResponseWrapperFilter>();
        })
        .AddJsonOptions(o =>
        {
            o.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        })
        .ConfigureApiBehaviorOptions(o =>
        {
            var fallback = o.InvalidModelStateResponseFactory;
            o.InvalidModelStateResponseFactory = ctx =>
            {
                var tooLarge = ctx.ModelState.Values.SelectMany(e => e.Errors).Any(e =>
                    e.Exception is Microsoft.AspNetCore.Http.BadHttpRequestException
                        { StatusCode: StatusCodes.Status413RequestEntityTooLarge }
                    || (e.Exception?.Message ?? e.ErrorMessage).Contains("body too large", StringComparison.OrdinalIgnoreCase));
                if (!tooLarge) return fallback(ctx);
                return new Microsoft.AspNetCore.Mvc.ObjectResult(new Models.ApiResponse
                {
                    Success = false,
                    Message = "Tệp vượt quá giới hạn dung lượng cho phép.",
                    Errors = ["Tệp vượt quá giới hạn dung lượng cho phép."]
                })
                { StatusCode = StatusCodes.Status413RequestEntityTooLarge };
            };
        });

        services.AddExceptionHandler<GlobalExceptionHandler>();
        services.AddProblemDetails();
        services.AddHttpContextAccessor();
        services.AddSingleton<GMind.Application.Common.IEmailSender, Common.DevelopmentMailbox>();
        services.AddScoped<GMind.Application.Common.IClientInfo, Common.HttpClientInfo>();
        services.AddSignalR();
        services.AddSingleton<GMind.Application.Common.IRealtimeSessions, Realtime.RealtimeSessions>();
        services.AddHostedService<Realtime.RealtimeDispatcher>();

        var config = TypeAdapterConfig.GlobalSettings;
        config.Scan(Assembly.GetExecutingAssembly());

        services.AddSwaggerGen(options =>
        {
            options.SwaggerDoc("v1", new OpenApiInfo
            {
                Title = "GMind API",
                Version = "1.0",
                Description = "REST API for GMind - Student Group Project Management",
                Contact = new OpenApiContact { Name = "GMind Team" }
            });

            options.AddSecurityDefinition("BearerAuth", new OpenApiSecurityScheme
            {
                Type = SecuritySchemeType.Http,
                Scheme = "bearer",
                BearerFormat = "JWT",
                Description = "Enter JWT Bearer token"
            });

            options.AddSecurityRequirement(document => new OpenApiSecurityRequirement
            {
                [new OpenApiSecuritySchemeReference("BearerAuth", document)] = new List<string>()
            });
        });

        return services;
    }
}
