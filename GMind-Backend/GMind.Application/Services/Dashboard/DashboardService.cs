using GMind.Application.Common;
using GMind.Application.Services.Tasks;
using GMind.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Task = System.Threading.Tasks.Task;
using TaskStatus = GMind.Domain.Enums.TaskStatus;

namespace GMind.Application.Services.Dashboard;

public interface IDashboardService
{
    Task<List<MyTaskDto>> GetMyTasksAsync(Guid userId, bool includeCompleted = false, CancellationToken ct = default);
    Task<GroupProgressDto> GetGroupProgressAsync(Guid userId, Guid groupId, CancellationToken ct = default);
    Task<LeaderQueueDto> GetLeaderQueueAsync(Guid userId, CancellationToken ct = default);
    Task<List<HelpingTaskDto>> GetHelpingAsync(Guid userId, CancellationToken ct = default);
}

public record MyTaskDto(Guid Id, Guid ProjectId, string ProjectName, string Title, string Status, string Priority,
    DateTime? DeadlineAt, Guid? ParentTaskId = null, string? ParentTitle = null, string? GroupName = null,
    Guid GroupId = default, int? ProgressPercent = null, DateTime? UpdatedAt = null, DateTime? CompletedAt = null,
    TaskPermissionsDto? Permissions = null, bool IsAtRisk = false, bool IsStale = false);

public record LeaderQueueCounts(int ToDo, int InProgress, int Submitted, int ChangesRequested, int Completed);
public record LeaderQueueGroupDto(Guid GroupId, string GroupName, LeaderQueueCounts Counts,
    int Overdue, int AtRisk, int Stale, int Unassigned, int PendingRequests);
public record LeaderQueueItemDto(string Kind, Guid? TaskId, Guid? RequestId, string Title,
    Guid? ProjectId, string? ProjectName, Guid GroupId, string GroupName,
    string? AssigneeName, DateTime? DeadlineAt, int? ProgressPercent, DateTime? UpdatedAt,
    string? RequestType, string? RequestedByName);
public record LeaderQueueTotals(int Review, int Marketplace, int Overdue, int AtRisk, int Stale, int Unassigned);
public record LeaderQueueDto(List<LeaderQueueGroupDto> Groups, List<LeaderQueueItemDto> Items, LeaderQueueTotals Totals);
public record MemberProgressDto(Guid UserId, string DisplayName, int Total, int InProgress, int Submitted, int Completed, int ChangesRequested, int Overdue, bool IsActiveMember, int AtRisk);
public record GroupProgressDto(Guid GroupId, int TotalTasks, int CompletedTasks, int PercentComplete, int UnassignedTasks, List<MemberProgressDto> Members);
public record HelpingTaskDto(Guid HelperRowId, Guid TaskId, string Title, Guid ProjectId, string ProjectName,
    Guid GroupId, string GroupName, string? AssigneeName, string Status, DateTime? DeadlineAt,
    string Scope, DateTime CreatedAt);

public class DashboardService : IDashboardService
{
    private readonly IApplicationDbContext _context;
    private readonly IResourceAccess _access;

    public DashboardService(IApplicationDbContext context, IResourceAccess access)
    {
        _context = context;
        _access = access;
    }

    public async Task<List<MyTaskDto>> GetMyTasksAsync(Guid userId, bool includeCompleted = false, CancellationToken ct = default)
    {
        var cutoff = DateTime.UtcNow.AddDays(-30);
        var rows = await _context.Tasks
            .Where(t => t.AssigneeUserId == userId && t.Project.ArchivedAt == null
                && !t.Project.Group.IsArchived
                && t.Project.Group.Members.Any(m => m.UserId == userId && m.IsActive && m.User.IsActive)
                && (t.Status != TaskStatus.Completed || (includeCompleted && t.CompletedAt >= cutoff)))
            .OrderBy(t => t.DeadlineAt ?? DateTime.MaxValue)
            .Select(t => new
            {
                t.Id, t.ProjectId, ProjectName = t.Project.Name, t.Title, t.Status, t.Priority,
                t.DeadlineAt, t.ParentTaskId,
                ParentTitle = t.ParentTask != null ? t.ParentTask.Title : null,
                GroupId = t.Project.GroupId, GroupName = t.Project.Group.Name,
                t.ProgressPercent, t.UpdatedAt, t.CompletedAt, t.CreatedByUserId, t.AssigneeUserId,
                ParentAssignee = t.ParentTask != null ? t.ParentTask.AssigneeUserId : (Guid?)null,
                ParentStatus = t.ParentTask != null ? (TaskStatus?)t.ParentTask.Status : null,
                SubtaskCount = t.Subtasks.Count,
                OpenSubtasks = t.Subtasks.Count(s => s.Status != TaskStatus.Completed)
            })
            .ToListAsync(ct);

        var roles = await _context.GroupMembers
            .Where(m => m.UserId == userId && m.IsActive)
            .ToDictionaryAsync(m => m.GroupId, m => m.Role, ct);
        var leaderGroups = roles.Where(kv => kv.Value == Role.Leader).Select(kv => kv.Key).ToList();
        var anotherLeaderGroups = leaderGroups.Count == 0 ? new HashSet<Guid>()
            : (await _context.GroupMembers
                .Where(m => leaderGroups.Contains(m.GroupId) && m.Role == Role.Leader && m.IsActive && m.UserId != userId)
                .Select(m => m.GroupId).Distinct().ToListAsync(ct)).ToHashSet();

        var now = DateTime.UtcNow;
        var thresholds = await GroupThresholdsLoader.ForGroupsAsync(_context, rows.Select(r => r.GroupId), ct);

        return rows.Select(r =>
        {
            var ctx = new TaskRuleContext(roles.GetValueOrDefault(r.GroupId, Role.Member), userId,
                r.AssigneeUserId, r.CreatedByUserId, r.ParentTaskId, r.ParentAssignee, r.Status,
                r.ParentStatus, r.SubtaskCount, r.OpenSubtasks, anotherLeaderGroups.Contains(r.GroupId));
            var flags = TaskRisk.Evaluate(r.Status, r.ParentTaskId, r.AssigneeUserId, r.DeadlineAt,
                r.ProgressPercent, r.UpdatedAt, thresholds[r.GroupId], now);
            return new MyTaskDto(r.Id, r.ProjectId, r.ProjectName, r.Title, r.Status.ToString(), r.Priority.ToString(),
                r.DeadlineAt, r.ParentTaskId, r.ParentTitle, r.GroupName, r.GroupId,
                r.ParentTaskId == null ? r.ProgressPercent : null, r.UpdatedAt, r.CompletedAt,
                TaskRules.Permissions(ctx), flags.IsAtRisk, flags.IsStale);
        }).ToList();
    }

    /// <summary>Leader-only view: per-member progress for a group.</summary>
    public async Task<GroupProgressDto> GetGroupProgressAsync(Guid userId, Guid groupId, CancellationToken ct = default)
    {
        await _access.RequireLeaderAsync(userId, groupId, ct);

        var now = DateTime.UtcNow;
        var tasks = await _context.Tasks
            .Where(t => t.Project.GroupId == groupId && t.ParentTaskId == null && t.Project.ArchivedAt == null)
            .Select(t => new { t.AssigneeUserId, Assignee = t.Assignee!.DisplayName, t.Status, t.DeadlineAt,
                t.ProgressPercent, t.UpdatedAt })
            .ToListAsync(ct);
        var activeIds = await _context.GroupMembers
            .Where(m => m.GroupId == groupId && m.IsActive)
            .Select(m => m.UserId).ToHashSetAsync(ct);
        var thresholds = await GroupThresholdsLoader.ForGroupsAsync(_context, new[] { groupId }, ct);
        var memberProgress = tasks
            .Where(t => t.AssigneeUserId != null)
            .GroupBy(t => new { t.AssigneeUserId, t.Assignee })
            .Select(g => new MemberProgressDto(
                g.Key.AssigneeUserId!.Value,
                g.Key.Assignee,
                g.Count(),
                g.Count(t => t.Status == TaskStatus.InProgress),
                g.Count(t => t.Status == TaskStatus.Submitted),
                g.Count(t => t.Status == TaskStatus.Completed),
                g.Count(t => t.Status == TaskStatus.ChangesRequested),
                g.Count(t => t.DeadlineAt != null && t.DeadlineAt < now && t.Status != TaskStatus.Completed),
                activeIds.Contains(g.Key.AssigneeUserId!.Value),
                g.Count(t => TaskRisk.Evaluate(t.Status, null, t.AssigneeUserId, t.DeadlineAt,
                    t.ProgressPercent, t.UpdatedAt, thresholds[groupId], now).IsAtRisk)))
            .ToList();
        var total = tasks.Count;
        var done = tasks.Count(t => t.Status == TaskStatus.Completed);
        var pct = total == 0 ? 0 : (int)Math.Round(done * 100.0 / total);
        var unassigned = tasks.Count(t => t.AssigneeUserId == null);
        return new GroupProgressDto(groupId, total, done, pct, unassigned, memberProgress);
    }

    /// <summary>Leader work queue: per-group counts + prioritized actionable items.</summary>
    public async Task<LeaderQueueDto> GetLeaderQueueAsync(Guid userId, CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;
        var empty = new LeaderQueueDto([], [], new LeaderQueueTotals(0, 0, 0, 0, 0, 0));

        var leaderGroups = await _context.GroupMembers
            .Where(m => m.UserId == userId && m.Role == Role.Leader && m.IsActive
                && m.User.IsActive && !m.Group.IsArchived)
            .Select(m => new { m.GroupId, GroupName = m.Group.Name })
            .ToListAsync(ct);
        if (leaderGroups.Count == 0) return empty;
        var groupIds = leaderGroups.Select(g => g.GroupId).ToList();
        var groupNames = leaderGroups.ToDictionary(g => g.GroupId, g => g.GroupName);

        var anotherLeaderGroups = (await _context.GroupMembers
                .Where(m => groupIds.Contains(m.GroupId) && m.Role == Role.Leader && m.IsActive && m.UserId != userId)
                .Select(m => m.GroupId).Distinct().ToListAsync(ct)).ToHashSet();

        // Top-level tasks in active projects of the leader's groups (one query)
        var tasks = await _context.Tasks
            .Where(t => groupIds.Contains(t.Project.GroupId) && t.ParentTaskId == null
                && t.Project.ArchivedAt == null)
            .Select(t => new
            {
                t.Id, t.Title, t.Status, t.AssigneeUserId,
                AssigneeName = t.Assignee != null ? t.Assignee.DisplayName : null,
                t.DeadlineAt, t.ProgressPercent, t.UpdatedAt,
                t.ProjectId, ProjectName = t.Project.Name, GroupId = t.Project.GroupId,
                t.CreatedByUserId, SubtaskCount = t.Subtasks.Count,
                OpenSubtasks = t.Subtasks.Count(s => s.Status != TaskStatus.Completed)
            })
            .ToListAsync(ct);

        var thresholds = await GroupThresholdsLoader.ForGroupsAsync(_context, groupIds, ct);

        var pending = await _context.MarketplaceRequests
            .Where(r => groupIds.Contains(r.GroupId) && r.Status == MarketplaceRequestStatus.Pending)
            .Select(r => new { r.Id, r.RequestType, r.RequestedByUserId, r.TargetUserId,
                RequestedByName = r.RequestedBy.DisplayName, r.GroupId, r.CreatedAt,
                TaskTitle = r.Task != null ? r.Task.Title : "Yêu cầu" })
            .ToListAsync(ct);

        var groupDtos = leaderGroups.Select(g =>
        {
            var gt = tasks.Where(t => t.GroupId == g.GroupId).ToList();
            var flags = gt.Select(t => TaskRisk.Evaluate(t.Status, null, t.AssigneeUserId, t.DeadlineAt,
                t.ProgressPercent, t.UpdatedAt, thresholds[g.GroupId], now)).ToList();
            return new LeaderQueueGroupDto(g.GroupId, g.GroupName,
                new LeaderQueueCounts(
                    gt.Count(t => t.Status == TaskStatus.ToDo),
                    gt.Count(t => t.Status == TaskStatus.InProgress),
                    gt.Count(t => t.Status == TaskStatus.Submitted),
                    gt.Count(t => t.Status == TaskStatus.ChangesRequested),
                    gt.Count(t => t.Status == TaskStatus.Completed)),
                flags.Count(f => f.IsOverdue), flags.Count(f => f.IsAtRisk), flags.Count(f => f.IsStale),
                gt.Count(t => t.AssigneeUserId == null && t.Status != TaskStatus.Completed),
                pending.Count(r => r.GroupId == g.GroupId));
        }).ToList();

        // Items: highest-priority kind wins per task
        var items = new List<(int rank, DateTime sort, LeaderQueueItemDto dto)>();
        foreach (var t in tasks)
        {
            var ctx = new TaskRuleContext(Role.Leader, userId, t.AssigneeUserId, t.CreatedByUserId,
                null, null, t.Status, null, t.SubtaskCount, t.OpenSubtasks,
                anotherLeaderGroups.Contains(t.GroupId));
            var canReview = TaskRules.AllowedTransitions(ctx).Contains(TaskStatus.Completed);
            var flags = TaskRisk.Evaluate(t.Status, null, t.AssigneeUserId, t.DeadlineAt,
                t.ProgressPercent, t.UpdatedAt, thresholds[t.GroupId], now);
            LeaderQueueItemDto Item(string kind) => new(kind, t.Id, null, t.Title, t.ProjectId, t.ProjectName,
                t.GroupId, groupNames[t.GroupId], t.AssigneeName, t.DeadlineAt,
                t.ProgressPercent, t.UpdatedAt, null, null);

            if (canReview) items.Add((0, t.DeadlineAt ?? DateTime.MaxValue, Item("Review")));
            else if (flags.IsOverdue) items.Add((2, t.DeadlineAt!.Value, Item("Overdue")));
            else if (flags.IsAtRisk) items.Add((3, t.DeadlineAt!.Value, Item("AtRisk")));
            else if (flags.IsStale) items.Add((4, t.UpdatedAt, Item("Stale")));
            else if (t.AssigneeUserId == null && t.Status != TaskStatus.Completed)
                items.Add((5, t.DeadlineAt ?? DateTime.MaxValue, Item("Unassigned")));
        }
        foreach (var r in pending)
        {
            var canReview = Services.Marketplace.MarketplaceRules.CanReview(Role.Leader, MarketplaceRequestStatus.Pending,
                r.RequestedByUserId, r.TargetUserId, userId, anotherLeaderGroups.Contains(r.GroupId));
            if (!canReview) continue;
            items.Add((1, r.CreatedAt, new LeaderQueueItemDto("Marketplace", null, r.Id, r.TaskTitle, null, null,
                r.GroupId, groupNames[r.GroupId], null, null, null, null,
                r.RequestType.ToString(), r.RequestedByName)));
        }

        var sorted = items.OrderBy(i => i.rank).ThenBy(i => i.sort).ToList();
        var totals = new LeaderQueueTotals(
            sorted.Count(i => i.dto.Kind == "Review"), sorted.Count(i => i.dto.Kind == "Marketplace"),
            sorted.Count(i => i.dto.Kind == "Overdue"), sorted.Count(i => i.dto.Kind == "AtRisk"),
            sorted.Count(i => i.dto.Kind == "Stale"), sorted.Count(i => i.dto.Kind == "Unassigned"));

        return new LeaderQueueDto(groupDtos, sorted.Take(50).Select(i => i.dto).ToList(), totals);
    }

    /// <summary>Active helper rows of the caller — tasks in non-archived groups/projects where they still belong.</summary>
    public async Task<List<HelpingTaskDto>> GetHelpingAsync(Guid userId, CancellationToken ct = default)
        => await _context.TaskHelpers
            .Where(h => h.HelperUserId == userId && h.EndedAt == null
                && h.Task.Project.ArchivedAt == null && !h.Task.Project.Group.IsArchived
                && _context.GroupMembers.Any(m => m.GroupId == h.Task.Project.GroupId && m.UserId == userId && m.IsActive))
            .OrderByDescending(h => h.CreatedAt)
            .Select(h => new HelpingTaskDto(h.Id, h.TaskId, h.Task.Title, h.Task.ProjectId, h.Task.Project.Name,
                h.Task.Project.GroupId, h.Task.Project.Group.Name,
                h.Task.Assignee != null ? h.Task.Assignee.DisplayName : null,
                h.Task.Status.ToString(), h.Task.DeadlineAt, h.Scope, h.CreatedAt))
            .ToListAsync(ct);
}
