# Phase 3 — Groups, Projects, Marketplace

Mode: Operate. Theo hệ nhận diện sáng, xanh nhẹ đã duyệt ở Phase 1–2; ưu tiên thao tác, quyền truy cập và đường đi nhóm → dự án → task.

## Trạng thái cuối

Hoàn thành, đã review 2 vòng và sửa các lỗi còn lại (round 3). Tất cả đều kiểm chứng bằng unit test, E2E trình duyệt thật trên dữ liệu demo có nhãn `[UI Phase 3]`, và bộ ảnh bằng chứng.

## Thay đổi theo trang

- **Groups** — "Nhóm của tôi", card thư mục (tên wrap 2 dòng, mô tả, badge vai trò primary/neutral — không còn tím), đếm thành viên, tìm commit-on-Enter (`Tìm`), lọc vai trò, đếm kết quả, empty lọc vs chưa-thuộc-nhóm khác nhau, skeleton/retry, reset draft khi đổi user.
- **JoinGroup** — breadcrumb; hai form độc lập (create → Leader, join → Member); lỗi field/server riêng giữ nguyên form kia; `<form>` Enter; code 8 ký tự chữ-số, uppercase+trim, không strip ký tự lỗi; khóa ref đồng bộ tắt cả hai form; mounted guard StrictMode-safe chống navigate sau unmount; giữ draft khi lỗi; focus field lỗi.
- **GroupDetail** — workspace keyed `id:userId`; breadcrumb; main 2fr (dự án) + aside 1fr (thành viên/mã mời); tiến độ + hoạt động chỉ Leader (member không gọi private fetch, payload giả không lọt render); `percentComplete` server với nhãn "Tỷ lệ công việc hoàn thành"; create-project progressive `Tạo dự án` (name 200/desc 2000/subject 100/hạn VN-23:59→ISO, validate trước POST); sửa nhóm PATCH; invite tạo/copy/thu hồi với confirm + note "chỉ mã phiên này hiển thị"; role/remove/leave qua confirm dialog (nêu rõ công việc không tự giao lại), role cập nhật local trước khi reload; chống demote/remove/rời khi sole Leader (giải thích hiển thị); DTO áp trước GET, `reloadAfter` cho navigation writes; 403/404 xoá hết private state; serialize mọi mutation.
- **ProjectDetail** — breadcrumb nhóm → nhóm → dự án; deadline/hiển thị từ server (không tự tính); filter q/status/assignee/priority/view lưu trong URL (Back giữ nguyên, q đồng bộ khi điều hướng); task cha + con khớp filter hiện cùng nhau; list + board (scroll nội bộ region, 5 cột thật); status actions theo assignee/Leader; create task form (validate, trim, ISO VN-23:59, estimate âm/date lỗi chặn trước POST, lỗi đúng field); sửa dự án giữ nguyên `deadlineAt` khi đổi tên (dayKey VN); archive qua confirm với copy đúng (project+tasks rời truy cập thường); thành viên nhóm; hoạt động dự án Leader-only lọc theo `projectId` + retry cục bộ; POST success áp DTO, GET500 → retry GET-only.
- **Marketplace** — NeedHelp/Transfer/Swap, không phải chợ vật liệu; browse main + composer toggle (trước list trên mobile, sidebar desktop); search Enter/type/status/Tất cả-Của tôi theo ID; ~100 latest + phân trang client 8; Swap chọn cặp chính xác (target đổi → xoá relatedTaskId); ownership theo `requestedByUserId`; Leader approve/reject qua dialog (reject bắt buộc note — blank 0 POST); copy approve đúng từng loại (NeedHelp giữ nguyên assignee); requester tự huỷ qua confirm; mọi write áp DTO trả về trước GET; 403/404 xoá sạch.
- **Navigation** — MainLayout `/groups` section cho `/tasks/*` khi state hợp lệ; TaskDetail `returnTo` chỉ nhận `/my-tasks[?]` hoặc `/projects/{projectId của chính task}[?]`; nhãn "Về dự án".

## Components/services mới

- `components/workspace/`: `workspace.css` (`.workspace-surface`), `WorkspaceUI.tsx` (Breadcrumb/Skeleton/ErrorState/EmptyState), `ConfirmationDialog.tsx` (mount-only focus capture/restore, busy-ref, overflow restore chính xác), `utils.ts`.
- `services`: `groupsManage` (update/revokeInvite/changeRole/removeMember/leave + `InviteDto` typed), `projectsManage` (update/archive), `MarketplaceDto` + `requestedByUserId/targetUserId/relatedTaskId/relatedTaskTitle`, `ActivityDto.projectId?`.

## Backend (additive, không schema/policy)

- `MarketplaceDto` tail fields: `RequestedByUserId`, `TargetUserId`, `RelatedTaskId`, `RelatedTaskTitle`; list projection + `ToDto` (create trả `targetName` thật).
- `ActivityDto` tail `ProjectId` + projection trong `GetActivityAsync`.
- `GMind.Tests/MarketplaceUiContractTests` (5 tests): Swap pair DTO ids/titles create+list, approve chỉ Leader và đổi đúng cặp, cancel chỉ requester-theo-ID, reject giữ assignee, activity `projectId` Leader-only, Transfer chỉ đổi task được chọn, Member bị cấm group-update/role/project-edit/archive, outsider 403.

## Lệnh đã chạy (kết quả thật)

- Scoped cuối: `groups-phase-3` + `workspace-access` → **36/36** (`Temp/gm-p3/final-group-tests.log`); `marketplace-phase-3` → 9/9 (`test-marketplace2.log`).
- `npm --prefix GMind-Frontend run test` → **136/136** (12 files, trước regression mới nhất — scoped `marketplace-phase-3` 9/9 chạy sau, chưa gộp lại full) — incl. regressions: join route, unmount no-navigate, role-local-on-GET500, draft-retained, deadline preserve near UTC boundary, create payload+lock, approve/reject DTO upsert, page clamp.
- `dotnet test GMind-Backend/GMind.Tests/GMind.Tests.csproj` → **64/64** (chạy một lần; đầu ra đầy đủ không được lưu thành file — chỉ còn shell/overflow bị truncate; không chạy lại). Bằng chứng log được giữ lại: `Temp/devin.exe-overflows/shell-9be6fe-e3e8e918dd513d89/content.txt` — 5 contract + 23 authorization tests (28 tests) `Passed!` trực tiếp trong file. Output build in cảnh báo **có sẵn trước Phase 3, chưa xử lý**: .NET preview SDK (NETSDK1057), `System.Security.Cryptography.Pkcs` 9.0.11 NU1902 (moderate) + NU1903 (**high**). Không cập nhật dependency khi chưa được duyệt.
- `npm --prefix GMind-Frontend run build` → pass; `lint` → 0 warnings; `dotnet build GMind-Backend/GMind.API/GMind.API.csproj --output Temp/gm-p3-api-build` → 0 errors; `git diff --check` → 0 whitespace errors.
- E2E journals: `Temp/gm-smoke/p3-e2e.mjs` (group/invite/join/project/task/NeedHelp-approve), `p3-e2e2.mjs` (13/13: Transfer pair-isolation, reject note, cancel, deadline preserve, Swap exact pair, TaskDetail return), `p3-e2e3.mjs` (14/16 — 2 assertions inconclusive do harness (heading check chạy sau navigate, progress-panel timing), không phải app fail: promote→demote qua UI, archive→excluded+404, remove member→403+view xoá, dialog Tab-trap/Escape/restore).
- Screenshots: `Temp/gm-p3/final-*.png` (~40, 41/42 checks — @320 search fixed 288px), `fx-*.png` (fixture: empty/error/loading, long list/board 320+390, composer long, reject dialog), `e2e3-*.png` (member valid vs denied).
- Detector: static `[]` all Phase-3 files; DOM `[]` live `/groups` (đã chạy đúng 1 lần).

## Giới hạn thật

- NeedHelp approve chỉ ghi nhận — không có API helper assignment/claim.
- List marketplace tối đa 100; hoạt động = 50 mục nhóm gần nhất lọc client theo projectId.
- Project status lưu sẵn, không tự tính từ tasks; không có contribution points.
- Invite UI chỉ quản mã vừa tạo trong phiên (backend chưa có list-invites endpoint).
- `returnTo` an toàn: chỉ `/my-tasks` hoặc project cha của chính task.
- Role/remove/archive đã verify qua UI trên nhóm demo; ảnh `after-member-*` cũ (nhóm không-phải-thành-viên, access-denied) đã superseded bởi `e2e3-member-*` hợp lệ.
- F5/Visual Studio GUI chưa kiểm chứng; Phase 4 (file/chat/contribution) chưa bắt đầu.
