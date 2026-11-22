using GMind.Application.Common;
using GMind.Application.DTOs;

namespace GMind.Application.Services.Files;

public interface IFileService
{
    Task<List<FileDto>> ListProjectFilesAsync(Guid userId, Guid projectId, CancellationToken ct = default);
    Task<FileDto> UploadProjectFileAsync(Guid userId, Guid projectId, UploadedFile file, CancellationToken ct = default);
    Task<List<FileDto>> ListTaskFilesAsync(Guid userId, Guid taskId, CancellationToken ct = default);
    Task<FileDto> UploadTaskFileAsync(Guid userId, Guid taskId, UploadedFile file, CancellationToken ct = default);
    Task DeleteFileAsync(Guid userId, Guid fileId, CancellationToken ct = default);
    Task<FileDownload> OpenDownloadAsync(Guid userId, Guid fileId, CancellationToken ct = default);
    Task<UserDto> SetAvatarAsync(Guid userId, UploadedFile file, CancellationToken ct = default);
    Task<UserDto> ClearAvatarAsync(Guid userId, CancellationToken ct = default);
    Task<FileDownload> OpenAvatarAsync(Guid fileId, CancellationToken ct = default);
}
