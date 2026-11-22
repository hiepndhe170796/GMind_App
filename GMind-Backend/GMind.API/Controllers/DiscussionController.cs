using System.ComponentModel.DataAnnotations;
using GMind.API.Common;
using GMind.Application.Common;
using GMind.Application.Services.Discussion;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace GMind.API.Controllers;

[ApiController]
[Route("api")]
[Authorize]
public class DiscussionController : ControllerBase
{
    private const long MessageUploadLimit = 5 * StorageOptions.DefaultMaxFileBytes + 1_048_576;

    private readonly IDiscussionService _discussion;

    public DiscussionController(IDiscussionService discussion) => _discussion = discussion;

    [HttpGet("projects/{id:guid}/messages")]
    public async Task<IActionResult> List(Guid id, [FromQuery] string? cursor, [FromQuery] int take = 30, CancellationToken ct = default)
        => Ok(await _discussion.ListAsync(User.GetUserId(), id, cursor, take, ct));

    /// <summary>Multipart: body, replyToMessageId, repeated mentionUserIds, repeated files.</summary>
    [HttpPost("projects/{id:guid}/messages")]
    [EnableRateLimiting("chat-send")]
    [RequestSizeLimit(MessageUploadLimit)]
    public async Task<IActionResult> Send(Guid id, [FromForm] SendMessageRequest req, CancellationToken ct)
    {
        var files = (req.Files ?? []).Select(f => new UploadedFile(f.FileName, f.Length, f.OpenReadStream)).ToList();
        return Ok(await _discussion.SendAsync(User.GetUserId(), id, req.Body,
            req.ReplyToMessageId, req.MentionUserIds ?? [], files, ct));
    }

    [HttpPatch("messages/{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateMessageRequest req, CancellationToken ct)
        => Ok(await _discussion.UpdateAsync(User.GetUserId(), id, req.Body ?? string.Empty, req.MentionUserIds ?? [], ct));

    [HttpDelete("messages/{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await _discussion.DeleteAsync(User.GetUserId(), id, ct);
        return Ok(new { message = "Message deleted" });
    }
}

public class SendMessageRequest
{
    public string? Body { get; set; }
    public Guid? ReplyToMessageId { get; set; }
    public List<Guid>? MentionUserIds { get; set; }
    public List<IFormFile>? Files { get; set; }
}

public class UpdateMessageRequest
{
    [MaxLength(4100)]
    public string? Body { get; set; }
    public List<Guid>? MentionUserIds { get; set; }
}
