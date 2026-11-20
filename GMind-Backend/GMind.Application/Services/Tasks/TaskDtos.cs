using System.Text.Json.Serialization;

namespace GMind.Application.Services.Tasks;

public record TaskPermissionsDto(bool CanEdit, bool CanAssign, bool CanDelete,
    bool CanUpdateProgress, bool CanAddSubtask, IReadOnlyList<string> AllowedTransitions,
    bool CanRemind = false, bool CanComment = false, bool CanAddLink = false,
    bool RemindedRecently = false, bool IsHelper = false)
{
    public static readonly TaskPermissionsDto None = new(false, false, false, false, false, []);
}

[JsonDerivedType(typeof(TaskDetailDto))]
public record TaskSummaryDto(Guid Id, Guid ProjectId, Guid? ParentTaskId, string Title,
    Guid? AssigneeUserId, string? AssigneeName, string Status, string Priority,
    DateTime? DeadlineAt, bool CanViewDetails, bool CanReview = false,
    string? ParentTitle = null, int SubtaskCount = 0, int SubtasksCompleted = 0,
    int? ProgressPercent = null, DateTime? UpdatedAt = null, int? Points = null,
    TaskPermissionsDto? Permissions = null);

public record TaskDetailDto(Guid Id, Guid ProjectId, Guid? ParentTaskId, string Title,
    Guid? AssigneeUserId, string? AssigneeName, string Status, string Priority,
    DateTime? DeadlineAt, string? Description, decimal? EstimateHours, int? Points,
    int? ProgressPercent, Guid CreatedByUserId, DateTime CreatedAt, DateTime? SubmittedAt, DateTime? CompletedAt,
    bool CanReview = false, string? ParentTitle = null, int SubtaskCount = 0, int SubtasksCompleted = 0,
    DateTime? UpdatedAt = null, TaskPermissionsDto? Permissions = null, string? CreatedByName = null)
    : TaskSummaryDto(Id, ProjectId, ParentTaskId, Title, AssigneeUserId, AssigneeName, Status, Priority,
        DeadlineAt, true, CanReview, ParentTitle, SubtaskCount, SubtasksCompleted,
        ProgressPercent, UpdatedAt, Points, Permissions);
