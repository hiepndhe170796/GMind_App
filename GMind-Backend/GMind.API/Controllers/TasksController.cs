using System.ComponentModel.DataAnnotations;
using GMind.API.Common;
using GMind.Application.Services.Tasks;
using GMind.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GMind.API.Controllers;

[ApiController]
[Route("api")]
[Authorize]
public class TasksController : ControllerBase
{
    private readonly ITaskService _tasks;

    public TasksController(ITaskService tasks) => _tasks = tasks;

    [HttpGet("projects/{projectId:guid}/tasks")]
    public async Task<IActionResult> List(Guid projectId, CancellationToken ct)
        => Ok(await _tasks.ListByProjectAsync(User.GetUserId(), projectId, ct));

    [HttpPost("projects/{projectId:guid}/tasks")]
    public async Task<IActionResult> Create(Guid projectId, [FromBody] TaskRequest req, CancellationToken ct)
        => Ok(await _tasks.CreateAsync(User.GetUserId(), projectId, req.Title, req.Description,
            req.AssigneeUserId, req.Priority, req.DeadlineAt, req.EstimateHours, req.Points, req.ParentTaskId, ct));

    [HttpGet("tasks/{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
        => Ok(await _tasks.GetAsync(User.GetUserId(), id, ct));

    [HttpPatch("tasks/{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] TaskRequest req, CancellationToken ct)
        => Ok(await _tasks.UpdateAsync(User.GetUserId(), id, req.Title, req.Description,
            req.Priority, req.DeadlineAt, req.EstimateHours, req.Points, ct));

    [HttpPost("tasks/{id:guid}/assign")]
    public async Task<IActionResult> Assign(Guid id, [FromBody] AssignRequest req, CancellationToken ct)
        => Ok(await _tasks.AssignAsync(User.GetUserId(), id, req.AssigneeUserId, ct));

    [HttpPost("tasks/{id:guid}/status")]
    public async Task<IActionResult> ChangeStatus(Guid id, [FromBody] StatusRequest req, CancellationToken ct)
        => Ok(await _tasks.ChangeStatusAsync(User.GetUserId(), id, req.Status, ct));

    [HttpDelete("tasks/{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await _tasks.DeleteAsync(User.GetUserId(), id, ct);
        return Ok(new { message = "Task deleted" });
    }
}

public class TaskRequest
{
    [Required, MaxLength(200)]
    public string Title { get; set; } = string.Empty;
    [MaxLength(2000)]
    public string? Description { get; set; }
    public Guid? AssigneeUserId { get; set; }
    public Guid? ParentTaskId { get; set; }
    public Priority Priority { get; set; } = Priority.Medium;
    public DateTime? DeadlineAt { get; set; }
    public decimal? EstimateHours { get; set; }
    public int? Points { get; set; }
}

public class AssignRequest
{
    public Guid? AssigneeUserId { get; set; }
}

public class StatusRequest
{
    [Required]
    public GMind.Domain.Enums.TaskStatus Status { get; set; }
}
