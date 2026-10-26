# GMind - Ứng dụng Quản lý Dự án Nhóm Sinh Viên

GMind là ứng dụng web hỗ trợ sinh viên tổ chức bài tập và dự án nhóm: tạo nhóm, lập dự án, chia task, giao người phụ trách, theo dõi deadline, phối hợp trao đổi, kiểm tra kết quả và quan sát tiến độ.

## 📋 Tài liệu Yêu cầu

- [Business Analysis Specification v1.0](docs/requirements/GMind_Business_Analysis_Specification_v1.0.md) - Đặc tả nghiệp vụ chi tiết
- [AI Implementation Prompt](docs/requirements/GMind_AI_Implementation_Prompt.txt) - Hướng dẫn triển khai cho AI
- [AGENTS.md](AGENTS.md) - Hướng dẫn cho AI coding agents

## 🏗️ Kiến trúc

### Backend (ASP.NET Core Web API)
- **Framework:** .NET 11 (ASP.NET Core Web API)
- **Architecture:** Clean Architecture (Domain, Application, Infrastructure, API layers)
- **Database:** SQL Server với Entity Framework Core
- **Authentication:** JWT Bearer Token
- **API Documentation:** Swagger/OpenAPI
- **Libraries:**
  - MediatR (CQRS pattern)
  - FluentValidation (validation)
  - Mapster (object mapping)

### Frontend (React + TypeScript)
- **Framework:** React 19 với TypeScript
- **Build Tool:** Vite
- **Routing:** React Router
- **Data Fetching:** TanStack Query
- **HTTP Client:** Axios
- **Styling:** Tailwind CSS 3

## 📁 Cấu trúc Dự án

```
GMind_App/
├── GMind-Backend/                 # Backend solution
│   ├── GMind.Domain/              # Domain layer (entities, enums, interfaces)
│   ├── GMind.Application/         # Application layer (services, commands, queries)
│   ├── GMind.Infrastructure/      # Infrastructure layer (EF Core, migrations)
│   └── GMind.API/                 # API layer (controllers, DTOs)
├── GMind-Frontend/                # Frontend React app
│   ├── src/
│   │   ├── components/            # Reusable components
│   │   ├── pages/                 # Page components
│   │   ├── services/              # API services
│   │   └── types/                 # TypeScript types
│   └── public/
├── docs/                          # Documentation
│   └── requirements/              # BA specification
├── AGENTS.md                      # AI coding agents instructions
└── README.md                      # This file
```

## 🚀 Cài đặt và Chạy

### Yêu cầu Môi trường

**Backend:**
- .NET 11 SDK
- SQL Server 2022 (LocalDB hoặc Developer Edition)
- SQL Server Management Studio (SSMS) - tùy chọn

**Frontend:**
- Node.js 24 LTS (đã kiểm tra với Node.js 24.15)
- npm hoặc pnpm

**Dev Tools:**
- Git
- Visual Studio (workload "ASP.NET and web development" + "Node.js development" để chạy `.esproj`) hoặc VS Code với C# extension
- Postman hoặc Insomnia (để test API)

### Cài đặt Backend

1. **Restore dependencies:**
```bash
dotnet restore GMind-Backend/GMind.API/GMind.API.csproj
```

2. **Setup configuration/secrets:**
   - ASP.NET Core không tự đọc file `.env`. Dùng **Manage User Secrets** trong Visual Studio (chuột phải `GMind.API`) hoặc environment variables (ví dụ `ConnectionStrings__DefaultConnection`, `Jwt__Secret`) cho giá trị riêng; không đặt secrets vào các file `appsettings` được theo dõi bởi Git.
   - Connection string mặc định trỏ LocalDB `GMindDB`; override qua user secrets/environment khi cần, không commit secrets.

3. **Apply database migration:**
   - Migration `InitialCreate` đã có sẵn trong `GMind.Infrastructure/Migrations` — không tạo lại.
   - Package Manager Console trong Visual Studio: chọn Default project `GMind.Infrastructure`, Startup project `GMind.API`, chạy `Update-Database`.
   - Hoặc CLI:
   ```bash
   dotnet ef database update --project GMind-Backend/GMind.Infrastructure --startup-project GMind-Backend/GMind.API
   ```

4. **Chạy backend:**
```bash
dotnet run --project GMind-Backend/GMind.API --launch-profile http
```

Backend sẽ chạy tại `http://localhost:5194` (profile `http` trong `Properties/launchSettings.json`)

API documentation có sẵn tại `http://localhost:5194/swagger`

Health checks: `GET /api/health/live` (process sống) và `GET /api/health/ready` (kết nối được SQL Server mới trả 200).

### Cài đặt Frontend

1. **Install dependencies:**
```bash
cd GMind-Frontend
npm install
```

2. **Setup environment variables:**
   - Copy `.env.example` thành `.env`
   - Mặc định dùng same-origin qua Vite dev proxy (`/api` -> `http://127.0.0.1:5194`), không cần đổi:
   ```env
   VITE_API_URL=/
   ```

3. **Chạy frontend (development):**
```bash
npm run dev
```

Frontend sẽ chạy tại `http://localhost:5173` (strict port)

4. **Build frontend (production):**
```bash
npm run build
```

### Chạy trong Visual Studio

1. Mở `GMind.slnx`. Solution gồm backend (`GMind-Backend/*`) và frontend `GMind-Frontend/GMind-Frontend.esproj`.
2. Nếu `.esproj` không load: cần workload **Node.js development** (JavaScript/TypeScript Project System) — cài qua Visual Studio Installer rồi mở lại solution.
3. Chọn startup profile **"GMind - API + Frontend"** (định nghĩa trong `GMind.slnLaunch`) rồi Run/F5: API chạy profile `http` tại `http://localhost:5194`, frontend chạy `npm run dev` và mở `http://localhost:5173` trong Edge.
4. Fallback nếu profile không hiện: chuột phải solution -> **Configure Startup Projects** -> Multiple startup projects: `GMind.API` (launch profile `http`) và `GMind-Frontend` (launch `GMind Frontend (Edge)` trong `.vscode/launch.json`).
5. Khi API chưa chạy, request `/api` qua Vite proxy trả 503 `API_UNAVAILABLE` với thông báo tiếng Việt thay vì lỗi network chung chung.

Các lệnh backend ở trên chạy từ thư mục gốc repository. Build project frontend, proxy và đăng nhập đã được kiểm tra; thao tác Run/F5 trong giao diện Visual Studio vẫn cần xác nhận trên máy người dùng. Cổng 5173 và 5194 phải chưa bị một phiên chạy khác chiếm khi khởi động bằng F5.

## 🧪 Testing

### Backend Tests
Unit + WebApplicationFactory HTTP tests: auth/token service, health endpoints, task authorization (member privacy, Leader-only), session revocation/concurrency (logout/change/reset password, refresh rotation, `auth_version` claim).
```bash
cd GMind-Backend/GMind.Tests
dotnet test
```

### Frontend Tests
Vitest: unit tests cho error normalizer (`src/services/api-errors.test.ts`), workspace loaders (`src/services/workspace.test.ts`) và session/axios refresh-rotation (`src/services/api-session.test.ts`); component tests cho privacy/permission-loss (`src/pages/workspace-access.test.tsx`) và ProtectedRoute/Login return-path (`src/components/ProtectedRoute.test.tsx`, jsdom). E2E tests chưa có.
Protected routes qua `<ProtectedRoute>` (validate `/api/me` mỗi navigation, 401 → refresh rotation một lần, logout thu hồi server). Session lưu một record `gmind.session.v1`; session legacy (3 key cũ) không được migrate — đăng nhập lại một lần.
```bash
cd GMind-Frontend
npm run test -- --run   # unit + component tests (vitest)
npm run build           # typecheck + production build
```

### Database
Migration `AddAuthVersion` (thêm `Users.AuthVersion`, additive, không xóa dữ liệu) đã được tạo; apply bằng `Update-Database` trong Package Manager Console (Default project `GMind.Infrastructure`, Startup `GMind.API`). Sau migration, các phiên đăng nhập cũ bị thu hồi — người dùng cần đăng nhập lại. Luồng F5 trong Visual Studio GUI chưa được verify tự động (đã verify bằng CLI build + proxy/runtime).

## 📦 Các Tính Năng (Theo BA Specification)

### MVP - Phiên bản đầu tiên
- ✅ Quản lý tài khoản (đăng ký, đăng nhập, quên mật khẩu)
- ✅ Quản lý nhóm và membership
- ✅ Quản lý dự án/bài tập
- ✅ Quản lý task và phân công
- ✅ Dashboard cá nhân và Leader
- ✅ Comment, submit và review
- ✅ Notification và nhắc deadline
- ✅ Activity log
- ✅ Task Marketplace cơ bản (Need Help, Transfer, Swap)
- ✅ File và tài liệu (URL/link)
- ✅ Cảnh báo task có nguy cơ trễ
- ✅ Cài đặt hệ thống

### Giai đoạn mở rộng (Later)
- Calendar, Timeline, Kanban nâng cao
- Chat nhóm thời gian thực
- Upload/download file trực tiếp
- Email/push notification
- Google sign-in
- Point đóng góp và báo cáo

## 🔐 Bảo mật

- Password được hash bằng thuật toán chuẩn (BCrypt/Argon2)
- JWT token cho authentication
- Authorization kiểm tra ở backend theo group/role
- Secrets lưu trong environment variables, không commit vào Git
- Validation input và chống SQL injection, XSS, CSRF

## 📝 Quy tắc Phát triển

Xem [AGENTS.md](AGENTS.md) để biết quy tắc chi tiết cho AI coding agents.

## 🗺️ Lộ trình Triển khai

- **Milestone 0:** Audit và Setup ✅ (hoàn thành)
- **Milestone 0.5:** UI/UX Design System
- **Milestone 1:** Database Model + Authentication
- **Milestone 2:** Groups, Invitations, Membership
- **Milestone 3:** Projects, Tasks, Assignment, Dashboard
- **Milestone 4:** Comments, Submit/Review, Activity Log
- **Milestone 5:** Notifications + Deadline Reminders
- **Milestone 6:** Marketplace (Need Help, Transfer, Swap)
- **Milestone 7:** Calendar/Kanban, File Upload, Realtime Chat (Optional)
- **Milestone 8:** Full Tests, Security Review, Handover

## 🤝 Đóng góp

Dự án đang trong giai đoạn phát triển. Vui lòng tham khảo [Business Analysis Specification](docs/requirements/GMind_Business_Analysis_Specification_v1.0.md) để hiểu phạm vi và yêu cầu.

## 📄 License

Chưa xác định.

## 📞 Liên hệ

Dự án được phát triển bởi [Tên đội nhóm].

### A1 Authorization (hiện tại)
- Task privacy + Leader/Member theo membership đang hoạt động (nhóm/project chưa lưu trữ, user active). Marketplace, notifications, group role changes dùng cùng resource-access checks; thông báo nội bộ nhóm chỉ hiển thị với thành viên active (ngoại lệ MemberRemoved của chính người nhận). Session revocation qua `AuthVersion` + refresh rotation; guard frontend validate `/api/me` mỗi navigation.
- Đã verify: backend session/membership tests, frontend workspace/session/component tests, live Edge smoke (login → refresh rotation → logout revoke). A1c regression suite deferred theo yêu cầu người dùng — sẽ bổ sung sau.

### Bản xem trước giao diện A2
- Shell xanh nhạt + sidebar trắng mới; Dashboard tổng quan, Project board/list, TaskDetail hai cột đã redesign light-only và responsive (mobile menu `<dialog>`).
- Còn lại của A2 (profile, quên/đặt lại mật khẩu qua mailbox local) chưa làm — chờ duyệt thiết kế.
