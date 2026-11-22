using GMind.Application.Services.Files;

namespace GMind.Application.Services.Discussion;

public sealed record MentionDto(Guid UserId, string DisplayName);

public sealed record MessageReplyDto(Guid Id, string AuthorName, string? Excerpt, bool IsDeleted);

public sealed record MessageDto(
    Guid Id,
    Guid ProjectId,
    Guid AuthorUserId,
    string AuthorName,
    string? AuthorAvatarUrl,
    string? Body,
    DateTime CreatedAt,
    DateTime? UpdatedAt,
    bool IsDeleted,
    MessageReplyDto? ReplyTo,
    List<MentionDto> Mentions,
    List<FileDto> Attachments,
    bool IsMine,
    bool CanEdit,
    bool CanDelete);

public sealed record MessagePageDto(List<MessageDto> Items, string? NextCursor);
