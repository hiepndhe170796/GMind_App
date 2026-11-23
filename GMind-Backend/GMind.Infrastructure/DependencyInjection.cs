using GMind.Application.Common;
using GMind.Infrastructure.Persistence;
using GMind.Infrastructure.Storage;
using GMind.Infrastructure.Workers;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace GMind.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructureSqlServer(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddSingleton<RealtimeOutbox>();
        services.AddSingleton<RealtimeChangeInterceptor>();

        // Bound manually so the library needs no configuration-binder package.
        var storage = new StorageOptions();
        var storageSection = configuration.GetSection("Storage");
        if (storageSection["RootPath"] is { Length: > 0 } rootPath) storage.RootPath = rootPath;
        if (long.TryParse(storageSection["MaxFileBytes"], out var maxFile)) storage.MaxFileBytes = maxFile;
        if (long.TryParse(storageSection["MaxAvatarBytes"], out var maxAvatar)) storage.MaxAvatarBytes = maxAvatar;
        if (long.TryParse(storageSection["GroupQuotaBytes"], out var quota)) storage.GroupQuotaBytes = quota;
        if (int.TryParse(storageSection["MaxAttachmentsPerMessage"], out var maxAttach)) storage.MaxAttachmentsPerMessage = maxAttach;
        services.AddSingleton(Microsoft.Extensions.Options.Options.Create(storage));
        services.AddSingleton<IFileStorage, LocalFileStorage>();

        services.AddDbContext<ApplicationDbContext>((sp, options) =>
            options.UseSqlServer(
                configuration.GetConnectionString("DefaultConnection"),
                sqlOptions => sqlOptions.EnableRetryOnFailure(
                    maxRetryCount: 3,
                    maxRetryDelay: TimeSpan.FromSeconds(30),
                    errorNumbersToAdd: null
                )
            ).AddInterceptors(sp.GetRequiredService<RealtimeChangeInterceptor>())
        );

        services.AddScoped<IApplicationDbContext>(sp => sp.GetRequiredService<ApplicationDbContext>());

        services.AddHostedService<ReminderWorker>();

        return services;
    }
}
