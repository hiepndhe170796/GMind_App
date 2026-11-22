using GMind.Application.DTOs;

namespace GMind.Application.Services.Files;

public sealed record FileDto(
    Guid Id,
    string Kind,
    Guid? ProjectId,
    Guid? TaskId,
    Guid? MessageId,
    string Name,
    string Extension,
    string ContentType,
    long SizeBytes,
    Guid UploadedByUserId,
    string UploadedByName,
    DateTime CreatedAt,
    bool IsImage,
    bool CanDelete);

public sealed record FileDownload(Stream Content, string ContentType, string Name);
