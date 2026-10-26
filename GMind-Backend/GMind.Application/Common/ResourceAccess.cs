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
}

public sealed class ResourceAccess(IApplicationDbContext context) : IResourceAccess
{
    public async Task<GroupMember> RequireMemberAsync(Guid userId, Guid groupId, CancellationToken ct = default)
        => await context.GroupMembers.Include(m => m.Group)
            .FirstOrDefaultAsync(m => m.UserId == userId && m.GroupId == groupId && m.IsActive && m.User.IsActive && !m.Group.IsArchived, ct)
            ?? throw new ForbiddenException("Not an active member of this group");

    public async Task<GroupMember> RequireLeaderAsync(Guid userId, Guid groupId, CancellationToken ct = default)
    {
        var member = await RequireMemberAsync(userId, groupId, ct);
        if (member.Role != Role.Leader) throw new ForbiddenException("Leader role required");
        return member;
    }

    public async Task<TaskEntity> RequireTaskDetailsAsync(Guid userId, Guid taskId, CancellationToken ct = default)
    {
        var task = await context.Tasks.Include(t => t.Project)
            .FirstOrDefaultAsync(t => t.Id == taskId && t.Project.ArchivedAt == null, ct)
            ?? throw new NotFoundException("Task not found");
        var member = await RequireMemberAsync(userId, task.Project.GroupId, ct);
        if (member.Role != Role.Leader && task.AssigneeUserId != userId)
            throw new ForbiddenException("Only the leader or assignee can access task details");
        return task;
    }
}
