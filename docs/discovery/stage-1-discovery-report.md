# GMind — Stage 1 Discovery Report (2026-11-09)

Phạm vi: khảo sát toàn bộ repo tại `main` = `cfb3304` (sau merge PR #6). Stage 1 chỉ đọc code/tài liệu,
chạy ứng dụng, chụp ảnh và đánh giá; không sửa source, schema, dependency hay Git.

Ký hiệu bằng chứng: **[code]** đọc trực tiếp source; **[render]** ảnh Edge thật; **[test]** lệnh test đã chạy;
**[doc]** tài liệu; **[suy luận]** chưa chạy để xác nhận.

## Nguồn bằng chứng

- Yêu cầu: `docs/requirements/GMind_Business_Analysis_Specification_v1.0.md` (ID MVP/AUTH/GROUP/TASK/DASH/PROG/REV/NOT/VIEW/CHAT/LOG/FILE/RISK/SET/UI), `PRODUCT.md`, `docs/decisions/OPEN_QUESTIONS.md`.
- Ảnh render: `%TEMP%/gm-s1/` — 91 cặp ảnh (viewport + full page) ở 1440/1920/768/390 cho public, Member (M), Leader (L); manifest `capture.json`; contact sheets `contact-<width>-<n>.png`. 0 lỗi console, 0 page error, 0 request lỗi, 0 tràn ngang. `/does-not-exist` chuyển thẳng về `/dashboard`.
- Impeccable: `impeccable context` (PRODUCT.md có, chưa có DESIGN.md); Assessment A (design review, subagent riêng — model không đọc được ảnh nên dựa trên source; phần thị giác được lead bổ sung bằng xem trực tiếp contact sheets); Assessment B (detector CLI + overlay trình duyệt, subagent riêng). Ảnh overlay `%TEMP%/gm-s1/overlay-*.png`.
- Test cùng code (chạy hôm nay trước merge PR #6, không đổi code sau đó): frontend 273/273, backend 89/89, lint 0, build OK, `npm audit` 0, NuGet vulnerable 0.

## A. Tổng quan sản phẩm

- GMind: quản lý dự án nhóm cho sinh viên — nhóm → dự án → task/subtask → nộp/duyệt → dashboard, lịch, thông báo, Marketplace (Need Help / Transfer / Swap). [doc]
- Người dùng: sinh viên; vai trò theo từng nhóm: Leader (điều phối, duyệt) và Member (thực hiện). Một người có thể là Leader nhóm này, Member nhóm khác. [doc][code `GroupMember.Role`]
- Mục tiêu đã chốt trước đây: demo và nghiệm thu local (PRODUCT.md, 01/11/2026). Yêu cầu mới (09/11/2026): bỏ giới hạn "UI cơ bản", hướng tới sản phẩm hoàn chỉnh, premium.
- Module và liên kết: Auth/Session → Groups (membership, invites) → Projects → Tasks (comments, links, reviews) → Dashboard/Calendar (đọc `GET /api/dashboard/my-tasks`) → Notifications (sinh từ Task/Group/Marketplace + `ReminderWorker`) → Marketplace (đổi assignee task sau khi Leader duyệt) → ActivityLog (ghi từ mọi service).

## B. Tổng quan kỹ thuật

**Backend** — ASP.NET Core (.NET 11 rc.2 SDK, EF Core 10.0.13, SQL Server LocalDB), 4 project: Domain / Application / Infrastructure / API.
- Service class thuần + controller mỏng, response bọc bởi `ApiResponseWrapperFilter`, lỗi qua `GlobalExceptionHandler` và `DomainExceptions` (400/403/404/409). [code]
- README ghi MediatR/CQRS, FluentValidation, Mapster nhưng **không có handler/validator/mapping nào được dùng** (0 `IRequest<`, 0 `AbstractValidator`) — package thừa. Validation = DataAnnotations + kiểm tra thủ công trong service. [code]
- Phân quyền tập trung ở `Application/Common/ResourceAccess.cs` (`RequireMemberAsync`, `RequireLeaderAsync`, `RequireTaskDetailsAsync` = Leader hoặc assignee). [code]
- Auth: JWT + refresh token (hash SHA-256, **một cột refresh token/user** → chỉ một phiên refresh hợp lệ tại một thời điểm), `AuthVersion` thu hồi phiên, reset token hash một lần, `DevelopmentPasswordResetDelivery` chỉ Development. Không có rate limiting. [code]
- Worker: `Infrastructure/Workers/ReminderWorker.cs` chạy 15 phút/lần: nhắc 3 ngày/1 ngày/3 giờ/quá hạn + cảnh báo task đình trệ 3 ngày. [code]
- Schema (2 migration: `InitialCreate`, `AddAuthVersion`): User, Group, GroupMember (unique GroupId+UserId), GroupInvite (Code **plaintext** + TokenHash), Project (Subject, DeadlineAt, Status), Task (ParentTaskId, ProgressPercent, EstimateHours, Points, SubmittedAt, CompletedAt), TaskComment (soft delete), TaskLink (ProjectId, TaskId?), TaskReview (Decision, Comment, SubmissionVersion), MarketplaceRequest (Pending/Approved/Rejected), Notification, NotificationPreference (chưa dùng), ReminderDelivery (DeduplicationKey unique), ActivityLog (Before/AfterJson chưa dùng). Priority chỉ Low/Medium/High.

**Frontend** — React 19 + TS + Vite 8 + Tailwind 3 + React Router 7 + Axios.
- 17 page trong `src/pages`, layout `MainLayout` (sidebar 5 mục + account footer, mobile `<dialog>`), `ProtectedRoute` kiểm tra `/api/me` theo scope session/pathname.
- Dữ liệu: mỗi page tự `useEffect` + polling/focus refresh; **TanStack Query có trong package.json nhưng không được import ở đâu** → không cache, mỗi trang tải lại độc lập. [code]
- Styling: Tailwind token đơn giản (`tailwind.config.js`: primary/success/warning/danger, `shadow-card`), font hệ thống Segoe UI; 7 file "surface" CSS (`auth`, `dashboard`, `tasks`, `workspace`, `calendar`, `account`, `notifications`) khai báo lại style input/focus với khác biệt nhỏ; `App.css` 184 dòng là file template không được import. [code]
- Test: Vitest + Testing Library (21 file), xUnit + WebApplicationFactory/InMemory (9 file). Không có E2E trong repo (các script Playwright chỉ nằm ở `%TEMP%`).

## C. Feature inventory

| Khu vực | Tính năng | Trạng thái | Bằng chứng / ghi chú |
|---|---|---|---|
| Auth | Đăng ký/đăng nhập/đăng xuất, Confirm Password | Fully | `AuthController`, `Register.tsx`, `auth-flow.test.tsx` |
| Auth | Quên/đặt lại mật khẩu | Partial | Chỉ hộp thư dev (`DevelopmentPasswordResetDelivery`), không có email thật |
| Auth | Đổi mật khẩu | Fully | `MeController` PATCH password, `Settings.tsx` |
| Auth | Đổi email theo xác minh (AUTH-05) | Missing | Không có API |
| Auth | Avatar upload/giới hạn loại-kích thước | Missing | Chỉ URL |
| Auth | Google login (AUTH-06, Later) | Missing | |
| Auth | Chống brute force | Missing | Không có rate limit |
| Group | Tạo/sửa nhóm, xem thành viên | Fully | `GroupsController`, `GroupDetail.tsx` |
| Group | Mời bằng mã, tham gia | Partial | Mã tạo được; **không có API liệt kê lời mời** → chỉ thấy mã vừa tạo trong phiên; hạn dùng/số lượt có ở backend nhưng UI gửi `{}` (backend only) |
| Group | Rời nhóm rồi **tham gia lại** | Broken [code, chưa chạy] | `JoinByCodeAsync` thêm `GroupMember` mới trong khi unique index (GroupId, UserId) vẫn giữ dòng `IsActive=false` → lỗi DB |
| Group | Đổi vai trò / xóa thành viên | Partial | Hoạt động; task của người bị xóa vẫn gán cho họ, không cảnh báo/không phân công lại; log ghi GUID |
| Group | Lưu trữ nhóm | Backend only (một phần) | Có cột `IsArchived`, không có API/UI |
| Project | Tạo/sửa/lưu trữ | Partial | Không xem lại/khôi phục dự án đã lưu trữ |
| Project | Trạng thái dự án | Broken | `ProjectStatus` không bao giờ đổi (chỉ `Archived`) → luôn "Chưa bắt đầu" dù task đã chạy [code][render] |
| Task | Tạo task (Leader) | Partial | Form không có subtask cha, points, giờ deadline (cố định 23:59 VN) |
| Task | Sửa / giao lại / xóa task | **Backend only** | `tasksService.update/assign/remove` không được gọi ở page nào; TaskDetail của Leader không có nút sửa [code][render] |
| Task | Subtask | Backend only | API nhận `parentTaskId`; UI chỉ hiển thị, không tạo được |
| Task | Cập nhật % tiến độ (TASK-04) | Missing | Không API nào ghi `ProgressPercent` (chỉ =100 khi Completed) |
| Task | Luồng ToDo→InProgress→Submitted→ChangesRequested/Completed | Fully | `TaskService.ChangeStatusAsync` có bảng chuyển trạng thái + test |
| Task | Ghi chú bàn giao khi nộp (REV-02) | Missing | Chỉ có nhận xét của Leader |
| Task | Comment | Partial | Thêm được; **sửa/xóa có API nhưng không có UI** |
| Task | Link tài liệu | Partial | Thêm được; xóa có API nhưng không có UI; không nhập tên hiển thị; chưa có link cấp dự án (FILE-01) |
| Task | Lịch sử review | Fully | `TaskDetail.tsx` + `/reviews` |
| Task | Ưu tiên "Khẩn cấp" | Broken | UI có `Urgent`, backend enum không có → bộ lọc không bao giờ khớp |
| Task | Kanban | Partial | Bảng 5 cột, đổi trạng thái bằng nút; chưa kéo-thả (VIEW-02) |
| Dashboard | Dashboard cá nhân | Partial | Chỉ Tất cả/Hôm nay/Quá hạn (thiếu Ngày mai, Sắp đến hạn); thiếu số "hoàn thành"; trùng nội dung với MyTasks |
| Dashboard | Dashboard Leader (PROG-01..04, UI-08) | Partial | Chỉ % hoàn thành + đếm theo thành viên trên GroupDetail; không có hàng đợi "cần duyệt", quá hạn, deadline gần, task đình trệ, chi tiết thành viên, nhắc thành viên |
| Dashboard | Leader progress đếm "chờ duyệt" | Broken | Gộp `ChangesRequested` vào "chờ duyệt" (`DashboardService`); tổng chỉ tính task đã giao nên lệch với tiến độ dự án |
| Calendar | Lịch tháng/danh sách | Fully (phạm vi cá nhân) | Chỉ task đang mở của tôi; không lịch dự án/nhóm |
| Notifications | Inbox, đọc/đọc tất cả, đếm | Fully | Phase 5 |
| Notifications | Nhắc hạn 3d/1d/3h/quá hạn | Partial | Không nhắc lại khi đổi deadline (dedup key không gồm deadline); nội dung ghi giờ **UTC**; không thông báo khi đổi deadline (NOT-02) |
| Notifications | Preferences (NOT-04) | Missing (schema có) | `NotificationPreference` không có API/UI |
| Notifications | Phân trang >100, realtime | Missing | Polling 60s |
| Risk | Quá hạn | Fully | Worker + badge |
| Risk | ≤8 giờ & <70% (RISK-02), đình trệ 24 giờ (RISK-03), ngưỡng theo nhóm | Missing / sai ngưỡng | Đang 3 ngày |
| Marketplace | Tạo/duyệt/từ chối/hủy Need Help, Transfer, Swap | Partial | Hoạt động có kiểm tra lại khi duyệt; **người nhận không xác nhận**; không có Claim; Need Help không ghi người hỗ trợ và người hỗ trợ không xem được task; hủy = xóa cứng; Leader tự duyệt yêu cầu của mình |
| Activity log | Ghi log | Partial | Tóm tắt tiếng Anh + GUID ("Assigned task to {guid}", "Removed member {guid}") |
| Activity log | Trang log + lọc (LOG-03, UI-10) | Missing | API chỉ `take` |
| Profile/Settings | Hồ sơ, đổi mật khẩu | Fully (phạm vi hiện có) | Phase 6 |
| Settings | Timezone, mốc nhắc (SET-01) | Missing | Viết cứng |
| Error pages | 404/không có quyền (SET-02) | Partial | Lỗi trong trang có; không có trang 404 |
| Later | Chat dự án, upload file, email/push, timeline | Missing | BA: Later |

## D. Gap analysis (tóm tắt theo luồng)

1. **Leader không quản lý được task sau khi tạo** (sửa, giao lại, xóa, tạo subtask) dù backend đã có — luồng cốt lõi của Leader đứt.
2. **Member không cập nhật được % tiến độ** — kéo theo RISK-02 không thể làm và thanh tiến độ luôn 0%.
3. **Leader không có nơi "việc cần tôi xử lý"**: duyệt task, duyệt Marketplace, rủi ro nằm rải rác theo từng task/nhóm.
4. **Marketplace thiếu bên thứ ba**: Transfer/Swap đổi trách nhiệm của người khác mà người đó không đồng ý; Need Help không có người hỗ trợ thật.
5. **Vòng đời thành viên**: rời/bị xóa để lại task mồ côi; tham gia lại bị lỗi.
6. **Trạng thái/thống kê sai lệch**: trạng thái dự án đứng yên; "chờ duyệt" gộp trả sửa; tiến độ nhóm ≠ tiến độ dự án.
7. **Thông báo**: không theo dõi thay đổi deadline, hiển thị UTC, không preferences, không realtime.

## E. UI/UX critique (Impeccable)

Method: dual-agent (A: 91056d70 · B: 4a530c12). A không đọc được ảnh → đánh giá từ source; lead đã tự xem contact sheets 1440/390 để bổ sung phần thị giác.

**Design health (Nielsen): 27/40 — Acceptable.** H1 3, H2 3, H3 3, H4 3, H5 3, H6 3, H7 2 (không có bulk/shortcut/saved view), H8 3 (sạch nhưng phẳng), H9 3, H10 1 (không có trợ giúp, Marketplace không giải thích).

**Specificity verdict:** category-interchangeable — bỏ logo "G" thì là template Tailwind admin: font hệ thống, slate trên trắng, card `rounded-2xl` viền 1px, mọi trang cùng khuôn breadcrumb → h2 → card trắng.

**Detector:** CLI 0 finding (89 file, chỉ pattern text). Overlay: `nested-cards` ở Calendar (false positive — toggle Tháng/Danh sách), `line-length` ~116 ký tự ở nội dung thông báo (thật, thấp), `straggler` phụ đề Dashboard ở 390px (thẩm mỹ).

**Điểm mạnh:** kỷ luật state + a11y (skeleton, aria-live, focus trả về, 44px), microcopy tiếng Việt tự nhiên, toàn bộ filter nằm trên URL.

**Vấn đề ưu tiên:**
- [P1] Không có bản sắc thương hiệu — auth là card nhỏ giữa nền xám trống; typography nhỏ, một dải xanh duy nhất.
- [P1] Dashboard ≡ MyTasks (cùng dữ liệu, cùng bộ lọc, JSX trùng); Leader thấy dashboard y hệt Member.
- [P2] Thanh công cụ dày đặc ở Marketplace/Calendar/ProjectDetail (6+ control), mobile xếp thành form dài.
- [P2] Không có lớp phản hồi (toast) và khoảnh khắc thành công cho Submit→Approve; empty state chỉ có chữ.
- [P2] Nhiều nút "Làm mới" thủ công trên mọi trang — triệu chứng của việc thiếu đồng bộ dữ liệu.
- [P3] 7 stylesheet surface khác nhau nhỏ về radius/border/accent; `Card` default = outlined; Button primary bị ghi đè khắp nơi.
- Quan sát render: GroupDetail (Member) rất trống; activity log lẫn tiếng Anh/GUID; title task dài chiếm 3–6 dòng ở TaskDetail mobile; lịch mobile chỉ còn chấm.

**Trang cần redesign đáng kể:** Login/Register (và shell auth), Dashboard (role-aware), GroupDetail (Leader cockpit), Marketplace (luồng 3 bên). **Tinh chỉnh:** MyTasks, TaskDetail (thêm khu quản lý cho Leader), ProjectDetail, Calendar mobile, Notifications, Profile/Settings, JoinGroup, Groups.

## F. Cơ hội cải tiến (đề xuất)

| # | Đề xuất | Giải quyết | Vai trò | FE | BE/DB | Độ khó | Ưu tiên | Làm |
|---|---|---|---|---|---|---|---|---|
| 1 | Quản lý task đầy đủ cho Leader (sửa, giao lại, xóa, subtask, points, giờ deadline) | Luồng Leader đứt | Leader | TaskDetail/ProjectDetail | API có sẵn; thêm thông báo đổi deadline | M | P1 | Ngay |
| 2 | Cập nhật % tiến độ + ghi chú bàn giao | TASK-04, REV-02 | Member | TaskDetail | Endpoint progress; cột note trên review/submission (migration) | M | P1 | Ngay |
| 3 | Leader cockpit: hàng đợi "Cần xử lý" (task chờ duyệt, Marketplace pending, rủi ro, chưa giao) | Leader mất thời gian tìm việc | Leader | Dashboard role-aware | Endpoint tổng hợp đa nhóm | M | P1 | Ngay |
| 4 | Cảnh báo rủi ro chuẩn BA + cài đặt nhóm | RISK-02/03, SET-01 | Leader | Group settings | Bảng GroupSettings (migration), worker | M | P1 | Ngay |
| 5 | Marketplace 3 bên: người nhận chấp nhận → Leader duyệt; Claim; người hỗ trợ có quyền xem; trạng thái Cancelled | Đổi trách nhiệm không đồng ý | Cả hai | Marketplace redesign | Trạng thái mới, quyền helper (migration) | H | P1 | Ngay (sau quyết định) |
| 6 | Vòng đời thành viên: rời/bị xóa → task về "chưa giao" + báo Leader; sửa rejoin | Dữ liệu mồ côi, lỗi | Leader | GroupDetail | Service + test | M | P0/P1 | Ngay |
| 7 | Quản lý lời mời (danh sách, hạn, số lượt, thu hồi); lưu trữ nhóm | GROUP-03 | Leader | GroupDetail | GET invites; bỏ Code plaintext | L–M | P1 | Ngay |
| 8 | Activity log page + lọc thành viên/thời gian/dự án/loại; summary tiếng Việt, tên thay GUID | LOG-03, UI-10 | Leader | Trang mới | Query filter + paging | M | P2 | Ngay |
| 9 | Notification preferences + realtime (SignalR) + phân trang | NOT-04, đồng bộ | Mọi người | Settings, chuông | API preferences, hub, cursor | M–H | P2 | Ngay/sau |
| 10 | Design system mới + redesign shell/auth/dashboard, toast, empty state minh họa, typeface tiếng Việt | Premium/cohesive | Mọi người | Toàn app | — | H | P2 | Ngay (song song) |
| 11 | Data layer bằng TanStack Query (đã có dependency) | Bỏ nút "Làm mới", đồng bộ giữa trang | — | Toàn app | — | M | P2 | Ngay |
| 12 | Kanban kéo-thả theo quyền | VIEW-02 | Cả hai | ProjectDetail | Dùng API status | M | P2 | Sau M1 |
| 13 | File upload local storage có whitelist/giới hạn | FILE-02 | Cả hai | TaskDetail | Storage abstraction, bảng file | H | P3 | Theo quyết định |
| 14 | Trao đổi theo dự án (chat) | CHAT-01/02 | Cả hai | Trang mới | SignalR + bảng message | H | P3 | Theo quyết định |
| 15 | Timeline dự án | VIEW-03 | Leader | Trang mới | — | M | P3 | Theo quyết định |
| 16 | Điểm đóng góp | MVP-08 | Leader | Báo cáo | Công thức chưa chốt | M | P2 | Sau quyết định |
| 17 | E2E Playwright trong repo | Chống hồi quy | — | test | — | M | P2 | Ngay |

## G. Bugs, rủi ro, giới hạn kỹ thuật

**Verified [code] (+[render] nếu có):**
1. Project status không đổi → "Chưa bắt đầu" sai. [render]
2. Leader progress gộp ChangesRequested vào "chờ duyệt"; tổng bỏ task chưa giao.
3. Activity log/Marketplace/notification lẫn tiếng Anh enum ("NeedHelp", "-> Completed") và GUID. [render]
4. Reminder ghi giờ UTC; không nhắc lại khi deadline đổi; không thông báo đổi deadline.
5. UI có ưu tiên "Khẩn cấp" mà backend không hỗ trợ.
6. Mã mời lưu plaintext song song với hash.
7. Hủy yêu cầu Marketplace xóa cứng bản ghi (mất lịch sử).
8. Leader tự duyệt task/yêu cầu Marketplace của chính mình — không có quy tắc.
9. Người hỗ trợ (Need Help) không có quyền xem chi tiết task.
10. Không rate limiting cho login/forgot-password.
11. Một refresh token/user → đăng nhập thiết bị thứ hai làm phiên thiết bị đầu hết hạn khi access token hết hạn.
12. `/does-not-exist` → Dashboard, không có 404. [render]
13. README/OPEN_QUESTIONS lệch code: README ghi MediatR/FluentValidation/Mapster, ✅ "Cảnh báo nguy cơ", "Cài đặt hệ thống"; OPEN_QUESTIONS ghi "Member tạo task cho mình" nhưng code chỉ cho Leader (có dead code kiểm tra creator/assignee sau `RequireLeaderAsync`).
14. TanStack Query, MediatR, FluentValidation, Mapster là dependency không dùng; `App.css` thừa.

**Suspected (cần chạy để xác nhận):**
- Rejoin nhóm sau khi rời/bị xóa gây lỗi unique index (đọc code chắc chắn cao; chưa chạy vì Stage 1 không ghi dữ liệu).
- `ReminderWorker` nạp mọi task có deadline mỗi 15 phút và chạy `AnyAsync` theo từng task/mốc → chậm khi dữ liệu lớn; cảnh báo đình trệ ghi `RecipientUserId = Guid.Empty` nếu nhóm không còn Leader active → lỗi FK làm cả lượt worker thất bại.
- Marketplace page tải mọi dự án rồi mọi danh sách task (N+1 phía client).
- Transfer task đang `Submitted` giữ nguyên trạng thái với assignee mới.

**Môi trường:** .NET 11 SDK rc (preview); Microsoft.AspNetCore.OpenApi rc; Visual Studio F5 chưa xác nhận; bundle frontend lớn.

## H. Hướng đề xuất

Ưu tiên theo thứ tự: (1) sửa lỗi dữ liệu/quyền P0; (2) nền design system + data layer để mọi trang làm lại dùng chung; (3) hoàn thiện luồng Leader–Member cốt lõi (task management, progress, cockpit, rủi ro); (4) Groups/Marketplace 3 bên; (5) Notifications/Settings; (6) tính năng mở rộng theo quyết định (kanban kéo-thả, file, chat, timeline, điểm); (7) E2E + hardening + tài liệu.

## I. Câu hỏi quyết định

Xem `docs/decisions/OPEN_QUESTIONS.md` mục "Stage 1 Discovery — chờ quyết định (2026-11-09)".

## J. Bước tiếp theo

Sau khi có câu trả lời: chốt roadmap milestone (mục tiêu, file, BE/DB, rủi ro, tiêu chí nghiệm thu, test) vào tài liệu này, rồi bắt đầu M0 (P0 fixes) và M1 (design system + data layer).
