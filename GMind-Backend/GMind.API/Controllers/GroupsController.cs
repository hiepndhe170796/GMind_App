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

    [HttpGet("archived")]
    public async Task<IActionResult> ArchivedGroups(CancellationToken ct)
        => Ok(await _groups.ListArchivedGroupsAsync(User.GetUserId(), ct));

    [HttpPost("{id:guid}/archive")]
    public async Task<IActionResult> ArchiveGroup(Guid id, [FromBody] ArchiveGroupRequest req, CancellationToken ct)
    {
        await _groups.ArchiveGroupAsync(User.GetUserId(), id, req.ConfirmName, ct);
        return Ok(new { message = "Group archived" });
    }

    [HttpPost("{id:guid}/restore")]
    public async Task<IActionResult> RestoreGroup(Guid id, CancellationToken ct)
    {
        await _groups.RestoreGroupAsync(User.GetUserId(), id, ct);
        return Ok(new { message = "Group restored" });
    }

    [HttpGet("{id:guid}/invites")]
    public async Task<IActionResult> ListInvites(Guid id, CancellationToken ct)
        => Ok(await _groups.ListInvitesAsync(User.GetUserId(), id, ct));

    [HttpPost("{id:guid}/invites")]
    public async Task<IActionResult> CreateInvite(Guid id, [FromBody] CreateInviteRequest? req, CancellationToken ct)
        => Ok(await _groups.CreateInviteAsync(User.GetUserId(), id, req?.Label, req?.ExpiresAt, req?.MaxUses, ct));

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

    [HttpGet("{id:guid}/activity-log")]
    public async Task<IActionResult> ActivityLog(Guid id, [FromQuery] Guid? actorId, [FromQuery] Guid? projectId,
        [FromQuery] string? category, [FromQuery] string? from, [FromQuery] string? to,
        [FromQuery] string? cursor, [FromQuery] int take = 30, CancellationToken ct = default)
        => Ok(await _groups.GetActivityLogAsync(User.GetUserId(), id, actorId, projectId, category, from, to, cursor, take, ct));

    [HttpGet("{id:guid}/activity-log/filters")]
    public async Task<IActionResult> ActivityLogFilters(Guid id, CancellationToken ct)
        => Ok(await _groups.GetActivityLogFiltersAsync(User.GetUserId(), id, ct));

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

    [HttpGet("{id:guid}/settings")]
    public async Task<IActionResult> GetSettings(Guid id, CancellationToken ct)
        => Ok(await _groups.GetSettingsAsync(User.GetUserId(), id, ct));

    [HttpPut("{id:guid}/settings")]
    public async Task<IActionResult> UpdateSettings(Guid id, [FromBody] GroupSettingsRequest req, CancellationToken ct)
        => Ok(await _groups.UpdateSettingsAsync(User.GetUserId(), id, req.RiskHoursBeforeDeadline, req.RiskProgressBelowPercent, req.StaleAfterHours, ct));

    [HttpGet("{id:guid}/members/{memberUserId:guid}/overview")]
    public async Task<IActionResult> MemberOverview(Guid id, Guid memberUserId, CancellationToken ct)
        => Ok(await _groups.GetMemberOverviewAsync(User.GetUserId(), id, memberUserId, ct));
}

public class CreateGroupRequest
{
    [Required(ErrorMessage = "Vui lòng nhập tên nhóm."), MaxLength(200, ErrorMessage = "Tên nhóm tối đa 200 ký tự.")]
    public string Name { get; set; } = string.Empty;
    [MaxLength(1000, ErrorMessage = "Mô tả nhóm tối đa 1000 ký tự.")]
    public string? Description { get; set; }
}

public class CreateInviteRequest
{
    [MaxLength(100, ErrorMessage = "Nhãn mã mời tối đa 100 ký tự.")]
    public string? Label { get; set; }
    public DateTime? ExpiresAt { get; set; }
    [Range(1, 500, ErrorMessage = "Số lượt dùng phải từ 1 đến 500.")]
    public int? MaxUses { get; set; }
}

public class ArchiveGroupRequest
{
    [Required(ErrorMessage = "Vui lòng nhập tên nhóm để xác nhận.")]
    public string ConfirmName { get; set; } = string.Empty;
}

public class JoinRequest
{
    [Required(ErrorMessage = "Vui lòng nhập mã mời.")]
    public string Code { get; set; } = string.Empty;
}

public class ChangeRoleRequest
{
    [Required(ErrorMessage = "Vui lòng chọn vai trò.")]
    [EnumDataType(typeof(Role), ErrorMessage = "Vai trò không hợp lệ.")]
    public Role Role { get; set; }
}

public class GroupSettingsRequest
{
    [Range(1, 168, ErrorMessage = "Số giờ cảnh báo trước hạn phải từ 1 đến 168.")]
    public int RiskHoursBeforeDeadline { get; set; } = 8;
    [Range(1, 100, ErrorMessage = "Ngưỡng phần trăm tiến độ phải từ 1 đến 100.")]
    public int RiskProgressBelowPercent { get; set; } = 70;
    [Range(1, 720, ErrorMessage = "Số giờ đình trệ phải từ 1 đến 720.")]
    public int StaleAfterHours { get; set; } = 24;
}
