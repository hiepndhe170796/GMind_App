using GMind.Domain.Enums;
using TaskStatus = GMind.Domain.Enums.TaskStatus;

namespace GMind.Application.Services.Tasks;

/// <summary>Inputs needed to evaluate task rules for one actor/task pair.</summary>
public record TaskRuleContext(
    Role Role, Guid UserId, Guid? AssigneeId, Guid CreatedById, Guid? ParentId,
    Guid? ParentAssigneeId, TaskStatus Status, TaskStatus? ParentStatus,
    int SubtaskCount, int OpenSubtaskCount, bool AnotherLeader, bool IsHelper = false);

/// <summary>Single source of task rules — used by service enforcement AND DTO permission projection.</summary>
public static class TaskRules
{
    private static readonly TaskStatus[] Empty = [];

    public static bool IsLeader(TaskRuleContext ctx) => ctx.Role == Role.Leader;
    private static bool IsAssignee(TaskRuleContext ctx) => ctx.AssigneeId == ctx.UserId;
    private static bool IsSubtaskActor(TaskRuleContext ctx)
        => ctx.AssigneeId == ctx.UserId || ctx.ParentAssigneeId == ctx.UserId || ctx.Role == Role.Leader;

    public static IReadOnlyList<TaskStatus> AllowedTransitions(TaskRuleContext ctx)
    {
        if (ctx.ParentId != null)
        {
            // Subtask flow: no review step; actors = subtask assignee, parent assignee, Leader.
            if (!IsSubtaskActor(ctx)) return Empty;
            return ctx.Status switch
            {
                TaskStatus.ToDo => [TaskStatus.InProgress],
                TaskStatus.InProgress => [TaskStatus.ToDo, TaskStatus.Completed],
                TaskStatus.Completed => ctx.ParentStatus is not (TaskStatus.Submitted or TaskStatus.Completed)
                    ? [TaskStatus.InProgress] : Empty,
                _ => Empty,
            };
        }

        var list = new List<TaskStatus>();
        if (IsAssignee(ctx))
        {
            switch (ctx.Status)
            {
                case TaskStatus.ToDo: list.Add(TaskStatus.InProgress); break;
                case TaskStatus.InProgress:
                    list.Add(TaskStatus.ToDo);
                    if (ctx.OpenSubtaskCount == 0) list.Add(TaskStatus.Submitted);
                    break;
                case TaskStatus.ChangesRequested: list.Add(TaskStatus.InProgress); break;
            }
        }
        // Leader review — self-review only blocked when another active Leader exists (M0 rule).
        if (ctx.Role == Role.Leader && ctx.Status == TaskStatus.Submitted
            && !(ctx.AssigneeId == ctx.UserId && ctx.AnotherLeader))
        {
            list.Add(TaskStatus.Completed);
            list.Add(TaskStatus.ChangesRequested);
        }
        return list;
    }

    public static bool CanEdit(TaskRuleContext ctx)
        => ctx.Status != TaskStatus.Completed
            && (ctx.Role == Role.Leader
                || (ctx.ParentId != null && ctx.CreatedById == ctx.UserId && ctx.ParentAssigneeId == ctx.UserId));

    public static bool CanAssign(TaskRuleContext ctx)
        => ctx.Role == Role.Leader && ctx.Status != TaskStatus.Completed;

    public static bool CanDelete(TaskRuleContext ctx)
        => ctx.Status != TaskStatus.Completed && ctx.SubtaskCount == 0
            && (ctx.Role == Role.Leader
                || (ctx.ParentId != null && ctx.CreatedById == ctx.UserId && ctx.ParentAssigneeId == ctx.UserId));

    public static bool CanUpdateProgress(TaskRuleContext ctx)
        => ctx.ParentId == null && ctx.AssigneeId == ctx.UserId && ctx.Status == TaskStatus.InProgress;

    public static bool CanAddSubtask(TaskRuleContext ctx)
        => ctx.ParentId == null && ctx.Status is not (TaskStatus.Submitted or TaskStatus.Completed)
            && (ctx.Role == Role.Leader || ctx.AssigneeId == ctx.UserId);

    public static bool CanViewDetails(TaskRuleContext ctx)
        => ctx.Role == Role.Leader || ctx.AssigneeId == ctx.UserId
            || (ctx.ParentId != null && ctx.ParentAssigneeId == ctx.UserId)
            || ctx.IsHelper;

    /// <summary>Helpers get view + comment only — links stay Leader/assignee/parent-assignee.</summary>
    public static bool CanAddLink(TaskRuleContext ctx)
        => ctx.Role == Role.Leader || ctx.AssigneeId == ctx.UserId
            || (ctx.ParentId != null && ctx.ParentAssigneeId == ctx.UserId);

    /// <summary>PROG-04: a Leader may nudge the assignee of an unfinished task (not themselves).</summary>
    public static bool CanRemind(TaskRuleContext ctx)
        => ctx.Role == Role.Leader && ctx.AssigneeId != null && ctx.AssigneeId != ctx.UserId
            && ctx.Status != TaskStatus.Completed;

    public static TaskPermissionsDto Permissions(TaskRuleContext ctx, bool remindedRecently = false)
    {
        if (!CanViewDetails(ctx)) return TaskPermissionsDto.None;
        var allowed = AllowedTransitions(ctx);
        return new TaskPermissionsDto(
            CanEdit(ctx), CanAssign(ctx), CanDelete(ctx), CanUpdateProgress(ctx), CanAddSubtask(ctx),
            allowed.Select(s => s.ToString()).ToList(), CanRemind(ctx),
            true, CanAddLink(ctx), remindedRecently && CanRemind(ctx), ctx.IsHelper);
    }
}
