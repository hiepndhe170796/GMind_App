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

    [HttpPost("tasks/{id:guid}/remind")]
    public async Task<IActionResult> Remind(Guid id, CancellationToken ct)
    {
        await _tasks.RemindAsync(User.GetUserId(), id, ct);
        return Ok(new { message = "Reminder sent" });
    }

    [HttpPatch("tasks/{id:guid}/progress")]
    public async Task<IActionResult> Progress(Guid id, [FromBody] ProgressRequest req, CancellationToken ct)
        => Ok(await _tasks.UpdateProgressAsync(User.GetUserId(), id, req.ProgressPercent, ct));

    [HttpGet("tasks/{id:guid}/subtasks")]
    public async Task<IActionResult> Subtasks(Guid id, CancellationToken ct)
        => Ok(await _tasks.ListSubtasksAsync(User.GetUserId(), id, ct));

    [HttpGet("tasks/{id:guid}/submissions")]
    public async Task<IActionResult> Submissions(Guid id, CancellationToken ct)
        => Ok(await _detail.ListSubmissionsAsync(User.GetUserId(), id, ct));

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

    [HttpGet("tasks/{id:guid}/helpers")]
    public async Task<IActionResult> Helpers(Guid id, CancellationToken ct)
        => Ok(await _tasks.ListHelpersAsync(User.GetUserId(), id, ct));

    [HttpPost("tasks/{id:guid}/helpers/{helperRowId:guid}/end")]
    public async Task<IActionResult> EndHelper(Guid id, Guid helperRowId, CancellationToken ct)
    {
        await _tasks.EndHelperAsync(User.GetUserId(), id, helperRowId, ct);
        return Ok(new { message = "Helper ended" });
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
    [Required(ErrorMessage = "Vui lòng nhập tiêu đề công việc."), MaxLength(200, ErrorMessage = "Tiêu đề tối đa 200 ký tự.")]
    public string Title { get; set; } = string.Empty;
    [MaxLength(2000, ErrorMessage = "Mô tả tối đa 2000 ký tự.")]
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
    [Required(ErrorMessage = "Vui lòng chọn trạng thái.")]
    public GMind.Domain.Enums.TaskStatus Status { get; set; }

    [MaxLength(2000, ErrorMessage = "Nhận xét tối đa 2000 ký tự.")]
    public string? Comment { get; set; }
}

public class ProgressRequest
{
    [Range(0, 100, ErrorMessage = "Tiến độ phải từ 0 đến 100.")]
    public int ProgressPercent { get; set; }
}

public class CommentRequest
{
    [Required(ErrorMessage = "Vui lòng nhập nội dung bình luận."), MaxLength(2000, ErrorMessage = "Bình luận tối đa 2000 ký tự.")]
    public string Body { get; set; } = string.Empty;
}

public class LinkRequest
{
    [Required(ErrorMessage = "Vui lòng nhập liên kết."), MaxLength(2000, ErrorMessage = "Liên kết tối đa 2000 ký tự."), Url(ErrorMessage = "Liên kết không hợp lệ.")]
    public string Url { get; set; } = string.Empty;

    [MaxLength(500, ErrorMessage = "Tên hiển thị tối đa 500 ký tự.")]
    public string? DisplayName { get; set; }

    [MaxLength(50, ErrorMessage = "Loại liên kết tối đa 50 ký tự.")]
    public string? Type { get; set; }
}
