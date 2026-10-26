using System.ComponentModel.DataAnnotations;
using GMind.API.Common;
using GMind.Application.Services.Groups;
using GMind.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GMind.API.Controllers;

[ApiController]
[Route("api/groups")]
[Authorize]
public class GroupsController : ControllerBase
{
    private readonly IGroupService _groups;

    public GroupsController(IGroupService groups) => _groups = groups;

    [HttpGet]
    public async Task<IActionResult> GetMyGroups(CancellationToken ct)
        => Ok(await _groups.GetMyGroupsAsync(User.GetUserId(), ct));

    [HttpPost]
    public async Task<IActionResult> CreateGroup([FromBody] CreateGroupRequest req, CancellationToken ct)
        => Ok(await _groups.CreateGroupAsync(User.GetUserId(), req.Name, req.Description, ct));

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetGroup(Guid id, CancellationToken ct)
        => Ok(await _groups.GetGroupAsync(User.GetUserId(), id, ct));

    [HttpPatch("{id:guid}")]
    public async Task<IActionResult> UpdateGroup(Guid id, [FromBody] CreateGroupRequest req, CancellationToken ct)
        => Ok(await _groups.UpdateGroupAsync(User.GetUserId(), id, req.Name, req.Description, ct));

    [HttpPost("{id:guid}/invites")]
    public async Task<IActionResult> CreateInvite(Guid id, [FromBody] CreateInviteRequest? req, CancellationToken ct)
        => Ok(await _groups.CreateInviteAsync(User.GetUserId(), id, req?.ExpiresAt, req?.MaxUses, ct));

    [HttpDelete("invites/{inviteId:guid}")]
    public async Task<IActionResult> RevokeInvite(Guid inviteId, CancellationToken ct)
    {
        await _groups.RevokeInviteAsync(User.GetUserId(), inviteId, ct);
        return Ok(new { message = "Invite revoked" });
    }

    [HttpPost("join")]
    public async Task<IActionResult> JoinByCode([FromBody] JoinRequest req, CancellationToken ct)
        => Ok(await _groups.JoinByCodeAsync(User.GetUserId(), req.Code, ct));

    [HttpGet("{id:guid}/members")]
    public async Task<IActionResult> GetMembers(Guid id, CancellationToken ct)
        => Ok(await _groups.GetMembersAsync(User.GetUserId(), id, ct));

    [HttpGet("{id:guid}/activity")]
    public async Task<IActionResult> GetActivity(Guid id, [FromQuery] int take = 50, CancellationToken ct = default)
        => Ok(await _groups.GetActivityAsync(User.GetUserId(), id, take, ct));

    [HttpDelete("{id:guid}/members/{memberUserId:guid}")]
    public async Task<IActionResult> RemoveMember(Guid id, Guid memberUserId, CancellationToken ct)
    {
        await _groups.RemoveMemberAsync(User.GetUserId(), id, memberUserId, ct);
        return Ok(new { message = "Member removed" });
    }

    [HttpPatch("{id:guid}/members/{memberUserId:guid}")]
    public async Task<IActionResult> ChangeRole(Guid id, Guid memberUserId, [FromBody] ChangeRoleRequest req, CancellationToken ct)
    {
        await _groups.ChangeMemberRoleAsync(User.GetUserId(), id, memberUserId, req.Role, ct);
        return Ok(new { message = "Role updated" });
    }

    [HttpPost("{id:guid}/leave")]
    public async Task<IActionResult> LeaveGroup(Guid id, CancellationToken ct)
    {
        await _groups.LeaveGroupAsync(User.GetUserId(), id, ct);
        return Ok(new { message = "Left group" });
    }
}

public class CreateGroupRequest
{
    [Required, MaxLength(200)]
    public string Name { get; set; } = string.Empty;
    [MaxLength(1000)]
    public string? Description { get; set; }
}

public class CreateInviteRequest
{
    public DateTime? ExpiresAt { get; set; }
    public int? MaxUses { get; set; }
}

public class JoinRequest
{
    [Required]
    public string Code { get; set; } = string.Empty;
}

public class ChangeRoleRequest
{
    [Required]
    [EnumDataType(typeof(Role))]
    public Role Role { get; set; }
}
