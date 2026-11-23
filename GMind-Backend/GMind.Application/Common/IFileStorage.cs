using GMind.Application.Common.Exceptions;

namespace GMind.Application.Common;

/// <summary>Binary object storage keyed by an opaque storage key (never the original name).</summary>
public interface IFileStorage
{
    /// <summary>
    /// Saves a stream under a fresh random key, counting bytes as it copies.
    /// Throws <see cref="BadRequestException"/> when the stream exceeds <paramref name="maxBytes"/>.
    /// </summary>
    Task<string> SaveAsync(Stream content, long maxBytes, CancellationToken ct = default);

    /// <summary>Opens a stored object for reading; null when the key does not exist.</summary>
    Task<Stream?> OpenReadAsync(string key, CancellationToken ct = default);

    /// <summary>Deletes a stored object. Idempotent; IO failures are logged, never thrown.</summary>
    Task DeleteAsync(string key, CancellationToken ct = default);
}
