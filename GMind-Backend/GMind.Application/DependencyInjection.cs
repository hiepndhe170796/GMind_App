using System.Reflection;
using FluentValidation;
using GMind.Application.Services.Auth;
using GMind.Application.Services.Dashboard;
using GMind.Application.Services.Groups;
using GMind.Application.Services.Notifications;
using GMind.Application.Services.Projects;
using GMind.Application.Services.Tasks;
using GMind.Domain.Interfaces;
using Mapster;
using MediatR;
using Microsoft.Extensions.DependencyInjection;

namespace GMind.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddMediatR(cfg => cfg.RegisterServicesFromAssembly(Assembly.GetExecutingAssembly()));
        services.AddValidatorsFromAssembly(Assembly.GetExecutingAssembly());
        services.AddMapster();

        services.AddScoped<IPasswordHasher, PasswordHasher>();
        services.AddScoped<ITokenService, TokenService>();
        services.AddScoped<IAuthService, AuthService>();
        services.AddScoped<IGroupService, GroupService>();
        services.AddScoped<IProjectService, ProjectService>();
        services.AddScoped<ITaskService, TaskService>();
        services.AddScoped<ITaskDetailService, TaskDetailService>();
        services.AddScoped<IDashboardService, DashboardService>();
        services.AddScoped<INotificationService, NotificationService>();

        return services;
    }
}
