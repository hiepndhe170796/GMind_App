# Phase 1 — Dashboard (bắt đầu 01/11/2026, kiểm chứng cuối 02/11/2026)

Triển khai theo `docs/design/ui-improvement-plan.md`, mục 1 (Tổng quan). Giữ nguyên hướng nhận diện đã duyệt (sáng, xanh nhẹ, primary-600/700, slate-600, radius 18, Segoe UI). Không thêm % tiến độ, điểm đóng góp hay chỉ số Leader — mọi con số là số entry task đang mở của chính người dùng.

## Files thay đổi

- `pages/Dashboard.tsx` — summary strip 4 stat-button có separator (section region + aria-describedby count), task list hai hàng (title trên, metadata dưới, chevron row-span), filter URL-driven (q/project/status/period/date/page), pagination có icon, skeleton đúng layout, empty/onboarding phân biệt, resource task/groups độc lập.
- `components/dashboard/MiniCalendar.tsx` — prop `today`, `calendarDeadlineCounts` từ model, keyboard roving (Arrow/Home/End/PageUp/Down có clamp ngày), aria-current/pressed, off-month select, group aria-label + hướng dẫn phím, không role=grid. Header compact `Tháng N, YYYY` — không wrap ở 1440.
- `components/dashboard/dashboard.css` — scoped `.dashboard-surface` (input/select/focus/selection + stat borders responsive).
- `components/dashboard/dashboard-model.ts` + `.test.ts` — **bổ sung mới Phase 1**: model thống kê/lọc/deadline (`readDashboardFilters`, `buildDashboardModel`, `deadlineTime`, `calendarDeadlineCounts`) và 5 test biên ngày, phân trang, query; cả 5 đạt ở lần kiểm chứng model trước (không chạy lại trong đợt sửa cuối).
- `layouts/MainLayout.tsx` — aria-current + section derivation (task detail giữ context /dashboard hay /my-tasks theo `navigationSection` state), nav scroll, header opaque + ngày cập nhật 60s/on-focus, bell badge 99+ + aria-label đủ count, dialog `aria-haspopup/expanded/controls` + Escape/backdrop/resize-close + scroll-lock + focus trap native, skip-link, logout pending-disabled, Brand nhận className cho mobile header full-width.
- `pages/dashboard.test.tsx` — 11 test theo hành vi thực (Back điều hướng thật, stale response, intersection filter, literal 'all', PageUp clamp 31/3→28/2).

## Ngữ nghĩa đã chốt

- Filter lưu trong URL — Back từ task khôi phục filter + trang; task links mang `state={{navigationSection:'/dashboard'}}`.
- Stat buttons thay toàn bộ filter bằng scope tương ứng → số liệu khớp danh sách; `aria-pressed` chỉ khi selection thuần.
- `calendarTasks` = scope search/project/status (bỏ period/date); `upcoming` chỉ deadline tương lai hợp lệ; overdue = `deadlineTime < now` (now refresh 60s + focus).
- Stats = entry mở từ API cá nhân — không phải tiến độ dự án/đóng góp.

## Kiểm chứng đã chạy

Các lệnh `npm` dưới đây chạy trong `GMind-Frontend`; lệnh `dotnet` và `git` chạy từ thư mục gốc repo.

- `npm run test -- --run src/pages/dashboard.test.tsx` → **11/11** (ProtectedRoute giữ nguyên 16/16 từ lần chạy trước — không thay đổi).
- `npm run build` ✅ (dist ~410KB) · `npm run lint` → **0 warning trên file thay đổi; 10 warning baseline còn lại** (MyTasks/Groups/Marketplace/GroupDetail/TaskDetail/ProjectDetail — có sẵn trước phase, không phạm vi này).
- `dotnet build GMind-Backend/GMind.API/GMind.API.csproj --no-restore --output C:/Users/admin/AppData/Local/Temp/gm-api-build` → **0 errors** (output tạm vì API đang chạy — không dừng process). `git diff --check` clean.
- Detector (chạy ở đợt implement đầu, chưa lặp lại sau sửa cuối): static `[]` trên Dashboard/MiniCalendar/MainLayout; DOM detect.js trên dashboard thật: **No anti-patterns found**.
- Trình duyệt Edge headless (tài khoản demo sẵn có, không tạo mới):
  - **Thật**: member2 đăng nhập → dashboard 1440/390/320; title rộng **190px ở 320** (≥160 yêu cầu), metadata xuống hàng; task→detail→Back giữ `?status=` filter (member2 có 1 task nên không chạy thật phân trang); sidebar giữ "Tổng quan" trên task detail; 0 page error.
  - **Fixture (interception test-only, không ghi DB)**: 9 task tên dài + ChangesRequested/Urgent → `fixture-many-320/1440.png` (title 190px, pagination next/prev giữ filter + Back), `fixture-loading-390.png` (skeleton), `fixture-taskerror-1440.png` (task lỗi + nhóm còn), `fixture-grouperror-1440.png` (ngược lại).
  - **Drawer 390**: focus trap 20 Tab không thoát, Escape/close-button/backdrop/resize-lg đóng + trả focus về trigger, scroll lock/restore — tất cả PASS; `drawer-final-390.png` chụp viewport.
- Screenshot: `C:/Users/admin/AppData/Local/Temp/gm-p1/` — `member-final-{1440,390,320}.png`, `fixture-*`, `drawer-final-390.png`, `dashboard-{768,320}.png`, `dashboard-date-1440.png`, `dashboard-detect-1440.png`.

## Giới hạn

- test@gmind.dev có 0 task mở, member2 có 1 (đúng API) → task→detail→Back chứng minh trên member2; phân trang kiểm chứng bằng fixture/unit, không phải tài khoản thật.
- Fixture screenshots mô phỏng phản hồi API để minh họa trạng thái đông/lỗi/loading — rõ ràng là test-only, không phải dữ liệu thật.
- `unreadCount` ẩn badge khi fetch lỗi (không fake 0).

## Chạy bản đang triển khai

Xem bản đang chạy: http://localhost:5173/dashboard; nếu server dừng, mở `GMind.slnx`, chọn startup `GMind - API + Frontend` và Run. Không có migration hay biến môi trường mới cho Phase 1; dùng cấu hình local A0 đã có. GUI F5 chưa kiểm chứng trực tiếp.
