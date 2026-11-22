using GMind.Application.Common;
using GMind.Application.Common.Exceptions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace GMind.Infrastructure.Storage;

/// <summary>Stores uploads on local disk outside webroot under yyyy/MM/{random} keys.</summary>
public sealed class LocalFileStorage : IFileStorage
{
    private readonly string _root;
    private readonly ILogger<LocalFileStorage> _logger;

    public LocalFileStorage(IOptions<StorageOptions> options, ILogger<LocalFileStorage> logger)
    {
        _root = Path.GetFullPath(options.Value.RootPath)
            .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        _logger = logger;
    }

    public async Task<string> SaveAsync(Stream content, long maxBytes, CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;
        var key = $"{now:yyyy}/{now:MM}/{Guid.NewGuid():N}";
        var path = SafePath(key);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var tmp = path + ".tmp";

        long written = 0;
        try
        {
            await using (var output = new FileStream(tmp, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                var buffer = new byte[81920];
                int read;
                while ((read = await content.ReadAsync(buffer, ct)) > 0)
                {
                    written += read;
                    if (written > maxBytes)
                        throw new BadRequestException($"Tệp vượt quá {maxBytes / 1_048_576} MB.");
                    await output.WriteAsync(buffer.AsMemory(0, read), ct);
                }
            }
            File.Move(tmp, path);
        }
        catch
        {
            try { if (File.Exists(tmp)) File.Delete(tmp); }
            catch (Exception ex) { _logger.LogWarning(ex, "Failed to clean up partial upload {Path}", tmp); }
            throw;
        }
        return key;
    }

    public Task<Stream?> OpenReadAsync(string key, CancellationToken ct = default)
    {
        var path = SafePath(key);
        Stream? stream = File.Exists(path)
            ? new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read)
            : null;
        return Task.FromResult(stream);
    }

    public Task DeleteAsync(string key, CancellationToken ct = default)
    {
        try
        {
            var path = SafePath(key);
            if (File.Exists(path)) File.Delete(path);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            _logger.LogWarning(ex, "Failed to delete stored file {Key}", key);
        }
        return Task.CompletedTask;
    }

    private string SafePath(string key)
    {
        var path = Path.GetFullPath(Path.Combine(_root, key));
        if (!path.StartsWith(_root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            throw new BadRequestException("Khóa lưu trữ không hợp lệ.");
        return path;
    }
}
