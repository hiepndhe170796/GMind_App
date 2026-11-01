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
    Task<List<ReviewDto>> ListReviewsAsync(Guid userId, Guid taskId, CancellationToken ct = default);
}

public record CommentDto(Guid Id, Guid TaskId, Guid AuthorUserId, string AuthorName, string Body, DateTime CreatedAt, bool IsMine);
public record LinkDto(Guid Id, Guid TaskId, string Url, string? DisplayName, string? Type, DateTime CreatedAt);
public record ReviewDto(Guid Id, string ReviewerName, string Decision, string? Comment, int SubmissionVersion, DateTime CreatedAt);

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
        if (string.IsNullOrWhiteSpace(body) || body.Length > 2000) throw new BadRequestException("Comment body is required");

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
        return new CommentDto(comment.Id, taskId, userId, name, comment.Body, comment.CreatedAt, true);
    }

    public async Task<CommentDto> UpdateCommentAsync(Guid userId, Guid commentId, string body, CancellationToken ct = default)
    {
        var c = await _context.TaskComments.Include(x => x.Task).ThenInclude(t => t.Project)
            .FirstOrDefaultAsync(x => x.Id == commentId && x.DeletedAt == null, ct)
            ?? throw new NotFoundException("Comment not found");
        await _access.RequireTaskDetailsAsync(userId, c.TaskId, ct);
        if (c.AuthorUserId != userId) throw new ForbiddenException("Only the author can edit a comment");
        if (string.IsNullOrWhiteSpace(body) || body.Length > 2000) throw new BadRequestException("Comment body is required");
        c.Body = body.Trim();
        c.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync(ct);
        var name = await _context.Users.Where(u => u.Id == userId).Select(u => u.DisplayName).FirstAsync(ct);
        return new CommentDto(c.Id, c.TaskId, userId, name, c.Body, c.CreatedAt, true);
    }

    public async Task DeleteCommentAsync(Guid userId, Guid commentId, CancellationToken ct = default)
    {
        var c = await _context.TaskComments.Include(x => x.Task).ThenInclude(t => t.Project)
            .FirstOrDefaultAsync(x => x.Id == commentId && x.DeletedAt == null, ct)
            ?? throw new NotFoundException("Comment not found");
        await _access.RequireTaskDetailsAsync(userId, c.TaskId, ct);
        var membership = await _access.RequireMemberAsync(userId, c.Task.Project.GroupId, ct);
        if (c.AuthorUserId != userId && membership.Role != Role.Leader)
            throw new ForbiddenException("Only the author or a leader can delete a comment");
        c.DeletedAt = DateTime.UtcNow; // soft delete
        await _context.SaveChangesAsync(ct);
    }

    public async Task<List<CommentDto>> ListCommentsAsync(Guid userId, Guid taskId, CancellationToken ct = default)
    {
        await _access.RequireTaskDetailsAsync(userId, taskId, ct);
        return await _context.TaskComments
            .Where(c => c.TaskId == taskId && c.DeletedAt == null)
            .OrderBy(c => c.CreatedAt)
            .Select(c => new CommentDto(c.Id, c.TaskId, c.AuthorUserId, c.Author.DisplayName, c.Body, c.CreatedAt, c.AuthorUserId == userId))
            .ToListAsync(ct);
    }

    public async Task<LinkDto> AddLinkAsync(Guid userId, Guid taskId, string url, string? displayName, string? type, CancellationToken ct = default)
    {
        var task = await _access.RequireTaskDetailsAsync(userId, taskId, ct);
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || (uri.Scheme != "http" && uri.Scheme != "https"))
            throw new BadRequestException("Only absolute http(s) URLs are allowed");

        var link = new TaskLink
        {
            Id = Guid.NewGuid(),
            ProjectId = task.ProjectId,
            TaskId = taskId,
            Url = url.Trim(),
            DisplayName = displayName,
            Type = type,
            CreatedByUserId = userId
        };
        _context.TaskLinks.Add(link);
        await _context.SaveChangesAsync(ct);
        return new LinkDto(link.Id, taskId, link.Url, link.DisplayName, link.Type, link.CreatedAt);
    }

    public async Task DeleteLinkAsync(Guid userId, Guid linkId, CancellationToken ct = default)
    {
        var l = await _context.TaskLinks.Include(x => x.Project)
            .FirstOrDefaultAsync(x => x.Id == linkId, ct)
            ?? throw new NotFoundException("Link not found");
        if (l.TaskId != null)
        {
            await _access.RequireTaskDetailsAsync(userId, l.TaskId.Value, ct);
        }
        else if (l.Project.ArchivedAt != null)
        {
            throw new NotFoundException("Link not found");
        }
        var membership = await _access.RequireMemberAsync(userId, l.Project.GroupId, ct);
        if (l.CreatedByUserId != userId && membership.Role != Role.Leader)
            throw new ForbiddenException("Only the creator or a leader can delete a link");
        _context.TaskLinks.Remove(l);
        await _context.SaveChangesAsync(ct);
    }

    public async Task<List<LinkDto>> ListLinksAsync(Guid userId, Guid taskId, CancellationToken ct = default)
    {
        await _access.RequireTaskDetailsAsync(userId, taskId, ct);
        return await _context.TaskLinks.Where(l => l.TaskId == taskId)
            .OrderByDescending(l => l.CreatedAt)
            .Select(l => new LinkDto(l.Id, taskId, l.Url, l.DisplayName, l.Type, l.CreatedAt))
            .ToListAsync(ct);
    }

    public async Task<List<ReviewDto>> ListReviewsAsync(Guid userId, Guid taskId, CancellationToken ct = default)
    {
        await _access.RequireTaskDetailsAsync(userId, taskId, ct);
        return await _context.TaskReviews.Where(r => r.TaskId == taskId)
            .OrderByDescending(r => r.CreatedAt)
            .Select(r => new ReviewDto(r.Id, r.Reviewer.DisplayName, r.Decision.ToString(), r.Comment, r.SubmissionVersion, r.CreatedAt))
            .ToListAsync(ct);
    }
}
