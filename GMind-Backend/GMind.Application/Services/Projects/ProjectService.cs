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
    Task<List<ArchivedProjectDto>> ListArchivedAsync(Guid userId, Guid groupId, CancellationToken ct = default);
    Task RestoreAsync(Guid userId, Guid projectId, CancellationToken ct = default);
    Task<ProjectContributionsDto> GetContributionsAsync(Guid userId, Guid projectId, CancellationToken ct = default);
}

public record ProjectDto(Guid Id, Guid GroupId, string Name, string? Description, string? Subject,
    DateTime? DeadlineAt, string Status, int TaskCount, int CompletedCount, DateTime CreatedAt);
public record MemberContributionDto(Guid UserId, string DisplayName, int CreditedPoints, int PlannedPoints, double Percent);
public record ProjectContributionsDto(Guid ProjectId, int TotalCredited, int TotalPlanned,
    bool IsLeader, List<MemberContributionDto> Members);
public record ArchivedProjectDto(Guid Id, string Name, string? Subject, DateTime? ArchivedAt,
    int TaskCount, int CompletedCount, bool CanRestore);

public class ProjectService : IProjectService
{
    private readonly IApplicationDbContext _context;
    private readonly IResourceAccess _access;

    public ProjectService(IApplicationDbContext context, IResourceAccess access)
    {
        _context = context;
        _access = access;
    }

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
        _context.ActivityLogs.Add(Log(userId, groupId, project.Id, "Project", project.Id, "Create", $"Tạo dự án '{project.Name}'"));
        await _context.SaveChangesAsync(ct);
        return ToDto(project, 0, 0, 0);
    }

    public async Task<List<ProjectDto>> ListByGroupAsync(Guid userId, Guid groupId, CancellationToken ct = default)
    {
        await RequireMemberAsync(userId, groupId, ct);
        return await _context.Projects
            .Where(p => p.GroupId == groupId && p.ArchivedAt == null)
            .Select(p => new ProjectDto(p.Id, p.GroupId, p.Name, p.Description, p.Subject,
                p.DeadlineAt, DeriveStatus(p.ArchivedAt != null,
                    p.Tasks.Count(t => t.ParentTaskId == null),
                    p.Tasks.Count(t => t.ParentTaskId == null && t.Status == TaskStatus.Completed),
                    p.Tasks.Count(t => t.ParentTaskId == null && t.Status != TaskStatus.ToDo)),
                p.Tasks.Count(t => t.ParentTaskId == null),
                p.Tasks.Count(t => t.ParentTaskId == null && t.Status == TaskStatus.Completed),
                p.CreatedAt))
            .ToListAsync(ct);
    }

    public async Task<ProjectDto> GetAsync(Guid userId, Guid projectId, CancellationToken ct = default)
    {
        var p = await _context.Projects.FirstOrDefaultAsync(x => x.Id == projectId && x.ArchivedAt == null, ct)
            ?? throw new NotFoundException("Không tìm thấy dự án này.");
        await RequireMemberAsync(userId, p.GroupId, ct);
        var total = await _context.Tasks.CountAsync(t => t.ProjectId == projectId && t.ParentTaskId == null, ct);
        var done = await _context.Tasks.CountAsync(t => t.ProjectId == projectId && t.ParentTaskId == null && t.Status == TaskStatus.Completed, ct);
        var started = await _context.Tasks.CountAsync(t => t.ProjectId == p.Id && t.ParentTaskId == null && t.Status != TaskStatus.ToDo, ct);
        return ToDto(p, total, done, started);
    }

    public async Task<ProjectDto> UpdateAsync(Guid userId, Guid projectId, string name, string? description, string? subject, DateTime? deadlineAt, CancellationToken ct = default)
    {
        var p = await _context.Projects.FirstOrDefaultAsync(x => x.Id == projectId && x.ArchivedAt == null, ct)
            ?? throw new NotFoundException("Không tìm thấy dự án này.");
        await RequireLeaderAsync(userId, p.GroupId, ct);
        p.Name = name.Trim();
        p.Description = description;
        p.Subject = subject;
        p.DeadlineAt = deadlineAt;
        _context.ActivityLogs.Add(Log(userId, p.GroupId, projectId, "Project", projectId, "Update", $"Cập nhật dự án '{p.Name}'"));
        await _context.SaveChangesAsync(ct);
        var total = await _context.Tasks.CountAsync(t => t.ProjectId == projectId && t.ParentTaskId == null, ct);
        var done = await _context.Tasks.CountAsync(t => t.ProjectId == projectId && t.ParentTaskId == null && t.Status == TaskStatus.Completed, ct);
        var started = await _context.Tasks.CountAsync(t => t.ProjectId == p.Id && t.ParentTaskId == null && t.Status != TaskStatus.ToDo, ct);
        return ToDto(p, total, done, started);
    }

    public async Task ArchiveAsync(Guid userId, Guid projectId, CancellationToken ct = default)
    {
        var p = await _context.Projects.FirstOrDefaultAsync(x => x.Id == projectId && x.ArchivedAt == null, ct)
            ?? throw new NotFoundException("Không tìm thấy dự án này.");
        await RequireLeaderAsync(userId, p.GroupId, ct);
        p.ArchivedAt = DateTime.UtcNow;
        p.Status = ProjectStatus.Archived;
        var taskIds = await _context.Tasks.Where(t => t.ProjectId == p.Id).Select(t => t.Id).ToListAsync(ct);
        await Services.Marketplace.MarketplaceCleanup.CancelActiveAsync(_context, taskIds, null,
            "Tự động hủy vì dự án đã được lưu trữ.", ct);
        _context.ActivityLogs.Add(Log(userId, p.GroupId, projectId, "Project", projectId, "Archive", $"Lưu trữ dự án '{p.Name}'"));
        await _context.SaveChangesAsync(ct);
    }

    public async Task<List<ArchivedProjectDto>> ListArchivedAsync(Guid userId, Guid groupId, CancellationToken ct = default)
    {
        var membership = await _access.RequireMemberAsync(userId, groupId, ct);
        return await _context.Projects
            .Where(p => p.GroupId == groupId && p.ArchivedAt != null)
            .OrderByDescending(p => p.ArchivedAt)
            .Select(p => new ArchivedProjectDto(p.Id, p.Name, p.Subject, p.ArchivedAt,
                p.Tasks.Count(t => t.ParentTaskId == null),
                p.Tasks.Count(t => t.ParentTaskId == null && t.Status == TaskStatus.Completed),
                membership.Role == Role.Leader))
            .ToListAsync(ct);
    }

    public async Task RestoreAsync(Guid userId, Guid projectId, CancellationToken ct = default)
    {
        var p = await _context.Projects.FirstOrDefaultAsync(x => x.Id == projectId, ct)
            ?? throw new NotFoundException("Không tìm thấy dự án này.");
        await RequireLeaderAsync(userId, p.GroupId, ct);
        if (p.ArchivedAt == null)
            throw new BadRequestException("Dự án chưa được lưu trữ.");
        p.ArchivedAt = null;
        p.Status = ProjectStatus.NotStarted;
        _context.ActivityLogs.Add(Log(userId, p.GroupId, projectId, "Project", projectId, "Restore", $"Khôi phục dự án '{p.Name}'"));
        await _context.SaveChangesAsync(ct);
    }

    /// <summary>Contribution points per project — Leader sees every member; a Member sees only their own row + project totals.</summary>
    public async Task<ProjectContributionsDto> GetContributionsAsync(Guid userId, Guid projectId, CancellationToken ct = default)
    {
        var p = await _context.Projects.FirstOrDefaultAsync(x => x.Id == projectId && x.ArchivedAt == null, ct)
            ?? throw new NotFoundException("Không tìm thấy dự án này.");
        var membership = await _access.RequireMemberAsync(userId, p.GroupId, ct);
        var isLeader = membership.Role == Role.Leader;

        // Planned = sum of Points on top-level tasks assigned in this project; credited = recorded credits.
        var planned = await _context.Tasks
            .Where(t => t.ProjectId == projectId && t.ParentTaskId == null && t.AssigneeUserId != null && t.Points != null)
            .GroupBy(t => t.AssigneeUserId!.Value)
            .Select(g => new { UserId = g.Key, Points = g.Sum(t => t.Points!.Value) })
            .ToListAsync(ct);
        var credited = await _context.ContributionCredits
            .Where(c => c.ProjectId == projectId)
            .GroupBy(c => c.UserId)
            .Select(g => new { UserId = g.Key, Points = g.Sum(c => c.Points) })
            .ToListAsync(ct);

        var userIds = planned.Select(x => x.UserId).Union(credited.Select(x => x.UserId)).ToList();
        var names = await _context.Users.Where(u => userIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u.DisplayName, ct);
        var creditedMap = credited.ToDictionary(x => x.UserId, x => x.Points);
        var plannedMap = planned.ToDictionary(x => x.UserId, x => x.Points);
        var totalCredited = creditedMap.Values.Sum();
        var totalPlanned = plannedMap.Values.Sum();

        var members = userIds
            .Where(id => isLeader || id == userId)
            .Select(id => new MemberContributionDto(id, names.GetValueOrDefault(id, "Thành viên"),
                creditedMap.GetValueOrDefault(id), plannedMap.GetValueOrDefault(id),
                totalCredited == 0 ? 0 : Math.Round(creditedMap.GetValueOrDefault(id) * 100.0 / totalCredited, 1)))
            .OrderByDescending(m => m.CreditedPoints).ToList();

        return new ProjectContributionsDto(projectId, totalCredited, totalPlanned, isLeader, members);
    }

    private async Task RequireMemberAsync(Guid userId, Guid groupId, CancellationToken ct)
        => await _access.RequireMemberAsync(userId, groupId, ct);

    private async Task RequireLeaderAsync(Guid userId, Guid groupId, CancellationToken ct)
        => await _access.RequireLeaderAsync(userId, groupId, ct);

    private static string DeriveStatus(bool archived, int total, int done, int started)
        => archived ? "Archived" : total == 0 ? "NotStarted" : total == done ? "Completed" : started > 0 ? "InProgress" : "NotStarted";

    private static ProjectDto ToDto(Project p, int total, int done, int started)
        => new(p.Id, p.GroupId, p.Name, p.Description, p.Subject, p.DeadlineAt, DeriveStatus(p.ArchivedAt != null, total, done, started), total, done, p.CreatedAt);

    private static ActivityLog Log(Guid actor, Guid groupId, Guid? projectId, string entityType, Guid? entityId, string action, string summary)
        => new() { Id = Guid.NewGuid(), ActorUserId = actor, GroupId = groupId, ProjectId = projectId, EntityType = entityType, EntityId = entityId, Action = action, Summary = summary };
}
