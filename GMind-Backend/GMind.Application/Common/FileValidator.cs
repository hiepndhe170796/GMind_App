using System.Text;
using System.Text.RegularExpressions;
using GMind.Application.Common.Exceptions;

namespace GMind.Application.Common;

public enum FileValidationMode { Document, Avatar }

public sealed record ValidatedFile(string SafeName, string Extension, string ContentType);

/// <summary>Pure name/extension/signature validation for uploads. The client content type is never trusted.</summary>
public static partial class FileValidator
{
    private static readonly HashSet<string> DocumentExtensions =
        ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "md", "csv", "png", "jpg", "jpeg", "gif", "webp", "zip"];
    private static readonly HashSet<string> AvatarExtensions = ["png", "jpg", "jpeg", "webp"];
    private static readonly char[] InvalidNameChars = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];

    private static readonly Dictionary<string, string> ContentTypes = new()
    {
        ["pdf"] = "application/pdf",
        ["doc"] = "application/msword",
        ["docx"] = "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ["xls"] = "application/vnd.ms-excel",
        ["xlsx"] = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ["ppt"] = "application/vnd.ms-powerpoint",
        ["pptx"] = "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ["txt"] = "text/plain; charset=utf-8",
        ["md"] = "text/markdown; charset=utf-8",
        ["csv"] = "text/csv; charset=utf-8",
        ["png"] = "image/png",
        ["jpg"] = "image/jpeg",
        ["jpeg"] = "image/jpeg",
        ["gif"] = "image/gif",
        ["webp"] = "image/webp",
        ["zip"] = "application/zip",
    };

    public static ValidatedFile Validate(string rawName, long length, ReadOnlySpan<byte> head,
        FileValidationMode mode, long maxBytes)
    {
        if (length <= 0) throw new BadRequestException("Tệp trống.");
        if (length > maxBytes) throw new BadRequestException($"Tệp vượt quá {maxBytes / 1_048_576} MB.");

        var name = SanitizeName(rawName);
        var dot = name.LastIndexOf('.');
        var ext = dot >= 0 ? name[(dot + 1)..].ToLowerInvariant() : string.Empty;

        var allowed = mode == FileValidationMode.Avatar ? AvatarExtensions : DocumentExtensions;
        if (ext.Length == 0 || !allowed.Contains(ext))
            throw new BadRequestException(mode == FileValidationMode.Avatar
                ? "Ảnh đại diện chỉ nhận PNG, JPEG hoặc WebP."
                : "Định dạng tệp không được hỗ trợ.");
        if (name.Length == 0) name = $"tep.{ext}";

        if (!SignatureMatches(ext, head))
            throw new BadRequestException($"Nội dung tệp không khớp với định dạng .{ext}.");

        return new ValidatedFile(name, ext, ContentTypes[ext]);
    }

    private static string SanitizeName(string? rawName)
    {
        var name = Path.GetFileName(rawName ?? string.Empty);
        var chars = name.Where(c => !char.IsControl(c) && !InvalidNameChars.Contains(c)).ToArray();
        name = CollapseWhitespace().Replace(new string(chars), " ").Trim(' ', '.');
        var dot = name.LastIndexOf('.');
        var ext = dot >= 0 ? name[(dot + 1)..] : string.Empty;
        if (name.Length > 200)
            name = ext.Length > 0 && ext.Length < 200
                ? name[..(200 - ext.Length - 1)].TrimEnd(' ', '.') + "." + ext
                : name[..200];
        return name;
    }

    private static bool SignatureMatches(string ext, ReadOnlySpan<byte> head) => ext switch
    {
        "pdf" => head.StartsWith("%PDF-"u8),
        "png" => head.StartsWith(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }),
        "jpg" or "jpeg" => head.StartsWith(new byte[] { 0xFF, 0xD8, 0xFF }),
        "gif" => head.StartsWith("GIF87a"u8) || head.StartsWith("GIF89a"u8),
        "webp" => head.Length >= 12 && head.StartsWith("RIFF"u8) && head.Slice(8, 4).SequenceEqual("WEBP"u8),
        "docx" or "xlsx" or "pptx" => head.StartsWith(new byte[] { 0x50, 0x4B, 0x03, 0x04 }),
        "zip" => head.StartsWith(new byte[] { 0x50, 0x4B, 0x03, 0x04 }) || head.StartsWith(new byte[] { 0x50, 0x4B, 0x05, 0x06 }),
        "doc" or "xls" or "ppt" => head.StartsWith(new byte[] { 0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1 }),
        "txt" or "md" or "csv" => IsValidUtf8Text(head),
        _ => false,
    };

    /// <summary>No NUL bytes and the head decodes as UTF-8, tolerating a truncated multi-byte tail.</summary>
    private static bool IsValidUtf8Text(ReadOnlySpan<byte> head)
    {
        if (head.IndexOf((byte)0) >= 0) return false;
        var encoding = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false, throwOnInvalidBytes: true);
        for (var trim = 0; trim <= 3 && trim < head.Length; trim++)
        {
            try
            {
                encoding.GetString(head[..(head.Length - trim)]);
                return true;
            }
            catch (DecoderFallbackException) { }
        }
        return false;
    }

    [GeneratedRegex(@"\s+")]
    private static partial Regex CollapseWhitespace();
}
