# GMind

GMind là ứng dụng web quản lý bài tập và dự án nhóm cho sinh viên. Người dùng tạo nhóm qua mã mời, lập dự án, chia và giao công việc, theo dõi hạn chót, nộp – duyệt kết quả, trao đổi công việc qua Marketplace và cộng tác thời gian thực qua thông báo SignalR và thảo luận dự án.

## Tính năng

### Tài khoản & phiên
- Đăng ký, đăng nhập, đăng xuất; quên mật khẩu và đặt lại mật khẩu qua liên kết email (hộp thư dev ở môi trường Development).
- Đổi mật khẩu (kết thúc mọi phiên đang mở); đổi email có xác minh qua liên kết gửi tới địa chỉ mới.
- Nhiều phiên đăng nhập đồng thời (tối đa 10); xem danh sách phiên và thu hồi từng phiên hoặc tất cả phiên khác.
- Ảnh đại diện: tải ảnh png/jpeg/webp, trình duyệt cắt vuông 256 px trước khi gửi.

### Nhóm
- Mã mời/link có nhãn, hạn dùng (1 giờ – 90 ngày hoặc không hạn), số lượt (1–500 hoặc không giới hạn) và thu hồi; mã chỉ hiển thị một lần khi tạo (lưu hash).
- Vai trò Trưởng nhóm / Thành viên; đổi vai trò, rời nhóm, xóa thành viên (công việc chưa xong của người bị xóa về "Chưa giao" và báo Trưởng nhóm).
- Lưu trữ và khôi phục nhóm (chỉ Trưởng nhóm, phải gõ đúng tên nhóm); nhóm lưu trữ bị đóng băng hoàn toàn.
- Ngưỡng cảnh báo theo nhóm (nguy cơ trễ, đình trệ) do Trưởng nhóm chỉnh trong cài đặt nhóm.
- Nhật ký hoạt động của nhóm (chỉ Trưởng nhóm) với bộ lọc người thực hiện, dự án, loại và khoảng ngày.

### Dự án & công việc
- Dự án trong nhóm, lưu trữ/khôi phục dự án.
- Công việc chính và công việc con; giao việc, mức ưu tiên, hạn chót, % tiến độ do người phụ trách cập nhật.
- Kanban 5 cột kéo-thả (theo quyền) và chế độ danh sách.
- Luồng duyệt: Nộp kèm ghi chú bàn giao (lưu theo phiên bản nộp) → Trưởng nhóm Duyệt hoặc Yêu cầu chỉnh sửa → Hoàn thành.
- Bình luận, liên kết tài liệu và tệp đính kèm trên công việc và dự án; tải lên/tải về có phân quyền.

### Marketplace
- Ba loại yêu cầu: Cần hỗ trợ, Chuyển giao, Hoán đổi. Yêu cầu không chỉ định người nhận ở trạng thái "Đang mở" để thành viên bất kỳ bấm Nhận việc.
- Quy trình 3 bên: người nhận Đồng ý (hoặc một thành viên Nhận việc) → "Chờ duyệt" → Trưởng nhóm Duyệt/Từ chối.
- Người hỗ trợ được ghi tên trên công việc, xem chi tiết và bình luận nhưng không đổi trạng thái, không nhận điểm.

### Theo dõi
- Tổng quan theo vai trò, "Việc của tôi", Lịch (tháng/danh sách), trang chi tiết thành viên.
- Cảnh báo quá hạn, có nguy cơ trễ và đình trệ theo ngưỡng của nhóm; Trưởng nhóm nhắc việc thủ công (tối đa 1 lần/giờ/công việc).
- Điểm đóng góp: Trưởng nhóm đặt điểm cho công việc chính, điểm được ghi nhận khi duyệt. Công thức điểm là giả định đang chờ chủ sản phẩm xác nhận (xem `docs/decisions/OPEN_QUESTIONS.md`).

### Cộng tác realtime
- Thông báo trong ứng dụng qua SignalR (`/hubs/realtime`); mất kết nối tự quay về làm mới định kỳ 60 giây.
- Tùy chọn nhắc hạn cho từng người (3 ngày, 1 ngày, 3 giờ trước hạn, khi quá hạn).
- Thảo luận dự án: trả lời, @nhắc tên (người được nhắc nhận thông báo), đính kèm tệp, sửa/xóa tin nhắn; cập nhật realtime trên các màn hình đang mở.

## Kiến trúc & công nghệ

### Backend — ASP.NET Core Web API (.NET 11, target `net11.0`)
- Kiến trúc 4 tầng: `GMind.Domain` (entities, enums, interfaces) → `GMind.Application` (services, DTOs, business rules) → `GMind.Infrastructure` (EF Core, migrations, storage, background workers) → `GMind.API` (controllers, realtime hub, middleware).
- Thư viện sử dụng: Entity Framework Core + SQL Server (`Microsoft.EntityFrameworkCore.SqlServer`), JWT bearer (`Microsoft.AspNetCore.Authentication.JwtBearer` + `System.IdentityModel.Tokens.Jwt`), SignalR (phần ASP.NET Core; client test dùng `Microsoft.AspNetCore.SignalR.Client`), BCrypt.Net-Next, Swashbuckle.AspNetCore (chỉ Development). Gói EF Core/JwtBearer hiện ở 10.0.x trên SDK 11.
- Worker nền (`GMind.Infrastructure/Workers`) quét và tạo thông báo nhắc hạn/cảnh báo.
- Lưu ý: `GMind.Application.csproj` còn tham chiếu MediatR, FluentValidation và Mapster nhưng hiện không có mã nguồn nào dùng chúng (các thư mục `Commands/`, `Queries/`, `Validators/` đang trống) — không coi chúng là phần kiến trúc đang hoạt động.

### Frontend — React + TypeScript
- React 19, TypeScript, Vite 8, React Router 7, TanStack Query 5, Axios, Tailwind CSS 3, `@microsoft/signalr`, `@dnd-kit` (kéo-thả), font Be Vietnam Pro.
- Kiểm thử: Vitest + Testing Library + jsdom (unit/component), oxlint, Playwright (E2E).
- Tách bundle theo route: các trang sau đăng nhập tải lazy (`src/routes/lazy-pages.ts`) và được prefetch sau lần xác thực đầu; chunk vendor tách riêng (`codeSplitting.groups` trong `vite.config.ts`); entry ~65 kB minified.
- `ProtectedRoute` chỉ chặn hiển thị ở lần xác thực đầu của mỗi phiên; các lần chuyển trang sau render ngay và gọi `/api/me` ở nền.

## Cấu trúc thư mục

```
GMind_App/
├── GMind.slnx                     # Solution (mở bằng Visual Studio)
├── GMind.slnLaunch                # Profile "GMind - API + Frontend"
├── AGENTS.md                      # Hướng dẫn cho AI coding agents
├── PRODUCT.md                     # Mục tiêu & ràng buộc sản phẩm
├── DESIGN.md                      # Design system (tokens, quy tắc đặt tên)
├── docs/
│   ├── requirements/              # BA spec (.docx + .md) và AI implementation prompt
│   ├── decisions/OPEN_QUESTIONS.md# Quyết định/giả định chờ xác nhận
│   ├── discovery/                 # Stage-1 discovery report, stage-2 roadmap
│   └── design/                    # Tài liệu thiết kế theo phase
├── GMind-Backend/
│   ├── GMind.API/                 # Controllers, Common (middleware, mailbox dev), Realtime hub, Program.cs
│   ├── GMind.Application/         # Services (auth, groups, tasks, marketplace, files, discussion…), DTOs, Common
│   ├── GMind.Domain/              # Entities, Enums, Interfaces
│   ├── GMind.Infrastructure/      # EF Core (Persistence, Migrations), Storage, Workers
│   └── GMind.Tests/               # xUnit: unit + WebApplicationFactory integration tests
└── GMind-Frontend/
    ├── src/
    │   ├── components/            # UI dùng chung + component theo domain
    │   ├── layouts/               # MainLayout (shell, drawer mobile, nav)
    │   ├── pages/                 # Trang theo route
    │   ├── routes/lazy-pages.ts   # Loader + lazy import các trang
    │   ├── services/              # Axios client, service theo domain, session, realtime
    │   ├── hooks/ store/ types/ utils/
    │   └── App.tsx main.tsx index.css
    ├── e2e/                       # Playwright: specs, fixtures/, support/, global-setup.ts
    ├── playwright.config.ts       # E2E config (Edge channel, 2 project desktop/mobile)
    ├── vite.config.ts             # Dev proxy /api + /hubs (WS), code splitting
    └── package.json tsconfig*.json tailwind.config.js
```

## Yêu cầu môi trường

| Công cụ | Đã kiểm tra | Ghi chú |
|---|---|---|
| .NET SDK | 11.0.100 | `dotnet --version` |
| Node.js | 24.15.0 | `node --version` |
| npm | 11.12.1 | `npm --version` |
| SQL Server | LocalDB (`(localdb)\mssqllocaldb`) | Mặc định trong connection string; SQL Server khác dùng được qua `ConnectionStrings__DefaultConnection` |
| `dotnet-ef` | tool global | Repo không có tool manifest; cài bằng `dotnet tool install --global dotnet-ef` |
| Microsoft Edge | bản cài hệ thống | Bắt buộc cho E2E (channel `msedge`); không cần tải browser của Playwright |

## Chạy lần đầu (local)

1. Cài dependencies:
   ```bash
   dotnet restore GMind-Backend/GMind.API/GMind.API.csproj
   npm --prefix GMind-Frontend ci
   ```
2. Tạo/cập nhật database (API không tự chạy migration):
   ```bash
   dotnet ef database update --project GMind-Backend/GMind.Infrastructure --startup-project GMind-Backend/GMind.API
   ```
   Migration mới nhất hiện tại: `20261122142918_AddProjectDiscussionAndFiles`.
3. Chạy API:
   ```bash
   dotnet run --project GMind-Backend/GMind.API --launch-profile http
   ```
   API tại `http://localhost:5194`. Health: `GET /api/health/live` (process sống), `GET /api/health/ready` (200 chỉ khi kết nối được SQL Server). Swagger UI tại `http://localhost:5194/swagger` — chỉ môi trường Development.
4. Chạy frontend (terminal khác):
   ```bash
   npm --prefix GMind-Frontend run dev
   ```
   Vite tại `http://localhost:5173` (strict port), proxy `/api` và `/hubs` (WebSocket) tới `http://127.0.0.1:5194`.
5. Mở `http://localhost:5173`, đăng ký tài khoản. Sau đăng ký, ứng dụng chuyển tới `/join-group` để tạo nhóm hoặc nhập mã mời.
6. Email phát triển: mọi thư (đặt lại mật khẩu, xác minh đổi email) được ghi vào `%LOCALAPPDATA%\GMind\Mailbox` và xem tại `http://localhost:5173/dev/mailbox` — chỉ Development và chỉ loopback.

### Chạy bằng Visual Studio

Mở `GMind.slnx`, chọn startup profile **"GMind - API + Frontend"** (định nghĩa trong `GMind.slnLaunch`: `GMind.API` launch profile `http` + `GMind-Frontend.esproj` launch "GMind Frontend (Edge)"). Cần workload "ASP.NET and web development" và "Node.js development" để `.esproj` load được. Trạng thái kiểm chứng: build project, proxy và đăng nhập đã được kiểm tra qua command line; thao tác Run/F5 trong giao diện Visual Studio chưa được chúng tôi xác nhận.

## Cấu hình

Giá trị mặc định đọc từ `appsettings.json`/`appsettings.Development.json` và code. Mọi key có thể override bằng biến môi trường dạng `Section__Key` (hai dấu gạch dưới), ví dụ `Jwt__Secret`, `Storage__RootPath`, `RateLimiting__LoginPermitLimit`. `GMind.API.csproj` không có `UserSecretsId`, nên `dotnet user-secrets` không áp dụng — dùng biến môi trường cho giá trị riêng; không commit secrets vào file `appsettings` được Git theo dõi.

| Key | Mặc định | Mục đích |
|---|---|---|
| `ConnectionStrings:DefaultConnection` | `Server=(localdb)\mssqllocaldb;Database=GMindDB;Trusted_Connection=True;TrustServerCertificate=True;` | Chuỗi kết nối SQL Server |
| `Jwt:Secret` | chỉ có trong `appsettings.Development.json` | Khóa ký access token (≥ 32 byte) |
| `Jwt:Issuer` / `Jwt:Audience` | `GMind` / `GMind` | Issuer/audience của token |
| `Jwt:ExpiryMinutes` | `60` | Thời hạn access token (phút) |
| `Jwt:RefreshTokenExpiryDays` | `7` | Thời hạn phiên không hoạt động (ngày) |
| `Cors:AllowedOrigins` | `[ "http://localhost:5173" ]` | Origin frontend được phép |
| `Auth:FrontendUrl` | `http://localhost:5173` | Base URL gắn vào link trong email |
| `Auth:LocalMailboxPath` | `%LOCALAPPDATA%\GMind\Mailbox` | Thư mục hộp thư dev |
| `Storage:RootPath` | `%LOCALAPPDATA%\GMind\Files` | Thư mục lưu tệp tải lên (ngoài webroot) |
| `Storage:MaxFileBytes` | `10485760` (10 MB) | Kích thước tối đa mỗi tệp |
| `Storage:MaxAvatarBytes` | `2097152` (2 MB) | Kích thước tối đa ảnh đại diện |
| `Storage:GroupQuotaBytes` | `1073741824` (1 GB) | Hạn mức tệp mỗi nhóm |
| `Storage:MaxAttachmentsPerMessage` | `5` | Số tệp tối đa mỗi tin nhắn thảo luận |
| `RateLimiting:LoginPermitLimit` / `LoginWindowMinutes` | `10` / `1` | Giới hạn đăng ký+đăng nhập theo IP |
| `RateLimiting:RecoveryPermitLimit` / `RecoveryWindowMinutes` | `5` / `15` | Giới hạn quên/đặt lại mật khẩu |
| `RateLimiting:UploadPermitLimit` / `UploadWindowMinutes` | `30` / `1` | Giới hạn tải tệp |
| `RateLimiting:ChatSendPermitLimit` / `ChatSendWindowMinutes` | `30` / `1` | Giới hạn gửi tin thảo luận |

Khóa JWT dev chỉ nằm trong `appsettings.Development.json`. Ngoài Development, API từ chối khởi động nếu `Jwt:Secret` thiếu, dưới 32 byte, hoặc vẫn là khóa placeholder — lỗi dạng:

```
InvalidOperationException: Invalid startup configuration: [1] Jwt:Secret is missing or empty. Set it via the Jwt__Secret environment variable or your platform's secret manager. ...
```

Frontend `.env` (xem `GMind-Frontend/.env.example`):
- `VITE_API_URL` — base URL của Axios **và** của SignalR hub (`{VITE_API_URL}/hubs/realtime`). Mặc định `/` = same-origin, dùng Vite dev proxy trong development.
- `VITE_API_TIMEOUT` — timeout Axios tính bằng ms (mặc định `30000`).

## Triển khai ngoài Development (checklist)

Mục tiêu hiện tại của chủ sản phẩm là chạy và nghiệm thu trên máy local (xem `PRODUCT.md`). Đây là checklist chuẩn bị, không phải cấu hình đã được vận hành thử.

- `ASPNETCORE_ENVIRONMENT=Production` (hoặc tương đương).
- `Jwt__Secret` — khóa thật ≥ 32 byte; tạo bằng PowerShell:
  ```powershell
  [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
  ```
- `ConnectionStrings__DefaultConnection` trỏ SQL Server thật (tài khoản quyền tối thiểu, không dùng `sa`).
- `Cors__AllowedOrigins__0` = origin frontend thật; `Auth__FrontendUrl` = URL công khai của app (dùng trong link email).
- `Storage__RootPath` tới thư mục bền vững — backup cùng database.
- `AllowedHosts` thu hẹp theo hostname thật (mặc định `*`).
- HTTPS bắt buộc: ngoài Development đã bật HSTS và redirect HTTPS.
- Reverse proxy: chưa cấu hình Forwarded Headers, nên giới hạn tần suất theo IP sẽ tính theo IP của proxy — cần thêm `ForwardedHeaders` khi đặt sau proxy.
- SignalR đang chạy một server; scale-out nhiều instance cần backplane (ví dụ Redis).
- Email: chưa có provider — ngoài Development các tính năng cần email báo "chưa được cấu hình" (`IEmailSender` hiện chỉ có implementation hộp thư dev). Cần gắn SMTP/provider thật và đăng ký implementation thay thế.
- Chưa có quét virus cho file tải lên; mọi file tải về dạng attachment kèm `nosniff`. Cân nhắc AV ở tầng storage khi triển khai.
- Frontend: `npm --prefix GMind-Frontend run build` → phục vụ `dist/` với SPA fallback; proxy `/api` và `/hubs` (WebSocket) tới API — hoặc đặt `VITE_API_URL` trỏ thẳng API base (lúc build, vì biến `VITE_*` được inline).

## Kiểm thử

### Backend — `GMind.Tests` (xUnit)

```bash
dotnet test GMind-Backend/GMind.Tests/GMind.Tests.csproj
dotnet test GMind-Backend/GMind.Tests/GMind.Tests.csproj --filter FullyQualifiedName~<TestClass>
```

Gồm unit tests (password hashing, token service) và integration tests qua `Microsoft.AspNetCore.Mvc.Testing` (WebApplicationFactory) với EF Core InMemory/Sqlite và `Microsoft.AspNetCore.SignalR.Client`.

### Frontend — unit/component + lint + build

```bash
npm --prefix GMind-Frontend run lint          # oxlint
npm --prefix GMind-Frontend run test -- --run # Vitest (chỉ src/**)
npm --prefix GMind-Frontend run build         # tsc -b (gồm cả e2e) + production build
```

### E2E — Playwright (`GMind-Frontend/e2e`)

```bash
npm --prefix GMind-Frontend run e2e          # chạy suite (Edge channel mặc định)
npm --prefix GMind-Frontend run e2e:report   # xem HTML report gần nhất
```

- Yêu cầu: database đã migrate. Playwright tự khởi động API (`dotnet run`) và Vite nếu chưa chạy — khi tự khởi động nó nâng giới hạn đăng nhập qua env (`RateLimiting__LoginPermitLimit=1000`). Khi tái sử dụng một dev API đang chạy với giới hạn mặc định (10 lần/phút/IP), suite vẫn nằm trong ngân sách (~5 lần đăng nhập mỗi lần chạy; bốn tài khoản dùng chung được làm mới qua `/api/auth/refresh` không bị giới hạn).
- Mặc định dùng Microsoft Edge đã cài (`channel: 'msedge'`) — không tải browser của Playwright. Để dùng Chromium của Playwright: `npx playwright install chromium` rồi `PW_CHANNEL=chromium npm --prefix GMind-Frontend run e2e`.
- Trình duyệt base có thể đổi qua `E2E_BASE_URL` (mặc định `http://localhost:5173`).
- Artifacts lỗi (trace + screenshot + error context) nằm trong `GMind-Frontend/test-results/` (đã gitignore cùng `playwright-report/`, `blob-report/`, `e2e/.auth/`).
- Cảnh báo dữ liệu: mỗi lần chạy tạo tài khoản `e2e-…@e2e.gmind.test`, nhóm, dự án, công việc mới trong database dev và **không tự xóa**. Không chạy E2E trên database chứa dữ liệu thật.

## Bảo mật

- Mật khẩu hash bằng BCrypt.Net-Next.
- JWT access token (60 phút) + refresh token rotation theo từng phiên (`sid` claim); tối đa 10 phiên đồng thời; danh sách phiên và thu hồi từng/tất cả phiên; đổi hoặc đặt lại mật khẩu kết thúc mọi phiên; IP lưu dạng rút gọn (IPv4 /24, IPv6 /48).
- Phân quyền kiểm tra phía server trên mọi endpoint: Trưởng nhóm/Thành viên, membership đang hoạt động, trạng thái lưu trữ của nhóm/dự án.
- Giới hạn tần suất theo IP cho đăng nhập/đăng ký, khôi phục mật khẩu, tải tệp, gửi thảo luận (bảng cấu hình ở trên).
- Header bảo mật trên mọi phản hồi: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, CSP `default-src 'none'; frame-ancestors 'none'` (bỏ CSP riêng cho `/swagger` ở Development); HSTS + redirect HTTPS ngoài Development.
- Kiểm tra cấu hình lúc khởi động (fail-fast, không in giá trị secret).
- File tải lên: kiểm tra đuôi tệp **và** chữ ký nội dung; whitelist định dạng (pdf, doc, docx, xls, xlsx, ppt, pptx, txt, md, csv, png, jpg, jpeg, gif, webp, zip — không svg/html/exe/script); giới hạn dung lượng và hạn mức nhóm; tải về dạng attachment + `nosniff`; tên lưu trữ ngẫu nhiên ngoài webroot.
- Secrets không commit vào Git; `.env`, file credentials và thư mục auth của E2E đã được gitignore.

## Giới hạn đã biết

Chi tiết và lý do trong `docs/decisions/OPEN_QUESTIONS.md` và `docs/discovery/stage-2-roadmap.md`:

- Chưa có email provider thật — ngoài Development các tính năng email báo "chưa được cấu hình".
- Realtime một server; scale-out cần SignalR backplane (Redis).
- Chưa có quét virus cho file tải lên.
- Hai lượt tải lên đồng thời có thể vượt hạn mức nhóm một chút (kiểm tra hạn mức không atomic).
- Công thức điểm đóng góp chưa được chủ sản phẩm xác nhận.
- Ô nhập ngày dùng input `date` của trình duyệt, hiển thị theo locale của trình duyệt.
- Nhóm lưu trữ bị khóa hoàn toàn — chưa có chế độ xem chỉ đọc.
- Yêu cầu Marketplace ở "Đang mở"/"Chờ người nhận" không tự hết hạn.
- Ảnh đại diện được phục vụ không cần đăng nhập qua URL khó đoán (cần thiết để ảnh hiển thị trong mọi ngữ cảnh; URL đổi mỗi lần thay ảnh).
- Chưa cấu hình Forwarded Headers — sau reverse proxy, rate limit theo IP sẽ tính theo IP proxy.
- Chạy bằng nút Run/F5 trong giao diện Visual Studio chưa được xác nhận (build/proxy/login qua CLI đã kiểm tra).
- Dữ liệu tạo bởi E2E không tự xóa khỏi database dev.
- Các gói MediatR/FluentValidation/Mapster được tham chiếu/đăng ký nhưng chưa có code sử dụng.

## Tài liệu liên quan

- [Business Analysis Specification v1.0 (.md)](docs/requirements/GMind_Business_Analysis_Specification_v1.0.md) và [bản .docx](docs/requirements/GMind_Business_Analysis_Specification_v1.0.docx)
- [AI Implementation Prompt](docs/requirements/GMind_AI_Implementation_Prompt.txt)
- [AGENTS.md](AGENTS.md) — quy tắc cho AI coding agents
- [PRODUCT.md](PRODUCT.md) — mục tiêu & ràng buộc sản phẩm
- [DESIGN.md](DESIGN.md) — design system
- [docs/decisions/OPEN_QUESTIONS.md](docs/decisions/OPEN_QUESTIONS.md) — giả định & quyết định chờ xác nhận
- [docs/discovery/stage-2-roadmap.md](docs/discovery/stage-2-roadmap.md) — lộ trình stage 2
- [docs/discovery/stage-1-discovery-report.md](docs/discovery/stage-1-discovery-report.md)

Giấy phép: chưa xác định.
