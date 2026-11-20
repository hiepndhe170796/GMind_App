using GMind.Application.Common;
using GMind.Application.Common.Exceptions;
using GMind.Domain.Entities;
using GMind.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Task = System.Threading.Tasks.Task;

namespace GMind.Application.Services.Tasks;

public interface ITaskDetailService
{
    Task<CommentDto> AddCommentAsync(Guid userId, Guid taskId, string body, CancellationToken ct = default);
    Task<CommentDto> UpdateCommentAsync(Guid userId, Guid commentId, string body, CancellationToken ct = default);
    Task DeleteCommentAsync(Guid userId, Guid commentId, CancellationToken ct = default);
    Task<List<CommentDto>> ListCommentsAsync(Guid userId, Guid taskId, CancellationToken ct = default);
    Task<LinkDto> AddLinkAsync(Guid userId, Guid taskId, string url, string? displayName, string? type, CancellationToken ct = default);
    Task DeleteLinkAsync(Guid userId, Guid linkId, CancellationToken ct = default);
    Task<List<LinkDto>> ListLinksAsync(Guid userId, Guid taskId, CancellationToken ct = default);
    Task<List<LinkDto>> ListProjectLinksAsync(Guid userId, Guid projectId, CancellationToken ct = default);
    Task<LinkDto> AddProjectLinkAsync(Guid userId, Guid projectId, string url, string? displayName, string? type, CancellationToken ct = default);
    Task<List<ReviewDto>> ListReviewsAsync(Guid userId, Guid taskId, CancellationToken ct = default);
    Task<List<SubmissionDto>> ListSubmissionsAsync(Guid userId, Guid taskId, CancellationToken ct = default);
}

public record CommentDto(Guid Id, Guid TaskId, Guid AuthorUserId, string AuthorName, string Body,
    DateTime CreatedAt, bool IsMine, DateTime? UpdatedAt = null, bool CanEdit = false, bool CanDelete = false);
public record LinkDto(Guid Id, Guid? TaskId, string Url, string? DisplayName, string? Type,
    DateTime CreatedAt, Guid? ProjectId = null, string? CreatedByName = null,
    Guid? CreatedByUserId = null, bool CanDelete = false);
public record ReviewDto(Guid Id, string ReviewerName, string Decision, string? Comment, int SubmissionVersion, DateTime CreatedAt);
public record SubmissionDto(Guid Id, int Version, string SubmittedByName, string? Note, DateTime CreatedAt);

public class TaskDetailService : ITaskDetailService
{
    private readonly IApplicationDbContext _context;
    private readonly IResourceAccess _access;

    public TaskDetailService(IApplicationDbContext context, IResourceAccess access)
    {
        _context = context;
        _access = access;
    }

    public async Task<CommentDto> AddCommentAsync(Guid userId, Guid taskId, string body, CancellationToken ct = default)
    {
        await _access.RequireTaskDetailsAsync(userId, taskId, ct);
        if (string.IsNullOrWhiteSpace(body) || body.Length > 2000) throw new BadRequestException("Vui lòng nhập nội dung bình luận.");

        var comment = new TaskComment
        {
            Id = Guid.NewGuid(),
            TaskId = taskId,
            AuthorUserId = userId,
            Body = body.Trim()
        };
        _context.TaskComments.Add(comment);
        await _context.SaveChangesAsync(ct);

        var name = await _context.Users.Where(u => u.Id == userId).Select(u => u.DisplayName).FirstAsync(ct);
        return new CommentDto(comment.Id, taskId, userId, name, comment.Body, comment.CreatedAt, true,
            comment.UpdatedAt, true, true);
    }

    public async Task<CommentDto> UpdateCommentAsync(Guid userId, Guid commentId, string body, CancellationToken ct = default)
    {
        var c = await _context.TaskComments.Include(x => x.Task).ThenInclude(t => t.Project)
            .FirstOrDefaultAsync(x => x.Id == commentId && x.DeletedAt == null, ct)
            ?? throw new NotFoundException("Không tìm thấy bình luận này.");
        await _access.RequireTaskDetailsAsync(userId, c.TaskId, ct);
        if (c.AuthorUserId != userId) throw new ForbiddenException("Chỉ tác giả mới có thể sửa bình luận này.");
        if (string.IsNullOrWhiteSpace(body) || body.Length > 2000) throw new BadRequestException("Vui lòng nhập nội dung bình luận.");
        c.Body = body.Trim();
        c.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync(ct);
        var name = await _context.Users.Where(u => u.Id == userId).Select(u => u.DisplayName).FirstAsync(ct);
        return new CommentDto(c.Id, c.TaskId, userId, name, c.Body, c.CreatedAt, true, c.UpdatedAt, true, true);
    }

    public async Task DeleteCommentAsync(Guid userId, Guid commentId, CancellationToken ct = default)
    {
        var c = await _context.TaskComments.Include(x => x.Task).ThenInclude(t => t.Project)
            .FirstOrDefaultAsync(x => x.Id == commentId && x.DeletedAt == null, ct)
            ?? throw new NotFoundException("Không tìm thấy bình luận này.");
        await _access.RequireTaskDetailsAsync(userId, c.TaskId, ct);
        var membership = await _access.RequireMemberAsync(userId, c.Task.Project.GroupId, ct);
        if (c.AuthorUserId != userId && membership.Role != Role.Leader)
            throw new ForbiddenException("Chỉ tác giả hoặc Trưởng nhóm mới có thể xóa bình luận này.");
        c.DeletedAt = DateTime.UtcNow; // soft delete
        await _context.SaveChangesAsync(ct);
    }

    public async Task<List<CommentDto>> ListCommentsAsync(Guid userId, Guid taskId, CancellationToken ct = default)
    {
        var task = await _access.RequireTaskDetailsAsync(userId, taskId, ct);
        var membership = await _access.RequireMemberAsync(userId, task.Project.GroupId, ct);
        var isLeader = membership.Role == Role.Leader;
        return await _context.TaskComments
            .Where(c => c.TaskId == taskId && c.DeletedAt == null)
            .OrderBy(c => c.CreatedAt)
            .Select(c => new CommentDto(c.Id, c.TaskId, c.AuthorUserId, c.Author.DisplayName, c.Body, c.CreatedAt,
                c.AuthorUserId == userId, c.UpdatedAt, c.AuthorUserId == userId,
                c.AuthorUserId == userId || isLeader))
            .ToListAsync(ct);
    }

    public async Task<LinkDto> AddLinkAsync(Guid userId, Guid taskId, string url, string? displayName, string? type, CancellationToken ct = default)
    {
        var task = await _access.RequireTaskContributorAsync(userId, taskId, ct);
        var link = CreateLink(url, displayName, type, task.ProjectId, taskId, userId);
        _context.TaskLinks.Add(link);
        _context.ActivityLogs.Add(Log(userId, task.Project.GroupId, task.ProjectId, "TaskLink", link.Id, "AddLink",
            $"Thêm tài liệu '{link.DisplayName ?? link.Url}' vào công việc '{task.Title}'"));
        await _context.SaveChangesAsync(ct);
        var name = await _context.Users.Where(u => u.Id == userId).Select(u => u.DisplayName).FirstAsync(ct);
        return new LinkDto(link.Id, taskId, link.Url, link.DisplayName, link.Type, link.CreatedAt,
            task.ProjectId, name, userId, true);
    }

    public async Task DeleteLinkAsync(Guid userId, Guid linkId, CancellationToken ct = default)
    {
        var l = await _context.TaskLinks.Include(x => x.Project)
            .FirstOrDefaultAsync(x => x.Id == linkId, ct)
            ?? throw new NotFoundException("Không tìm thấy liên kết này.");
        if (l.TaskId != null)
        {
            await _access.RequireTaskDetailsAsync(userId, l.TaskId.Value, ct);
        }
        else if (l.Project.ArchivedAt != null)
        {
            throw new NotFoundException("Không tìm thấy liên kết này.");
        }
        var membership = await _access.RequireMemberAsync(userId, l.Project.GroupId, ct);
        if (l.CreatedByUserId != userId && membership.Role != Role.Leader)
            throw new ForbiddenException("Chỉ người tạo hoặc Trưởng nhóm mới có thể xóa liên kết này.");
        _context.ActivityLogs.Add(Log(userId, l.Project.GroupId, l.ProjectId, "TaskLink", l.Id, "DeleteLink",
            $"Xóa tài liệu '{l.DisplayName ?? l.Url}'"));
        _context.TaskLinks.Remove(l);
        await _context.SaveChangesAsync(ct);
    }

    public async Task<List<LinkDto>> ListLinksAsync(Guid userId, Guid taskId, CancellationToken ct = default)
    {
        var task = await _access.RequireTaskDetailsAsync(userId, taskId, ct);
        var membership = await _access.RequireMemberAsync(userId, task.Project.GroupId, ct);
        var isLeader = membership.Role == Role.Leader;
        return await _context.TaskLinks.Where(l => l.TaskId == taskId)
            .OrderByDescending(l => l.CreatedAt)
            .Select(l => new LinkDto(l.Id, taskId, l.Url, l.DisplayName, l.Type, l.CreatedAt, l.ProjectId,
                l.CreatedBy.DisplayName, l.CreatedByUserId, l.CreatedByUserId == userId || isLeader))
            .ToListAsync(ct);
    }

    public async Task<List<LinkDto>> ListProjectLinksAsync(Guid userId, Guid projectId, CancellationToken ct = default)
    {
        var project = await _context.Projects.FirstOrDefaultAsync(p => p.Id == projectId && p.ArchivedAt == null, ct)
            ?? throw new NotFoundException("Không tìm thấy dự án này.");
        var membership = await _access.RequireMemberAsync(userId, project.GroupId, ct);
        var isLeader = membership.Role == Role.Leader;
        return await _context.TaskLinks.Where(l => l.ProjectId == projectId && l.TaskId == null)
            .OrderByDescending(l => l.CreatedAt)
            .Select(l => new LinkDto(l.Id, null, l.Url, l.DisplayName, l.Type, l.CreatedAt, l.ProjectId,
                l.CreatedBy.DisplayName, l.CreatedByUserId, l.CreatedByUserId == userId || isLeader))
            .ToListAsync(ct);
    }

    public async Task<LinkDto> AddProjectLinkAsync(Guid userId, Guid projectId, string url, string? displayName, string? type, CancellationToken ct = default)
    {
        var project = await _context.Projects.FirstOrDefaultAsync(p => p.Id == projectId && p.ArchivedAt == null, ct)
            ?? throw new NotFoundException("Không tìm thấy dự án này.");
        await _access.RequireMemberAsync(userId, project.GroupId, ct);
        var link = CreateLink(url, displayName, type, projectId, null, userId);
        _context.TaskLinks.Add(link);
        _context.ActivityLogs.Add(Log(userId, project.GroupId, projectId, "TaskLink", link.Id, "AddLink",
            $"Thêm tài liệu '{link.DisplayName ?? link.Url}' vào dự án '{project.Name}'"));
        await _context.SaveChangesAsync(ct);
        var name = await _context.Users.Where(u => u.Id == userId).Select(u => u.DisplayName).FirstAsync(ct);
        return new LinkDto(link.Id, null, link.Url, link.DisplayName, link.Type, link.CreatedAt,
            projectId, name, userId, true);
    }

    private static TaskLink CreateLink(string url, string? displayName, string? type, Guid projectId, Guid? taskId, Guid userId)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || (uri.Scheme != "http" && uri.Scheme != "https"))
            throw new BadRequestException("Chỉ chấp nhận liên kết http(s) đầy đủ.");
        var name = string.IsNullOrWhiteSpace(displayName) ? null : displayName.Trim();
        return new TaskLink
        {
            Id = Guid.NewGuid(),
            ProjectId = projectId,
            TaskId = taskId,
            Url = url.Trim(),
            DisplayName = name,
            Type = type,
            CreatedByUserId = userId
        };
    }

    public async Task<List<ReviewDto>> ListReviewsAsync(Guid userId, Guid taskId, CancellationToken ct = default)
    {
        await _access.RequireTaskDetailsAsync(userId, taskId, ct);
        return await _context.TaskReviews.Where(r => r.TaskId == taskId)
            .OrderByDescending(r => r.CreatedAt)
            .Select(r => new ReviewDto(r.Id, r.Reviewer.DisplayName, r.Decision.ToString(), r.Comment, r.SubmissionVersion, r.CreatedAt))
            .ToListAsync(ct);
    }

    public async Task<List<SubmissionDto>> ListSubmissionsAsync(Guid userId, Guid taskId, CancellationToken ct = default)
    {
        await _access.RequireTaskDetailsAsync(userId, taskId, ct);
        return await _context.TaskSubmissions.Where(s => s.TaskId == taskId)
            .OrderByDescending(s => s.Version)
            .Select(s => new SubmissionDto(s.Id, s.Version, s.SubmittedBy.DisplayName, s.Note, s.CreatedAt))
            .ToListAsync(ct);
    }

    private static ActivityLog Log(Guid actor, Guid groupId, Guid projectId, string entityType, Guid? entityId, string action, string summary)
        => new() { Id = Guid.NewGuid(), ActorUserId = actor, GroupId = groupId, ProjectId = projectId, EntityType = entityType, Action = action, Summary = summary };
}
