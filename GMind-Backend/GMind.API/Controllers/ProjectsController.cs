using System.ComponentModel.DataAnnotations;
using GMind.API.Common;
using GMind.Application.Services.Projects;
using GMind.Application.Services.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GMind.API.Controllers;

[ApiController]
[Route("api")]
[Authorize]
public class ProjectsController : ControllerBase
{
    private readonly IProjectService _projects;
    private readonly ITaskDetailService _detail;

    public ProjectsController(IProjectService projects, ITaskDetailService detail)
    {
        _projects = projects;
        _detail = detail;
    }

    [HttpGet("groups/{groupId:guid}/projects")]
    public async Task<IActionResult> List(Guid groupId, CancellationToken ct)
        => Ok(await _projects.ListByGroupAsync(User.GetUserId(), groupId, ct));

    [HttpPost("groups/{groupId:guid}/projects")]
    public async Task<IActionResult> Create(Guid groupId, [FromBody] ProjectRequest req, CancellationToken ct)
        => Ok(await _projects.CreateAsync(User.GetUserId(), groupId, req.Name, req.Description, req.Subject, req.DeadlineAt, ct));

    [HttpGet("projects/{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
        => Ok(await _projects.GetAsync(User.GetUserId(), id, ct));

    [HttpPatch("projects/{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] ProjectRequest req, CancellationToken ct)
        => Ok(await _projects.UpdateAsync(User.GetUserId(), id, req.Name, req.Description, req.Subject, req.DeadlineAt, ct));

    [HttpGet("projects/{id:guid}/links")]
    public async Task<IActionResult> Links(Guid id, CancellationToken ct)
        => Ok(await _detail.ListProjectLinksAsync(User.GetUserId(), id, ct));

    [HttpPost("projects/{id:guid}/links")]
    public async Task<IActionResult> AddLink(Guid id, [FromBody] LinkRequest req, CancellationToken ct)
        => Ok(await _detail.AddProjectLinkAsync(User.GetUserId(), id, req.Url, req.DisplayName, req.Type, ct));

    [HttpGet("projects/{id:guid}/contributions")]
    public async Task<IActionResult> Contributions(Guid id, CancellationToken ct)
        => Ok(await _projects.GetContributionsAsync(User.GetUserId(), id, ct));

    [HttpPost("projects/{id:guid}/archive")]
    public async Task<IActionResult> Archive(Guid id, CancellationToken ct)
    {
        await _projects.ArchiveAsync(User.GetUserId(), id, ct);
        return Ok(new { message = "Project archived" });
    }

    [HttpGet("groups/{groupId:guid}/projects/archived")]
    public async Task<IActionResult> ArchivedProjects(Guid groupId, CancellationToken ct)
        => Ok(await _projects.ListArchivedAsync(User.GetUserId(), groupId, ct));

    [HttpPost("projects/{id:guid}/restore")]
    public async Task<IActionResult> Restore(Guid id, CancellationToken ct)
    {
        await _projects.RestoreAsync(User.GetUserId(), id, ct);
        return Ok(new { message = "Project restored" });
    }
}

public class ProjectRequest
{
    [Required(ErrorMessage = "Vui lòng nhập tên dự án."), MaxLength(200, ErrorMessage = "Tên dự án tối đa 200 ký tự.")]
    public string Name { get; set; } = string.Empty;
    [MaxLength(2000, ErrorMessage = "Mô tả dự án tối đa 2000 ký tự.")]
    public string? Description { get; set; }
    [MaxLength(100, ErrorMessage = "Môn học tối đa 100 ký tự.")]
    public string? Subject { get; set; }
    public DateTime? DeadlineAt { get; set; }
}
