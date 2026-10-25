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
    private readonly ITaskDetailService _detail;

    public TasksController(ITaskService tasks, ITaskDetailService detail)
    {
        _tasks = tasks;
        _detail = detail;
    }

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
        => Ok(await _tasks.ChangeStatusAsync(User.GetUserId(), id, req.Status, req.Comment, ct));

    [HttpGet("tasks/{id:guid}/comments")]
    public async Task<IActionResult> Comments(Guid id, CancellationToken ct)
        => Ok(await _detail.ListCommentsAsync(User.GetUserId(), id, ct));

    [HttpPost("tasks/{id:guid}/comments")]
    public async Task<IActionResult> AddComment(Guid id, [FromBody] CommentRequest req, CancellationToken ct)
        => Ok(await _detail.AddCommentAsync(User.GetUserId(), id, req.Body, ct));

    [HttpPatch("comments/{commentId:guid}")]
    public async Task<IActionResult> UpdateComment(Guid commentId, [FromBody] CommentRequest req, CancellationToken ct)
        => Ok(await _detail.UpdateCommentAsync(User.GetUserId(), commentId, req.Body, ct));

    [HttpDelete("comments/{commentId:guid}")]
    public async Task<IActionResult> DeleteComment(Guid commentId, CancellationToken ct)
    {
        await _detail.DeleteCommentAsync(User.GetUserId(), commentId, ct);
        return Ok(new { message = "Comment deleted" });
    }

    [HttpGet("tasks/{id:guid}/links")]
    public async Task<IActionResult> Links(Guid id, CancellationToken ct)
        => Ok(await _detail.ListLinksAsync(User.GetUserId(), id, ct));

    [HttpPost("tasks/{id:guid}/links")]
    public async Task<IActionResult> AddLink(Guid id, [FromBody] LinkRequest req, CancellationToken ct)
        => Ok(await _detail.AddLinkAsync(User.GetUserId(), id, req.Url, req.DisplayName, req.Type, ct));

    [HttpDelete("links/{linkId:guid}")]
    public async Task<IActionResult> DeleteLink(Guid linkId, CancellationToken ct)
    {
        await _detail.DeleteLinkAsync(User.GetUserId(), linkId, ct);
        return Ok(new { message = "Link deleted" });
    }

    [HttpGet("tasks/{id:guid}/reviews")]
    public async Task<IActionResult> Reviews(Guid id, CancellationToken ct)
        => Ok(await _detail.ListReviewsAsync(User.GetUserId(), id, ct));

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

    [MaxLength(2000)]
    public string? Comment { get; set; }
}

public class CommentRequest
{
    [Required, MaxLength(2000)]
    public string Body { get; set; } = string.Empty;
}

public class LinkRequest
{
    [Required, MaxLength(2000), Url]
    public string Url { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? DisplayName { get; set; }

    [MaxLength(50)]
    public string? Type { get; set; }
}
