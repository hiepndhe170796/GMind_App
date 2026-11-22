using GMind.Application.Common;

namespace GMind.Application.Services.Discussion;

public interface IDiscussionService
{
    Task<MessagePageDto> ListAsync(Guid userId, Guid projectId, string? cursor, int take, CancellationToken ct = default);
    Task<MessageDto> SendAsync(Guid userId, Guid projectId, string? body, Guid? replyToMessageId,
        IReadOnlyList<Guid> mentionUserIds, IReadOnlyList<UploadedFile> files, CancellationToken ct = default);
    Task<MessageDto> UpdateAsync(Guid userId, Guid messageId, string body,
        IReadOnlyList<Guid> mentionUserIds, CancellationToken ct = default);
    Task DeleteAsync(Guid userId, Guid messageId, CancellationToken ct = default);
}
