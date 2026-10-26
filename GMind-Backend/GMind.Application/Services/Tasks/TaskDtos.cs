using System.Text.Json.Serialization;

namespace GMind.Application.Services.Tasks;

[JsonDerivedType(typeof(TaskDetailDto))]
public record TaskSummaryDto(Guid Id, Guid ProjectId, Guid? ParentTaskId, string Title,
    Guid? AssigneeUserId, string? AssigneeName, string Status, string Priority,
    DateTime? DeadlineAt, bool CanViewDetails);

public record TaskDetailDto(Guid Id, Guid ProjectId, Guid? ParentTaskId, string Title,
    Guid? AssigneeUserId, string? AssigneeName, string Status, string Priority,
    DateTime? DeadlineAt, string? Description, decimal? EstimateHours, int? Points,
    int ProgressPercent, Guid CreatedByUserId, DateTime CreatedAt, DateTime? SubmittedAt, DateTime? CompletedAt)
    : TaskSummaryDto(Id, ProjectId, ParentTaskId, Title, AssigneeUserId, AssigneeName, Status, Priority, DeadlineAt, true);
