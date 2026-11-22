namespace GMind.Application.Common;

/// <summary>A file the caller handed to a service; controllers adapt IFormFile to this.</summary>
public sealed record UploadedFile(string FileName, long Length, Func<Stream> OpenReadStream);
