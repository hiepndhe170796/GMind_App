using GMind.API.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace GMind.API.Common;

public class ApiResponseWrapperFilter : IAsyncActionFilter
{
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var resultContext = await next();

        if (resultContext.Result is ObjectResult objectResult)
        {
            var value = objectResult.Value;
            var response = new ApiResponse<object>
            {
                Success = true,
                Data = value,
                Message = "Success"
            };

            resultContext.Result = new ObjectResult(response)
            {
                StatusCode = objectResult.StatusCode ?? StatusCodes.Status200OK
            };
        }
    }
}
