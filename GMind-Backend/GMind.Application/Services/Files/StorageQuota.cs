using GMind.Application.Common;
using GMind.Application.Common.Exceptions;
using Microsoft.EntityFrameworkCore;
using Task = System.Threading.Tasks.Task;

namespace GMind.Application.Services.Files;

/// <summary>Shared group-quota check + the "(n GB)" message format for files and discussion attachments.</summary>
internal static class StorageQuota
{
    internal static string LimitLabel(long bytes)
        => bytes % 1_073_741_824 == 0 ? $"{bytes / 1_073_741_824} GB" : $"{bytes / 1_048_576} MB";

    internal static async Task CheckAsync(IApplicationDbContext context, long quotaBytes,
        Guid groupId, long additionalBytes, CancellationToken ct)
    {
        var used = await context.StoredFiles
            .Where(f => f.GroupId == groupId && f.DeletedAt == null)
            .SumAsync(f => (long?)f.SizeBytes, ct) ?? 0;
        if (used + additionalBytes > quotaBytes)
            throw new ConflictException($"Nhóm đã dùng hết dung lượng lưu trữ ({LimitLabel(quotaBytes)}). Hãy xóa bớt tệp cũ.");
    }
}
