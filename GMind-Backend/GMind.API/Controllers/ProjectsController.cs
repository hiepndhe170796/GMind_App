using System.ComponentModel.DataAnnotations;
using GMind.API.Common;
using GMind.Application.Services.Projects;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GMind.API.Controllers;

[ApiController]
[Route("api")]
[Authorize]
public class ProjectsController : ControllerBase
{
    private readonly IProjectService _projects;

    public ProjectsController(IProjectService projects) => _projects = projects;

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

    [HttpPost("projects/{id:guid}/archive")]
    public async Task<IActionResult> Archive(Guid id, CancellationToken ct)
    {
        await _projects.ArchiveAsync(User.GetUserId(), id, ct);
        return Ok(new { message = "Project archived" });
    }
}

public class ProjectRequest
{
    [Required, MaxLength(200)]
    public string Name { get; set; } = string.Empty;
    [MaxLength(2000)]
    public string? Description { get; set; }
    [MaxLength(100)]
    public string? Subject { get; set; }
    public DateTime? DeadlineAt { get; set; }
}
