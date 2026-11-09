# GMind — Stage 2 Roadmap & Progress

Nguồn: `docs/discovery/stage-1-discovery-report.md` (findings), `docs/decisions/OPEN_QUESTIONS.md`
(Q1–Q11 đã trả lời 09/11/2026), `PRODUCT.md` (đã cập nhật phạm vi và thương hiệu).

Quy ước giao nhận (Q11): mỗi milestone một nhánh `feat/stage2-mN-<slug>` tạo từ nhánh trước,
commit local khi milestone đạt tiêu chí; không push/merge/deploy khi chưa được duyệt.
Dependency mới chỉ dùng bản phát hành ≥7 ngày.

## Quyết định đã chốt (tóm tắt)

- Phát hành: chạy local, cấu hình sẵn sàng triển khai; chưa deploy.
- Làm ngay: kanban kéo-thả, realtime SignalR (thông báo + thảo luận dự án), upload file local. Hoãn: email production, Google login, timeline.
- Marketplace: Transfer/Swap cần người nhận đồng ý rồi Leader duyệt; có Claim; Need Help ghi người hỗ trợ (xem + bình luận); hủy giữ bản ghi.
- Rời/bị xóa: task chưa xong về "Chưa giao", báo Leader.
- Tự duyệt: cần Leader khác nếu có; nhóm một Leader thì cho phép và ghi log.
- Điểm: Leader đặt points; cộng khi Approved cho người phụ trách; Need Help không chia.
- Thị giác: nâng cấp sáng/xanh + tím làm màu nhấn; Be Vietnam Pro; được đổi điều hướng; chưa dark mode.
- Leader tạo/sửa/giao/xóa task; người phụ trách tạo subtask cho task của mình.
- Nhiều thiết bị đăng nhập đồng thời.

## Milestones

| M | Mục tiêu | Ưu tiên | Trạng thái |
|---|---|---|---|
| M0 | Toàn vẹn dữ liệu, phân quyền, bảo mật | P0/P1 | Đang làm |
| M1 | Design system, app shell, auth, lớp dữ liệu dùng chung | P1/P2 | Chờ |
| M2 | Task & Project hoàn chỉnh (quản lý của Leader, tiến độ, bàn giao, subtask, comment/link, kanban kéo-thả) | P1 | Chờ |
| M3 | Dashboard theo vai trò, Leader cockpit, cảnh báo rủi ro, cài đặt nhóm, điểm đóng góp | P1 | Chờ |
| M4 | Groups (lời mời, lưu trữ, vòng đời thành viên, activity log) & Marketplace 3 bên | P1 | Chờ |
| M5 | Realtime thông báo, preferences, phân trang; nhiều phiên đăng nhập; đổi email có xác minh | P2 | Chờ |
| M6 | Thảo luận dự án realtime; upload file (task/dự án/avatar) | P2/P3 | Chờ |
| M7 | Hoàn thiện các trang còn lại theo design system, E2E Playwright trong repo, hardening, tài liệu, QA cuối | P2 | Chờ |

### M0 — Toàn vẹn dữ liệu, phân quyền, bảo mật
- **Phạm vi:** tham gia lại nhóm; rời/bị xóa → bỏ giao task chưa xong + hủy yêu cầu Marketplace đang chờ liên quan + báo Leader; số task bị ảnh hưởng trong dialog; trạng thái Marketplace `Cancelled` thay cho xóa cứng; quy tắc tự duyệt (task + Marketplace) với cờ `canReview`; trạng thái dự án tính từ task; tiến độ nhóm tách "chờ duyệt"/"cần sửa", thêm chưa giao/quá hạn; log + thông báo tiếng Việt, dùng tên thay GUID; nhắc hạn theo giờ Việt Nam, nhắc lại khi đổi deadline, thông báo đổi deadline, worker không N+1 và không ghi `Guid.Empty`; ưu tiên `Urgent`; không lưu mã mời dạng rõ cho lời mời mới; rate limit endpoint auth; trang 404.
- **DB:** không đổi schema (enum int mở rộng).
- **Tiêu chí:** test backend cho từng quy tắc; test frontend cho dialog/404/nhãn; full backend + frontend xanh; lint/build sạch; smoke API thật.

### M1 — Design system & nền tảng
- `DESIGN.md` (Impeccable), token Tailwind (xanh + tím + neutral ngả xanh, thang chữ, radius, shadow, motion), Be Vietnam Pro (`@fontsource/be-vietnam-pro`).
- Bộ component dùng chung: Button, IconButton, Input/Select/Textarea/Field, Card (cấp), Badge/StatusPill, Tabs/Segmented, Dialog, Toast, EmptyState có minh họa, PageHeader, Skeleton, Avatar, Progress (bar/ring), Menu/Dropdown, Tooltip; gộp 7 stylesheet surface.
- App shell mới (sidebar, header, mobile nav), auth hai cột, 404.
- TanStack Query: provider, query keys, invalidation; thay nút "Làm mới" bằng đồng bộ nền.
- **Tiêu chí:** render thật 1440/1920/768/390, Impeccable detector + critique, a11y.

### M2 — Task & Project
- TaskDetail Leader: sửa (tiêu đề, mô tả, ưu tiên, deadline có giờ, estimate, points), giao lại, xóa; tạo subtask (Leader; người phụ trách cho task của mình).
- `PATCH /api/tasks/{id}/progress` (người phụ trách, 0–99 khi chưa duyệt) + ghi chú bàn giao khi nộp (bảng `TaskSubmissions`, migration).
- Sửa/xóa comment, xóa link, tên hiển thị link, link cấp dự án; kanban kéo-thả (`@dnd-kit/core`) theo bảng chuyển trạng thái; redesign ProjectDetail/TaskDetail/MyTasks.

### M3 — Dashboard, cockpit, rủi ro, điểm
- Dashboard theo vai trò: Hôm nay/Ngày mai/Sắp đến hạn/Quá hạn/Hoàn thành; Leader "Cần xử lý" (task chờ duyệt, Marketplace chờ, rủi ro, chưa giao) đa nhóm.
- `GroupSettings` (ngưỡng rủi ro giờ/% và giờ đình trệ, mốc nhắc), RISK-02/03 trong worker; trang chi tiết thành viên cho Leader; điểm đóng góp.

### M4 — Groups & Marketplace
- Lời mời: danh sách/metadata, hạn dùng, số lượt, thu hồi; lưu trữ nhóm; dự án đã lưu trữ.
- Activity log page có lọc + phân trang.
- Marketplace 3 bên: chờ người nhận → chờ Leader → duyệt/từ chối/hủy/người nhận từ chối; Claim; `TaskHelpers` (quyền xem + bình luận); redesign có giải thích.

### M5 — Realtime & tài khoản
- SignalR hub (đếm/thông báo mới, cập nhật task); preferences nhắc hạn; phân trang cursor; bảng phiên đăng nhập (nhiều thiết bị, danh sách + thu hồi); đổi email có xác minh qua hộp thư dev.

### M6 — Cộng tác
- Thảo luận theo dự án (realtime, chỉ thành viên active); upload file lưu local có whitelist/giới hạn, tải/xóa theo quyền; upload avatar.

### M7 — Hoàn thiện & QA
- Calendar/Notifications/Profile/Settings/Groups/JoinGroup theo design system; E2E Playwright trong repo; README/tài liệu khớp code; QA toàn ứng dụng 4 kích thước.

## Nhật ký tiến độ

- 2026-11-09 — Stage 1 hoàn tất; quyết định Q1–Q11 ghi nhận; bắt đầu M0.
