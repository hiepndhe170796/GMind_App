namespace GMind.Application.Common;

public static class Labels
{
    public static string TaskStatus(Domain.Enums.TaskStatus s) => s switch
    {
        Domain.Enums.TaskStatus.ToDo => "Cần làm",
        Domain.Enums.TaskStatus.InProgress => "Đang làm",
        Domain.Enums.TaskStatus.Submitted => "Chờ duyệt",
        Domain.Enums.TaskStatus.ChangesRequested => "Cần chỉnh sửa",
        Domain.Enums.TaskStatus.Completed => "Hoàn thành",
        _ => s.ToString(),
    };
    public static string Priority(Domain.Enums.Priority p) => p switch
    {
        Domain.Enums.Priority.Low => "Thấp",
        Domain.Enums.Priority.Medium => "Trung bình",
        Domain.Enums.Priority.High => "Cao",
        Domain.Enums.Priority.Urgent => "Khẩn cấp",
        _ => p.ToString(),
    };
    public static string MarketplaceType(Domain.Enums.MarketplaceRequestType t) => t switch
    {
        Domain.Enums.MarketplaceRequestType.NeedHelp => "Cần hỗ trợ",
        Domain.Enums.MarketplaceRequestType.Transfer => "Chuyển giao",
        Domain.Enums.MarketplaceRequestType.Swap => "Hoán đổi",
        _ => t.ToString(),
    };
    public static string Role(Domain.Enums.Role r) => r switch
    {
        Domain.Enums.Role.Leader => "Trưởng nhóm",
        Domain.Enums.Role.Member => "Thành viên",
        _ => r.ToString(),
    };
}
