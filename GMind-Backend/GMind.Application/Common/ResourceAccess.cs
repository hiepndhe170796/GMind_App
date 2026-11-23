using GMind.Application.Common.Exceptions;
using GMind.Domain.Entities;
using GMind.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using TaskEntity = GMind.Domain.Entities.Task;
using Task = System.Threading.Tasks.Task;

namespace GMind.Application.Common;

public interface IResourceAccess
{
    Task<GroupMember> RequireMemberAsync(Guid userId, Guid groupId, CancellationToken ct = default);
    Task<GroupMember> RequireLeaderAsync(Guid userId, Guid groupId, CancellationToken ct = default);
    Task<TaskEntity> RequireTaskDetailsAsync(Guid userId, Guid taskId, CancellationToken ct = default);
    Task<TaskEntity> RequireTaskContributorAsync(Guid userId, Guid taskId, CancellationToken ct = default);
    Task<bool> CanReviewOwnAsync(Guid groupId, Guid reviewerId, Guid ownerId, CancellationToken ct = default);
}

public sealed class ResourceAccess(IApplicationDbContext context) : IResourceAccess
{
    public async Task<GroupMember> RequireMemberAsync(Guid userId, Guid groupId, CancellationToken ct = default)
        => await context.GroupMembers.Include(m => m.Group)
            .FirstOrDefaultAsync(m => m.UserId == userId && m.GroupId == groupId && m.IsActive && m.User.IsActive && !m.Group.IsArchived, ct)
            ?? throw new ForbiddenException("Bạn không còn là thành viên của nhóm này.");

    public async Task<GroupMember> RequireLeaderAsync(Guid userId, Guid groupId, CancellationToken ct = default)
    {
        var member = await RequireMemberAsync(userId, groupId, ct);
        if (member.Role != Role.Leader) throw new ForbiddenException("Bạn cần quyền Trưởng nhóm để thực hiện thao tác này.");
        return member;
    }

    public async Task<TaskEntity> RequireTaskDetailsAsync(Guid userId, Guid taskId, CancellationToken ct = default)
    {
        var task = await context.Tasks.Include(t => t.Project)
            .FirstOrDefaultAsync(t => t.Id == taskId && t.Project.ArchivedAt == null, ct)
            ?? throw new NotFoundException("Không tìm thấy công việc này.");
        var member = await RequireMemberAsync(userId, task.Project.GroupId, ct);
        if (member.Role != Role.Leader && task.AssigneeUserId != userId)
        {
            // The parent task's assignee can view a subtask's details (and its sub-resources).
            var parentAssignee = task.ParentTaskId == null ? (Guid?)null
                : await context.Tasks.Where(t => t.Id == task.ParentTaskId)
                    .Select(t => t.AssigneeUserId).FirstOrDefaultAsync(ct);
            // An approved helper may view this exact task (view + comment only).
            var isHelper = parentAssignee != userId
                && await context.TaskHelpers.AnyAsync(h => h.TaskId == taskId && h.HelperUserId == userId && h.EndedAt == null, ct);
            if (parentAssignee != userId && !isHelper)
                throw new ForbiddenException("Chỉ Trưởng nhóm hoặc người phụ trách mới xem được chi tiết công việc này.");
        }
        return task;
    }

    /// <summary>Detail access WITHOUT the helper exception — helpers get view + comment only.</summary>
    public async Task<TaskEntity> RequireTaskContributorAsync(Guid userId, Guid taskId, CancellationToken ct = default)
    {
        var task = await context.Tasks.Include(t => t.Project)
            .FirstOrDefaultAsync(t => t.Id == taskId && t.Project.ArchivedAt == null, ct)
            ?? throw new NotFoundException("Không tìm thấy công việc này.");
        var member = await RequireMemberAsync(userId, task.Project.GroupId, ct);
        if (member.Role != Role.Leader && task.AssigneeUserId != userId)
        {
            var parentAssignee = task.ParentTaskId == null ? (Guid?)null
                : await context.Tasks.Where(t => t.Id == task.ParentTaskId)
                    .Select(t => t.AssigneeUserId).FirstOrDefaultAsync(ct);
            if (parentAssignee != userId)
            {
                var isHelper = await context.TaskHelpers
                    .AnyAsync(h => h.TaskId == taskId && h.HelperUserId == userId && h.EndedAt == null, ct);
                throw new ForbiddenException(isHelper
                    ? "Người hỗ trợ chỉ được xem và bình luận."
                    : "Chỉ Trưởng nhóm hoặc người phụ trách mới thực hiện được thao tác này.");
            }
        }
        return task;
    }

    // A Leader may not review their own work when another active Leader exists in the group.
    public async Task<bool> CanReviewOwnAsync(Guid groupId, Guid reviewerId, Guid ownerId, CancellationToken ct = default)
    {
        if (reviewerId != ownerId) return true;
        return !await context.GroupMembers
            .AnyAsync(m => m.GroupId == groupId && m.Role == Role.Leader && m.IsActive && m.UserId != reviewerId, ct);
    }
}
