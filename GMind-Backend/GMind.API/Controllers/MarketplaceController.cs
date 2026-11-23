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
            req.TargetUserId, req.RelatedTaskId, req.Reason, req.HelpScope, ct));

    [HttpGet("groups/{groupId:guid}/marketplace-requests")]
    public async Task<IActionResult> List(Guid groupId, [FromQuery] string? status, CancellationToken ct)
        => Ok(await _marketplace.ListAsync(User.GetUserId(), groupId, status, ct));

    [HttpGet("groups/{groupId:guid}/marketplace/swap-candidates/{userId:guid}")]
    public async Task<IActionResult> SwapCandidates(Guid groupId, Guid userId, CancellationToken ct)
        => Ok(await _marketplace.SwapCandidatesAsync(User.GetUserId(), groupId, userId, ct));

    [HttpGet("marketplace-requests/incoming")]
    public async Task<IActionResult> Incoming(CancellationToken ct)
        => Ok(await _marketplace.IncomingAsync(User.GetUserId(), ct));

    [HttpPost("marketplace-requests/{id:guid}/respond")]
    public async Task<IActionResult> Respond(Guid id, [FromBody] RespondRequestModel req, CancellationToken ct)
        => Ok(await _marketplace.RespondAsync(User.GetUserId(), id, req.Accept, req.Comment, ct));

    [HttpPost("marketplace-requests/{id:guid}/claim")]
    public async Task<IActionResult> Claim(Guid id, [FromBody] ClaimRequestModel? req, CancellationToken ct)
        => Ok(await _marketplace.ClaimAsync(User.GetUserId(), id, req?.Note, ct));

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
    [Required(ErrorMessage = "Vui lòng chọn loại yêu cầu.")]
    [EnumDataType(typeof(MarketplaceRequestType), ErrorMessage = "Loại yêu cầu không hợp lệ.")]
    public MarketplaceRequestType RequestType { get; set; }
    [Required(ErrorMessage = "Vui lòng chọn công việc.")]
    public Guid TaskId { get; set; }
    public Guid? TargetUserId { get; set; }
    public Guid? RelatedTaskId { get; set; }
    [Required(ErrorMessage = "Vui lòng nhập lý do."), MaxLength(1000, ErrorMessage = "Lý do tối đa 1000 ký tự.")]
    public string Reason { get; set; } = string.Empty;
    [MaxLength(500, ErrorMessage = "Mô tả phần hỗ trợ tối đa 500 ký tự.")]
    public string? HelpScope { get; set; }
}

public class RespondRequestModel
{
    public bool Accept { get; set; }
    [MaxLength(1000, ErrorMessage = "Nhận xét tối đa 1000 ký tự.")]
    public string? Comment { get; set; }
}

public class ClaimRequestModel
{
    [MaxLength(1000, ErrorMessage = "Ghi chú tối đa 1000 ký tự.")]
    public string? Note { get; set; }
}

public class ReviewRequestModel
{
    [MaxLength(1000, ErrorMessage = "Nhận xét tối đa 1000 ký tự.")]
    public string Comment { get; set; } = string.Empty;
}
