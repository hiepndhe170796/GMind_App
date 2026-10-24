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
- **Framework:** React 18 với TypeScript
- **Build Tool:** Vite
- **Routing:** React Router
- **Data Fetching:** TanStack Query
- **HTTP Client:** Axios
- **Styling:** (Chưa quyết định - Milestone 0.5 sẽ xác định)

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
- .NET 11 SDK (hoặc .NET 8 trở lên)
- SQL Server 2022 (LocalDB hoặc Developer Edition)
- SQL Server Management Studio (SSMS) - tùy chọn

**Frontend:**
- Node.js 20 LTS hoặc mới nhất
- npm hoặc pnpm

**Dev Tools:**
- Git
- Visual Studio 2022 hoặc VS Code với C# extension
- Postman hoặc Insomnia (để test API)

### Cài đặt Backend

1. **Restore dependencies:**
```bash
cd GMind-Backend
dotnet restore
```

2. **Setup database connection:**
   - Copy `GMind.API/.env.example` thành `GMind.API/.env`
   - Cập nhật connection string trong `.env` file:
   ```env
   ConnectionStrings__DefaultConnection=Server=localhost;Database=GMindDB;Trusted_Connection=True;TrustServerCertificate=True;
   ```

3. **Tạo và apply database migration:**
```bash
cd GMind.Infrastructure
dotnet ef migrations add InitialCreate --startup-project ../GMind.API
dotnet ef database update --startup-project ../GMind.API
```

4. **Chạy backend:**
```bash
cd GMind.API
dotnet run
```

Backend sẽ chạy tại `http://localhost:5000` (hoặc port khác được cấu hình trong `Properties/launchSettings.json`)

API documentation có sẵn tại `http://localhost:5000/swagger`

### Cài đặt Frontend

1. **Install dependencies:**
```bash
cd GMind-Frontend
npm install
```

2. **Setup environment variables:**
   - Copy `.env.example` thành `.env`
   - Cập nhật API URL nếu cần:
   ```env
   VITE_API_URL=http://localhost:5000
   ```

3. **Chạy frontend (development):**
```bash
npm run dev
```

Frontend sẽ chạy tại `http://localhost:5173` (Vite default)

4. **Build frontend (production):**
```bash
npm run build
```

## 🧪 Testing

### Backend Tests
```bash
cd GMind-Backend/GMind.Tests
dotnet test
```

### Frontend Tests
```bash
cd GMind-Frontend
npm run test
```

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
