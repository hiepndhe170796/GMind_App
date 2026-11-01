using GMind.Application.Common;
using GMind.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Task = System.Threading.Tasks.Task;
using TaskStatus = GMind.Domain.Enums.TaskStatus;

namespace GMind.Application.Services.Dashboard;

public interface IDashboardService
{
    Task<List<MyTaskDto>> GetMyTasksAsync(Guid userId, CancellationToken ct = default);
    Task<GroupProgressDto> GetGroupProgressAsync(Guid userId, Guid groupId, CancellationToken ct = default);
}

public record MyTaskDto(Guid Id, Guid ProjectId, string ProjectName, string Title, string Status, string Priority, DateTime? DeadlineAt);
public record MemberProgressDto(Guid UserId, string DisplayName, int Total, int InProgress, int Submitted, int Completed);
public record GroupProgressDto(Guid GroupId, int TotalTasks, int CompletedTasks, int PercentComplete, List<MemberProgressDto> Members);

public class DashboardService : IDashboardService
{
    private readonly IApplicationDbContext _context;
    private readonly IResourceAccess _access;

    public DashboardService(IApplicationDbContext context, IResourceAccess access)
    {
        _context = context;
        _access = access;
    }

    public async Task<List<MyTaskDto>> GetMyTasksAsync(Guid userId, CancellationToken ct = default)
    {
        return await _context.Tasks
            .Where(t => t.AssigneeUserId == userId && t.Status != TaskStatus.Completed && t.Project.ArchivedAt == null
                && !t.Project.Group.IsArchived
                && t.Project.Group.Members.Any(m => m.UserId == userId && m.IsActive && m.User.IsActive))
            .OrderBy(t => t.DeadlineAt ?? DateTime.MaxValue)
            .Select(t => new MyTaskDto(t.Id, t.ProjectId, t.Project.Name, t.Title, t.Status.ToString(), t.Priority.ToString(), t.DeadlineAt))
            .ToListAsync(ct);
    }

    /// <summary>Leader-only view: per-member progress for a group.</summary>
    public async Task<GroupProgressDto> GetGroupProgressAsync(Guid userId, Guid groupId, CancellationToken ct = default)
    {
        await _access.RequireLeaderAsync(userId, groupId, ct);

        var memberProgress = await _context.Tasks
            .Where(t => t.Project.GroupId == groupId && t.AssigneeUserId != null && t.ParentTaskId == null && t.Project.ArchivedAt == null)
            .GroupBy(t => new { t.AssigneeUserId, t.Assignee!.DisplayName })
            .Select(g => new MemberProgressDto(
                g.Key.AssigneeUserId!.Value,
                g.Key.DisplayName,
                g.Count(),
                g.Count(t => t.Status == TaskStatus.InProgress),
                g.Count(t => t.Status == TaskStatus.Submitted || t.Status == TaskStatus.ChangesRequested),
                g.Count(t => t.Status == TaskStatus.Completed)))
            .ToListAsync(ct);

        var total = memberProgress.Sum(m => m.Total);
        var done = memberProgress.Sum(m => m.Completed);
        var pct = total == 0 ? 0 : (int)Math.Round(done * 100.0 / total);

        return new GroupProgressDto(groupId, total, done, pct, memberProgress);
    }
}
