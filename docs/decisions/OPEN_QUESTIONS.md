# Open Questions & Deferred Decisions

Mục này ghi nhận các quyết định nghiệp vụ/kỹ thuật chưa được xác nhận hoặc còn chờ triển khai. Không coi các mục dưới đây là yêu cầu đã phê duyệt.

## Phase-2 / Sau MVP (theo BA, chưa implement)

| Item | Trạng thái | Ghi chú |
|---|---|---|
| Realtime chat (SignalR) | Deferred | BA đánh dấu later/optional; MVP dùng Task comments làm fallback |
| Direct file upload | Deferred | MVP dùng TaskLink (URL/reference) theo BA; upload trực tiếp cần storage provider + quyết định quota |
| Kanban drag-drop nâng cao | Deferred | Hiện có kanban 5 cột status; drag-drop + reorder tùy biến là phase-2 |
| Email/push notifications | Deferred | In-app notifications đã có; email cần SMTP provider config |
| Contribution points formula | Assumption | BA không định nghĩa công thức chính xác; hiện tính theo số task Completed. Cần PO xác nhận trọng số (priority, points field, deadline adherence) |

## Assumptions đã dùng (chờ xác nhận)

1. **Member chỉ tạo task giao cho chính mình** — Leader assign cho bất kỳ ai. (BA không ghi rõ Member có tạo task cho người khác không.)
2. **1 task = 1 assignee chính** — BA mô tả assignee đơn lẻ.
3. **Leader duyệt tất cả review + marketplace** — theo permission matrix BA.
4. **Stale task warning**: task `InProgress` không cập nhật > 3 ngày → báo Leader, dedup 1 lần/ngày/task. Ngưỡng 3 ngày là giả định; BA không định nghĩa "stale".
5. **Invite code**: 8 ký tự, lưu SHA256 hash, hỗ trợ expires/maxUses/usedCount.
6. **JWT secret trong `appsettings.json`** là dev placeholder; production phải override bằng environment variable/secret manager.
7. **Timezone**: DB lưu UTC; hiển thị `vi-VN` locale trên frontend. `TimeZone=Asia/Ho_Chi_Minh` trong config dành cho format hiển thị server-side nếu cần sau.

## Vấn đề kỹ thuật đã biết

- `System.Security.Cryptography.Pkcs` 9.0.11 có NU1902/NU1903 warnings (transitive từ EF Core) — chờ upstream update.
- .NET SDK đang dùng **11.0.100-rc.2 preview** — cân nhắc pin sang LTS (net8/net10) khi release chính thức.
- Thông báo nội bộ nhóm chỉ hiển thị/đánh dấu đã đọc khi người nhận còn là thành viên đang hoạt động của nhóm chưa lưu trữ. Ngoại lệ: thông báo MemberRemoved của chính người nhận vẫn hiển thị để biết quyền đã bị thu hồi. Đây là lựa chọn bảo thủ cho A1; không xóa lịch sử thông báo.
