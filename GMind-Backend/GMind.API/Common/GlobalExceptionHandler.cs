using GMind.API.Models;
using GMind.Application.Common.Exceptions;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.EntityFrameworkCore;

namespace GMind.API.Common;

public class GlobalExceptionHandler : IExceptionHandler
{
    private readonly ILogger<GlobalExceptionHandler> _logger;

    public GlobalExceptionHandler(ILogger<GlobalExceptionHandler> logger)
    {
        _logger = logger;
    }

    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        var (statusCode, message) = exception switch
        {
            NotFoundException => (StatusCodes.Status404NotFound, exception.Message),
            UnauthorizedException => (StatusCodes.Status401Unauthorized, exception.Message),
            ForbiddenException => (StatusCodes.Status403Forbidden, exception.Message),
            ConflictException => (StatusCodes.Status409Conflict, exception.Message),
            BadRequestException => (StatusCodes.Status400BadRequest, exception.Message),
            DbUpdateConcurrencyException => (StatusCodes.Status409Conflict, "The resource changed. Reload and try again"),
            FluentValidation.ValidationException => (StatusCodes.Status400BadRequest, "Validation failed"),
            _ => (StatusCodes.Status500InternalServerError, "An error occurred processing your request")
        };

        if (statusCode >= 500)
            _logger.LogError(exception, "An unhandled exception occurred");
        else
            _logger.LogInformation(exception, "Request failed: {Message}", exception.Message);

        var errors = exception is FluentValidation.ValidationException ve
            ? ve.Errors.Select(e => e.ErrorMessage).ToList()
            : statusCode >= 500
                ? new List<string>()
                : new List<string> { message };

        var response = new ApiResponse<object>
        {
            Success = false,
            Message = message,
            Errors = errors.Count > 0 ? errors : null
        };

        httpContext.Response.StatusCode = statusCode;
        httpContext.Response.ContentType = "application/json";

        await httpContext.Response.WriteAsJsonAsync(response, cancellationToken);

        return true;
    }
}
