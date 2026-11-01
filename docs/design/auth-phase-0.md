# Phase 0 — Auth (01/11/2026)

Triển khai theo `docs/design/ui-improvement-plan.md`, mục 0. Bốn route riêng: `/login` dùng `LoginLayout`, `/register` dùng `RegisterLayout` (hai layout riêng, cùng chia sẻ `AuthLayout` base); `/forgot-password` và `/reset-password` dùng trực tiếp `AuthLayout` với màn hình riêng của từng route. Tất cả thao tác chạy API/database thật.

## Thay đổi hành vi

- **Login** (`/login` — `LoginLayout`): inline validation (email/password), lỗi gắn `aria-invalid` + `aria-describedby`, focus trường đầu tiên sai, `autocomplete="username"/"current-password"`, link "Quên mật khẩu?" → `/forgot-password`. 401 → "Email hoặc mật khẩu không đúng."; form giữ giá trị đã nhập. `safeReturnPath` nay cũng từ chối `/forgot-password`, `/reset-password` làm return target. Status "Mật khẩu đã được đặt lại" khi đến từ luồng reset.
- **Register** (`/register` — `RegisterLayout`, rộng hơn): 4 trường, password+confirm trong grid 2 cột ở `sm`, `new-password` autocomplete, hint "Ít nhất 8 ký tự…", mismatch → lỗi tại trường confirm + focus, không gửi request. 409 → lỗi inline ở email. Sau `register` thành công nhưng `login` thất bại: trạng thái "Tài khoản đã được tạo", nút chuyển thành "Thử đăng nhập lại" chỉ gọi lại login (không tạo tài khoản lần nữa).
- **ForgotPassword** (`/forgot-password`): gửi email qua `POST /api/auth/forgot-password`; hiển thị thông báo chung "Nếu địa chỉ này có tài khoản…" giống nhau cho email tồn tại/không. Nút "Dùng email khác" reset form. Lỗi giữ input.
- **ResetPassword** (`/reset-password`): đọc token từ `#token=` trước rồi `?token=` fallback; thiếu token → màn "Liên kết không hợp lệ" + link yêu cầu mới. Mismatch chặn trước request. Thành công → trạng thái + link đăng nhập `state={{passwordReset:true}}` (không auto-login), token bị xóa khỏi URL bằng `navigate(..., replace)`. Token hết hạn/đã dùng → "Liên kết đã hết hạn hoặc đã được sử dụng" + link yêu cầu mới.
- **Input component** (thay đổi backward-compatible): prop `hint?`, `aria-describedby` được compose từ caller + hint + error ids, lỗi luôn `role="alert"`, `danger-700`.
- **auth.css** (scoped `.auth-surface`): submit `bg-primary-600` hover `700`, input min-h-11/`text-base`, focus/selection/caret/invalid từ palette — sửa hai cảnh báo tương phản detector (slate-500→600, primary-500 nút→600).

## Hộp thư local (Development only)

`DevelopmentPasswordResetDelivery` (API, `IPasswordResetDelivery` tuỳ chọn trên `AuthService` — constructor callers cũ không đổi):

- `IsAvailable` chỉ khi `IHostEnvironment.IsDevelopment()`; `ForgotPasswordAsync` kiểm tra trước khi tra cứu user — khi không available (vd Production) trả 400 "Password recovery is not configured" cho cả email tồn tại và không (không rò rỉ enumeration). `SendAsync` của transport cũng tự từ chối ngoài Development bằng `InvalidOperationException` làm lớp phòng thủ.
- Viết file `.html` UTF-8 (GUID filename, `.tmp`→`.html` atomic) vào `%LOCALAPPDATA%\GMind\Mailbox` — **Windows + R** → `%LOCALAPPDATA%\GMind\Mailbox` → mở thư mới nhất để lấy link `/reset-password#token=…` (fragment — token không vào server log/query).
- Config tuỳ chọn: `Auth:FrontendUrl` (mặc định `http://localhost:5173`, validate absolute http/https), `Auth:LocalMailboxPath` (mặc định thư mục trên). Mail HTML: `lang=vi`, `referrer=no-referrer`, không script/asset ngoài; email/link HTML-encoded.
- `ResetPasswordAsync` (sẵn có): kiểm tra hash + expiry 1h + IsActive, đổi mật khẩu, `AuthVersion++` (thu hồi mọi session/refresh cũ), token single-use (xóa sau dùng).

## Kiểm chứng đã chạy

- `npm.cmd --prefix GMind-Frontend run build` ✅ · `npm.cmd --prefix GMind-Frontend run lint` ✅ (không warning mới) · `npm.cmd --prefix GMind-Frontend run test -- --run src/pages/auth-flow.test.tsx src/components/ProtectedRoute.test.tsx src/services/api-session.test.ts`: **45/45** ở lượt kiểm tra ban đầu.
- `dotnet test GMind-Backend/GMind.Tests/GMind.Tests.csproj --filter "FullyQualifiedName~AuthServiceTests|FullyQualifiedName~SessionAuthorizationTests|FullyQualifiedName~PasswordResetDeliveryTests|FullyQualifiedName~DevelopmentPasswordResetDeliveryTests"`: **24/24**.
- Sau loạt sửa cuối (focus 409, disable khi pending, footer reset, token-clear, test expiry thật + encoding): `npm.cmd --prefix GMind-Frontend run test -- --run src/pages/auth-flow.test.tsx` **11/11**; `dotnet test GMind-Backend/GMind.Tests/GMind.Tests.csproj --filter "FullyQualifiedName~PasswordResetDeliveryTests"` **8/8**; `npm.cmd --prefix GMind-Frontend run build` ✅; `git diff --check` clean. Chỉ chạy lại các kiểm tra liên quan này, không chạy lại toàn bộ suite.
- `git diff --check` clean. Detector static: `[]` cả 5 file Auth + layouts. Detector DOM (detect.js): **0 anti-pattern** cả 4 route — hai cảnh báo low-contrast trước đã hết.
- Browser thật (Edge headless, playwright-core tạm ngoài repo): 12 screenshot 4 route × {1440,768,390} — không overflow; lifecycle end-to-end: register UI → auto-login join-group → logout → 401 alert → inline invalid+focus → login đúng → forgot → file mailbox (1 file mới) → mở link reset → mismatch bị chặn → reset thành công → mật khẩu cũ bị từ chối / mới đăng nhập được → replay link bị "hết hạn". **3 tài khoản demo dùng cho việc này** (`auth0-*`, `auth0b-*`, `auth0c-*@gmind.dev`), mật khẩu sinh ngẫu nhiên trong memory, không ghi/log.
- Screenshot: `C:/Users/admin/AppData/Local/Temp/gm-auth0/{login,register,forgot-password,reset-password}-{1440,768,390}.png`, `forgot-success-1440.png`, `reset-form-1440.png`, `reset-success-1440.png`, `*-detect-1440.png`.

## Giới hạn

- Hộp thư là file local, không phải gửi email production — dùng chỉ cho nghiệm thu local.
- Bước "logout→login" trong smoke bị navigation timeout do Vite `networkidle` trong một kịch bản; được xác minh độc lập bằng bước tương đương (logout button click + waitForURL('**/login')) đã PASS trong chạy auth-p0b.
- Màn mobile 390px của Register render 1 cột (grid chỉ từ `sm`); hai trường mật khẩu xếp 2 cột từ 640px theo thiết kế.
