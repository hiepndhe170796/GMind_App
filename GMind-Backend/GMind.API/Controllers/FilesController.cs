using GMind.API.Common;
using GMind.Application.Common;
using GMind.Application.Services.Files;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace GMind.API.Controllers;

[ApiController]
[Route("api")]
[Authorize]
public class FilesController : ControllerBase
{
    private const long UploadLimit = StorageOptions.DefaultMaxFileBytes + 65_536;

    private readonly IFileService _files;

    public FilesController(IFileService files) => _files = files;

    [HttpGet("projects/{id:guid}/files")]
    public async Task<IActionResult> ListProjectFiles(Guid id, CancellationToken ct)
        => Ok(await _files.ListProjectFilesAsync(User.GetUserId(), id, ct));

    [HttpPost("projects/{id:guid}/files")]
    [EnableRateLimiting("uploads")]
    [RequestSizeLimit(UploadLimit)]
    public async Task<IActionResult> UploadProjectFile(Guid id, IFormFile? file, CancellationToken ct)
        => Ok(await _files.UploadProjectFileAsync(User.GetUserId(), id, Adapt(file), ct));

    [HttpGet("tasks/{id:guid}/files")]
    public async Task<IActionResult> ListTaskFiles(Guid id, CancellationToken ct)
        => Ok(await _files.ListTaskFilesAsync(User.GetUserId(), id, ct));

    [HttpPost("tasks/{id:guid}/files")]
    [EnableRateLimiting("uploads")]
    [RequestSizeLimit(UploadLimit)]
    public async Task<IActionResult> UploadTaskFile(Guid id, IFormFile? file, CancellationToken ct)
        => Ok(await _files.UploadTaskFileAsync(User.GetUserId(), id, Adapt(file), ct));

    /// <summary>Download: attachment with the sanitized original name, never sniffed or cached.</summary>
    [HttpGet("files/{id:guid}/content")]
    public async Task<IActionResult> Download(Guid id, CancellationToken ct)
    {
        var file = await _files.OpenDownloadAsync(User.GetUserId(), id, ct);
        Response.Headers.XContentTypeOptions = "nosniff";
        Response.Headers.CacheControl = "private, no-store";
        Response.Headers.ContentSecurityPolicy = "default-src 'none'; sandbox";
        return File(file.Content, file.ContentType, file.Name);
    }

    [HttpDelete("files/{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await _files.DeleteFileAsync(User.GetUserId(), id, ct);
        return Ok(new { message = "File deleted" });
    }

    /// <summary>Managed avatars are served anonymously under an unguessable id, cached for a year.</summary>
    [HttpGet("avatars/{id:guid}")]
    [AllowAnonymous]
    public async Task<IActionResult> Avatar(Guid id, CancellationToken ct)
    {
        var file = await _files.OpenAvatarAsync(id, ct);
        Response.Headers.CacheControl = "public, max-age=31536000, immutable";
        Response.Headers.XContentTypeOptions = "nosniff";
        Response.Headers.ContentSecurityPolicy = "default-src 'none'; sandbox";
        Response.Headers["Cross-Origin-Resource-Policy"] = "same-site";
        return File(file.Content, file.ContentType);
    }

    private static UploadedFile Adapt(IFormFile? file)
        => file is null
            ? throw new Application.Common.Exceptions.BadRequestException("Vui lòng chọn tệp.")
            : new UploadedFile(file.FileName, file.Length, file.OpenReadStream);
}
