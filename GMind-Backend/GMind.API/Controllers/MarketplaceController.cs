using System.ComponentModel.DataAnnotations;
using GMind.API.Common;
using GMind.Application.Services.Marketplace;
using GMind.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GMind.API.Controllers;

[ApiController]
[Route("api")]
[Authorize]
public class MarketplaceController : ControllerBase
{
    private readonly IMarketplaceService _marketplace;

    public MarketplaceController(IMarketplaceService marketplace) => _marketplace = marketplace;

    [HttpPost("groups/{groupId:guid}/marketplace-requests")]
    public async Task<IActionResult> Create(Guid groupId, [FromBody] MarketplaceRequestModel req, CancellationToken ct)
        => Ok(await _marketplace.CreateAsync(User.GetUserId(), groupId, req.RequestType, req.TaskId,
            req.TargetUserId, req.RelatedTaskId, req.Reason, ct));

    [HttpGet("groups/{groupId:guid}/marketplace-requests")]
    public async Task<IActionResult> List(Guid groupId, [FromQuery] string? status, CancellationToken ct)
        => Ok(await _marketplace.ListAsync(User.GetUserId(), groupId, status, ct));

    [HttpPost("marketplace-requests/{id:guid}/approve")]
    public async Task<IActionResult> Approve(Guid id, [FromBody] ReviewRequestModel? req, CancellationToken ct)
        => Ok(await _marketplace.ApproveAsync(User.GetUserId(), id, req?.Comment, ct));

    [HttpPost("marketplace-requests/{id:guid}/reject")]
    public async Task<IActionResult> Reject(Guid id, [FromBody] ReviewRequestModel req, CancellationToken ct)
        => Ok(await _marketplace.RejectAsync(User.GetUserId(), id, req.Comment, ct));

    [HttpPost("marketplace-requests/{id:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid id, CancellationToken ct)
    {
        await _marketplace.CancelAsync(User.GetUserId(), id, ct);
        return Ok(new { message = "Request cancelled" });
    }
}

public class MarketplaceRequestModel
{
    [Required]
    public MarketplaceRequestType RequestType { get; set; }
    [Required]
    public Guid TaskId { get; set; }
    public Guid? TargetUserId { get; set; }
    public Guid? RelatedTaskId { get; set; }
    [Required, MaxLength(1000)]
    public string Reason { get; set; } = string.Empty;
}

public class ReviewRequestModel
{
    [MaxLength(1000)]
    public string Comment { get; set; } = string.Empty;
}
