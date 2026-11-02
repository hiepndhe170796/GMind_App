# Phase 2 — Việc của tôi + Chi tiết công việc (02/11/2026)

Mode: Operate. Giữ nhận diện sáng, xanh nhẹ của Phase 1; ưu tiên thao tác và quyền truy cập.

## Phạm vi

- `pages/MyTasks.tsx` — viết lại hoàn toàn: bộ lọc URL (`q/project/status/period/date/page`) tái sử dụng **đúng** `readDashboardFilters`/`buildDashboardModel`/`deadlineTime` từ `dashboard-model.ts` (không sửa model), phân trang 6/trang, hàng task theo layout hai-hàng đã duyệt ở Phase 1 (title full-width, chevron `row-span-2`, metadata bọc dưới), link `/tasks/:id` với `state { navigationSection: '/my-tasks', returnTo }`, empty/onboarding riêng, lỗi + retry độc lập, skeleton đúng hình.
- `pages/TaskDetail.tsx` — kiến trúc `TaskWorkspace` keyed theo `taskId:userId` (không lọt draft/private giữa route/phiên); `mutate` runner chung với `loadVersion`/`actionVersion`/`pendingRef` chống race & double-click; POST trả về authoritative DTO được áp ngay, sau đó `reload(quiet)` GET (lỗi GET → refresh-error, không báo "POST thất bại"); 403/404 ở POST **hoặc** follow-up GET → xóa toàn bộ private view + drafts.
- `components/tasks/tasks.css` — mới: phạm vi `.task-surface` (primary-600/700, input/select/textarea 44px, focus ring primary-600, selection primary-100/900).
- `pages/my-tasks.test.tsx` — mới: loading deferred/skeleton, empty onboarding + link nhóm, bộ lọc giao nhau theo hàng, phân trang + Back giữ q/page, date xóa period, không có Completed option.
- `pages/workspace-access.test.tsx` — giữ nguyên các case privacy/race/error/summary cũ, thêm các case: status hợp lệ theo vai trò, khóa nút khi pending, trả về trống bị chặn 0 POST, Ctrl+Enter, URL chặn scheme lạ, POST→GET500 → success + refresh-error + retry chỉ GET, quiet-GET 403 xóa private, race refresh-vs-write, unmount không fetch, returnTo biên.
- `docs/design/tasks-phase-2.md` — file này.

## Hành vi backend giữ nguyên

- `GET /api/dashboard/my-tasks` chỉ trả task **đang mở** giao cho user — không có Completed, không có filter theo người khác.
- `loadTaskWorkspace` (workspace.ts) không đổi: task → project → group.myRole; comments/links/reviews chỉ fetch khi `hasTaskDetails`.
- `changeStatus`: Assignee 1→2, 2→3, 4→2; Leader 3→5 / 3→4 (bắt buộc note khi 4). Hoàn thành set progress=100 server-side. ProgressPercent **chỉ đọc** (không có API sửa tiến độ — không bịa slider).
- Summary task (canViewDetails=false): chỉ thông tin chung + notice, không fetch/render private panel kể cả khi mock trả mảng.

## Kiểm chứng (đợt sửa cuối 02/11)

- `npm --prefix GMind-Frontend run test -- --run src/pages/my-tasks.test.tsx src/pages/workspace-access.test.tsx src/services/workspace.test.ts` (cwd repo root) → **37/37**
- `npm --prefix GMind-Frontend run build` → **✓**
- `npm --prefix GMind-Frontend run lint` → **0 warning trên file thay đổi; 7 warning baseline cũ** (Groups×1, Marketplace×1, GroupDetail×2, ProjectDetail×3 — ngoài phạm vi)
- `dotnet test GMind-Backend/GMind.Tests/GMind.Tests.csproj --filter FullyQualifiedName~TaskAuthorizationTests --no-restore --output C:/Users/admin/AppData/Local/Temp/gm-p2-tests` → **23/23**; `dotnet build GMind-Backend/GMind.API/GMind.API.csproj --no-restore --output C:/Users/admin/AppData/Local/Temp/gm-p2-api-build` → **0 errors** (đợt trước, không chạy lại)
- `git diff --check` → clean
- Detector (`impeccable.exe` windows-x64): static `[]` trên MyTasks/TaskDetail/tasks.css; DOM `--cdp` trên 2 trang live đã đăng nhập (my-tasks + task Completed @1440): `[]` cả hai.

## Trình duyệt thật (Edge headless, tài khoản demo có sẵn — KHÔNG tạo user/group/project mới)

**1 task demo có nhãn được giữ lại làm bằng chứng:** `[UI Phase 2] Kiểm tra nộp và duyệt` id `abb2802b-e92d-46f8-a739-9fa228dbb860` trên project `3825edb3-…` (assignee member2). Đã đi hết vòng đời → **Completed** với 2 lượt duyệt trong lịch sử (Lượt 1 Yêu cầu sửa, Lượt 2 Đã duyệt); backend cấm xóa task Completed (ghi ở `Temp/gm-p2/task-evidence.json`). Một task thử tạm trong khâu xác nhận payload đã dọn qua API; không sửa task/membership/dữ liệu khác.

- member2 /my-tasks: `mytasks-{1440,390,320}.png` — title **190px @320**, no overflow (member2 có 1 task — phân trang + Back chứng minh bằng fixture/unit, không bằng dữ liệu thật).
- member2 task detail: start→comment `Đã hoàn thành phần kiểm tra giao diện.`→link `https://example.com/gmind-phase-2`→submit: `task-submitted-member-1440.png`.
- Leader: blank-return bị chặn (**0 POST**, inline alert + focus textarea) → note `Bổ sung minh chứng kiểm thử trên điện thoại.` → Trả về sửa: `task-changesreq-leader-1440.png`; member Làm lại: `task-changesreq-member-1440.png`; submit lại → Leader Duyệt → Completed persist sau reload: `task-completed-leader-1440.png`; review history hiện `Lượt duyệt 1` (Yêu cầu sửa) và `Lượt duyệt 2` (Đã duyệt) + timestamp.
- Mobile: `task-detail-{390,320,768}.png` — card Thao tác nằm TRÊN mô tả @390 (aside y=292 < mô tả y=894), 320 không overflow.
- 0 page errors trong toàn bộ luồng.

**Fixture (interception test-only, không ghi DB — phân trang/lỗi/summary):**
- `fx-mytasks-{1440,320}.png` — 9 task tên dài, phân trang giữ `q`+`page`, title 190px @320; `fx-mytasks-{loading,error,empty}-390.png`.
- `fx-task-leader-{390,320}.png` (form duyệt Submitted), `fx-task-member-390.png` (mô tả/comment/link dài), `fx-task-summary-{390,1440}.png` — **0 request** tới /comments,/links,/reviews khi summary; không render mô tả/progress/composer.
- `fx-task-post500-1440.png` (lỗi POST giữ draft), `fx-task-403clear-1440.png` (403 xóa private), `fx-task-geterror-1440.png`.
- `real-completed-final-1440.png` — task Completed thật hiển thị Lượt duyệt 1 + 2.

## Sửa đợt cuối

- Reload/mutation serialization: `refreshing`+`refreshingRef` — nút "Tải lại chi tiết" khoá khi POST đang chạy và ngược lại (mutate từ chối khi đang refresh); `pendingStatus` hiển thị spinner đúng nút được bấm.
- `fetchWorkspace`/`reload` tách tầng + `clearPrivate`/`invalidateRequests` stable → hết warning lint mới.
- Validator thống nhất cho mọi lối submit (form + Ctrl+Enter): comment/link/review báo lỗi inline + focus, `aria-invalid`/`aria-describedby`; trả về sửa bắt buộc note, cả 2 nút check ≤2000.
- `returnTo` sanitize: chỉ `/my-tasks` hoặc `/my-tasks?...`; giá trị lạ/số → fallback an toàn; `nav aria-label`.
- Form link grid mobile-first (nút full-width @320), badge Urgent/ChangesRequested danger, `overflow-wrap` tên dài, `scroll-mt-24` anchor lịch sử.
- Test mới/đẩy mạnh: status parameter hóa đúng trạng thái hợp lệ, deferred POST lock 2 nút, POST500→retry giữ draft, Ctrl+Enter pending 1 POST, URL invalid focus, quiet-GET 403 xóa sạch, race refresh-vs-write, summary với mảng giả vẫn ẩn, returnTo biên.

## Giới hạn

- ProgressPercent chỉ đọc — backend chưa có API sửa tiến độ riêng; không claim đã làm tính năng chỉnh tiến độ.
- Summary-view: đã kiểm tra render bằng fixture trên trình duyệt thật (0 request private, ẩn composer/progress); chưa kiểm tra bằng dữ liệu API thật của thành viên không phụ trách.
- GUI F5 Visual Studio chưa kiểm chứng trực tiếp.
- Không migration/biến môi trường mới. Runtime: `http://localhost:5173/my-tasks` · `/tasks/{id}` (nếu server dừng: mở `GMind.slnx`, startup `GMind - API + Frontend`, Run).
