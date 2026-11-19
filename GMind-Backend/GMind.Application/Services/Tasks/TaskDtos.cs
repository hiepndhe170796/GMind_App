using System.Text.Json.Serialization;

namespace GMind.Application.Services.Tasks;

[JsonDerivedType(typeof(TaskDetailDto))]
public record TaskSummaryDto(Guid Id, Guid ProjectId, Guid? ParentTaskId, string Title,
    Guid? AssigneeUserId, string? AssigneeName, string Status, string Priority,
    DateTime? DeadlineAt, bool CanViewDetails, bool CanReview = false);

public record TaskDetailDto(Guid Id, Guid ProjectId, Guid? ParentTaskId, string Title,
    Guid? AssigneeUserId, string? AssigneeName, string Status, string Priority,
    DateTime? DeadlineAt, string? Description, decimal? EstimateHours, int? Points,
    int ProgressPercent, Guid CreatedByUserId, DateTime CreatedAt, DateTime? SubmittedAt, DateTime? CompletedAt, bool CanReview = false)
    : TaskSummaryDto(Id, ProjectId, ParentTaskId, Title, AssigneeUserId, AssigneeName, Status, Priority, DeadlineAt, true, CanReview);
