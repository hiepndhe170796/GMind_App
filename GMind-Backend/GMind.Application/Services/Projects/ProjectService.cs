using GMind.Application.Common;
using GMind.Application.Common.Exceptions;
using GMind.Domain.Entities;
using GMind.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Task = System.Threading.Tasks.Task;
using TaskStatus = GMind.Domain.Enums.TaskStatus;

namespace GMind.Application.Services.Projects;

public interface IProjectService
{
    Task<ProjectDto> CreateAsync(Guid userId, Guid groupId, string name, string? description, string? subject, DateTime? deadlineAt, CancellationToken ct = default);
    Task<List<ProjectDto>> ListByGroupAsync(Guid userId, Guid groupId, CancellationToken ct = default);
    Task<ProjectDto> GetAsync(Guid userId, Guid projectId, CancellationToken ct = default);
    Task<ProjectDto> UpdateAsync(Guid userId, Guid projectId, string name, string? description, string? subject, DateTime? deadlineAt, CancellationToken ct = default);
    Task ArchiveAsync(Guid userId, Guid projectId, CancellationToken ct = default);
}

public record ProjectDto(Guid Id, Guid GroupId, string Name, string? Description, string? Subject,
    DateTime? DeadlineAt, string Status, int TaskCount, int CompletedCount, DateTime CreatedAt);

public class ProjectService : IProjectService
{
    private readonly IApplicationDbContext _context;

    public ProjectService(IApplicationDbContext context) => _context = context;

    public async Task<ProjectDto> CreateAsync(Guid userId, Guid groupId, string name, string? description, string? subject, DateTime? deadlineAt, CancellationToken ct = default)
    {
        await RequireLeaderAsync(userId, groupId, ct);
        var project = new Project
        {
            Id = Guid.NewGuid(),
            GroupId = groupId,
            Name = name.Trim(),
            Description = description,
            Subject = subject,
            DeadlineAt = deadlineAt,
            CreatedByUserId = userId
        };
        _context.Projects.Add(project);
        _context.ActivityLogs.Add(Log(userId, groupId, project.Id, "Project", project.Id, "Create", $"Created project '{project.Name}'"));
        await _context.SaveChangesAsync(ct);
        return ToDto(project, 0, 0);
    }

    public async Task<List<ProjectDto>> ListByGroupAsync(Guid userId, Guid groupId, CancellationToken ct = default)
    {
        await RequireMemberAsync(userId, groupId, ct);
        return await _context.Projects
            .Where(p => p.GroupId == groupId && p.ArchivedAt == null)
            .Select(p => new ProjectDto(p.Id, p.GroupId, p.Name, p.Description, p.Subject,
                p.DeadlineAt, p.Status.ToString(),
                p.Tasks.Count(t => t.ParentTaskId == null),
                p.Tasks.Count(t => t.ParentTaskId == null && t.Status == TaskStatus.Completed),
                p.CreatedAt))
            .ToListAsync(ct);
    }

    public async Task<ProjectDto> GetAsync(Guid userId, Guid projectId, CancellationToken ct = default)
    {
        var p = await _context.Projects.FirstOrDefaultAsync(x => x.Id == projectId && x.ArchivedAt == null, ct)
            ?? throw new NotFoundException("Project not found");
        await RequireMemberAsync(userId, p.GroupId, ct);
        var total = await _context.Tasks.CountAsync(t => t.ProjectId == projectId && t.ParentTaskId == null, ct);
        var done = await _context.Tasks.CountAsync(t => t.ProjectId == projectId && t.ParentTaskId == null && t.Status == TaskStatus.Completed, ct);
        return ToDto(p, total, done);
    }

    public async Task<ProjectDto> UpdateAsync(Guid userId, Guid projectId, string name, string? description, string? subject, DateTime? deadlineAt, CancellationToken ct = default)
    {
        var p = await _context.Projects.FirstOrDefaultAsync(x => x.Id == projectId && x.ArchivedAt == null, ct)
            ?? throw new NotFoundException("Project not found");
        await RequireLeaderAsync(userId, p.GroupId, ct);
        p.Name = name.Trim();
        p.Description = description;
        p.Subject = subject;
        p.DeadlineAt = deadlineAt;
        _context.ActivityLogs.Add(Log(userId, p.GroupId, projectId, "Project", projectId, "Update", $"Updated project '{p.Name}'"));
        await _context.SaveChangesAsync(ct);
        var total = await _context.Tasks.CountAsync(t => t.ProjectId == projectId && t.ParentTaskId == null, ct);
        var done = await _context.Tasks.CountAsync(t => t.ProjectId == projectId && t.ParentTaskId == null && t.Status == TaskStatus.Completed, ct);
        return ToDto(p, total, done);
    }

    public async Task ArchiveAsync(Guid userId, Guid projectId, CancellationToken ct = default)
    {
        var p = await _context.Projects.FirstOrDefaultAsync(x => x.Id == projectId && x.ArchivedAt == null, ct)
            ?? throw new NotFoundException("Project not found");
        await RequireLeaderAsync(userId, p.GroupId, ct);
        p.ArchivedAt = DateTime.UtcNow;
        p.Status = ProjectStatus.Archived;
        _context.ActivityLogs.Add(Log(userId, p.GroupId, projectId, "Project", projectId, "Archive", $"Archived project '{p.Name}'"));
        await _context.SaveChangesAsync(ct);
    }

    private async Task RequireMemberAsync(Guid userId, Guid groupId, CancellationToken ct)
    {
        var ok = await _context.GroupMembers.AnyAsync(m => m.GroupId == groupId && m.UserId == userId && m.IsActive, ct);
        if (!ok) throw new ForbiddenException("Not a member of this group");
    }

    private async Task RequireLeaderAsync(Guid userId, Guid groupId, CancellationToken ct)
    {
        var m = await _context.GroupMembers.FirstOrDefaultAsync(x => x.GroupId == groupId && x.UserId == userId && x.IsActive, ct)
            ?? throw new ForbiddenException("Not a member of this group");
        if (m.Role != Role.Leader) throw new ForbiddenException("Leader role required");
    }

    private static ProjectDto ToDto(Project p, int total, int done)
        => new(p.Id, p.GroupId, p.Name, p.Description, p.Subject, p.DeadlineAt, p.Status.ToString(), total, done, p.CreatedAt);

    private static ActivityLog Log(Guid actor, Guid groupId, Guid? projectId, string entityType, Guid? entityId, string action, string summary)
        => new() { Id = Guid.NewGuid(), ActorUserId = actor, GroupId = groupId, ProjectId = projectId, EntityType = entityType, EntityId = entityId, Action = action, Summary = summary };
}
