using GMind.API.Common;
using GMind.Application.Services.Dashboard;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GMind.API.Controllers;

[ApiController]
[Route("api")]
[Authorize]
public class DashboardController : ControllerBase
{
    private readonly IDashboardService _dashboard;

    public DashboardController(IDashboardService dashboard) => _dashboard = dashboard;

    /// <summary>Tasks assigned to current user, sorted by nearest deadline.</summary>
    [HttpGet("dashboard/my-tasks")]
    public async Task<IActionResult> MyTasks(CancellationToken ct)
        => Ok(await _dashboard.GetMyTasksAsync(User.GetUserId(), ct));

    /// <summary>Leader-only: per-member progress for a group.</summary>
    [HttpGet("groups/{groupId:guid}/progress")]
    public async Task<IActionResult> GroupProgress(Guid groupId, CancellationToken ct)
        => Ok(await _dashboard.GetGroupProgressAsync(User.GetUserId(), groupId, ct));
}
