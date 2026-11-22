namespace GMind.Application.Common;

/// <summary>Local file-storage configuration, bound from the "Storage" section. Defaults live in code.</summary>
public sealed class StorageOptions
{
    public const long DefaultMaxFileBytes = 10_485_760;      // 10 MB
    public const long DefaultMaxAvatarBytes = 2_097_152;     // 2 MB
    public const long DefaultGroupQuotaBytes = 1_073_741_824; // 1 GB
    public const int DefaultMaxAttachmentsPerMessage = 5;

    public string RootPath { get; set; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "GMind", "Files");
    public long MaxFileBytes { get; set; } = DefaultMaxFileBytes;
    public long MaxAvatarBytes { get; set; } = DefaultMaxAvatarBytes;
    public long GroupQuotaBytes { get; set; } = DefaultGroupQuotaBytes;
    public int MaxAttachmentsPerMessage { get; set; } = DefaultMaxAttachmentsPerMessage;
}
