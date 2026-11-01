# GMind Sitemap

Sitemap định nghĩa cấu trúc các trang và luồng điều hướng trong ứng dụng GMind.

## Trang Công khai (Public)

### Landing Page
- **Path:** `/`
- **Mục đích:** Giới thiệu GMind, CTA đăng ký/đăng nhập
- **Elements:**
  - Hero section với slogan
  - Features overview
  - CTA: Đăng ký ngay
  - Footer với links

### Đăng ký
- **Path:** `/register`
- **Mục đích:** Người dùng mới tạo tài khoản
- **Elements:**
  - Form: tên hiển thị, email, mật khẩu, xác nhận mật khẩu
  - Validation: email format, password strength
  - Link: Đã có tài khoản? Đăng nhập

### Đăng nhập
- **Path:** `/login`
- **Mục đích:** Người dùng hiện tại đăng nhập
- **Elements:**
  - Form: email, mật khẩu
  - Remember me checkbox
  - Link: Quên mật khẩu
  - Link: Chưa có tài khoản? Đăng ký

### Quên mật khẩu
- **Path:** `/forgot-password`
- **Mục đích:** Khôi phục mật khẩu
- **Elements:**
  - Form: email
  - Gửi link reset qua email
  - Link: Quay lại đăng nhập

### Reset mật khẩu
- **Path:** `/reset-password?token=...`
- **Mục đích:** Đặt lại mật khẩu với token
- **Elements:**
  - Form: mật khẩu mới, xác nhận mật khẩu mới
  - Validation: password strength
  - Link: Quay lại đăng nhập

## Trang yêu cầu đăng nhập (Authenticated)

### First-use / Join Group
- **Path:** `/join-group`
- **Mục đích:** Người dùng mới chưa có nhóm
- **Elements:**
  - Card: Tạo nhóm mới
  - Card: Tham gia bằng mã/link
  - Empty state illustration

### Dashboard cá nhân
- **Path:** `/dashboard`
- **Mục đích:** Tổng quan task cá nhân
- **Elements:**
  - Stats cards: total tasks, completed, in progress, overdue, upcoming
  - Task list theo filter: Hôm nay, Ngày mai, Sắp đến hạn, Quá hạn, Tất cả
  - Mini calendar / deadline list
  - Quick actions: Tạo task mới, Xem notifications

### Workspace Nhóm
- **Path:** `/groups/:groupId`
- **Mục đích:** Tổng quan nhóm
- **Elements:**
  - Group info: tên, mô tả, số thành viên
  - Member list với vai trò (Leader/Member)
  - Project list
  - Activity feed gần đây
  - Leader actions: mời thành viên, quản lý member

### Project Overview
- **Path:** `/groups/:groupId/projects/:projectId`
- **Mục đích:** Tổng quan dự án
- **Elements:**
  - Project info: tên, mô tả, môn học, deadline
  - Progress bar
  - Task counts: total, completed, in progress, overdue
  - Task list với filters
  - Leader actions: edit project, add task

### Task List / Kanban
- **Path:** `/groups/:groupId/projects/:projectId/tasks`
- **Mục đích:** Xem và quản lý tasks
- **Elements:**
  - View toggle: List / Kanban
  - Filters: assignee, status, priority, deadline
  - Sort options
  - Task cards với key info
  - Leader actions: add task, bulk actions

### Task Detail
- **Path:** `/groups/:groupId/projects/:projectId/tasks/:taskId`
- **Mục đích:** Chi tiết và chỉnh sửa task
- **Elements:**
  - Task info: tên, mô tả, assignee, deadline, priority, estimate
  - Progress slider / percentage input
  - Status dropdown
  - Subtasks list
  - Comments section
  - Attachments (URLs)
  - Submit button (nếu assignee)
  - Review/approve actions (nếu Leader)
  - Activity log
  - Marketplace actions: Need Help, Transfer, Swap

### Leader Progress Dashboard
- **Path:** `/groups/:groupId/progress`
- **Mục đích:** Leader xem tiến độ nhóm
- **Elements:**
  - Project overview cards
  - Member progress table
  - Overdue tasks list
  - Upcoming deadlines
  - Stale tasks (không cập nhật lâu)
  - Quick actions: nhắc member, thay deadline, phân bổ lại

### Notifications
- **Path:** `/notifications`
- **Mục đích:** Xem thông báo
- **Elements:**
  - Notification list với unread badge
  - Filter: all, unread, types
  - Mark all as read
  - Notification item: type, title, body, timestamp, related link
  - Delete individual / bulk delete

### Activity Log
- **Path:** `/groups/:groupId/activity`
- **Mục đích:** Xem lịch sử hoạt động (Leader only)
- **Elements:**
  - Filters: member, time range, project, action type
  - Activity list: actor, action, entity, timestamp, before/after
  - Pagination

### Marketplace
- **Path:** `/marketplace`
- **Mục đích:** Yêu cầu hỗ trợ/chuyển/đổi task
- **Elements:**
  - Tabs: Yêu cầu của tôi, Chờ duyệt, Đã duyệt/từ chối
  - Form tạo request: Need Help / Transfer / Swap
  - Request card: type, task, reason, status, timestamp
  - Leader actions: view, approve, reject with comment

### Files / Links
- **Path:** `/groups/:groupId/projects/:projectId/files`
- **Mục đích:** Quản lý tài liệu liên quan
- **Elements:**
  - File/link list: name, type, creator, timestamp
  - Add new URL
  - Upload file (phase sau)
  - Delete actions (theo quyền)

### Settings / Profile
- **Path:** `/settings`
- **Mục đích:** Cài đặt cá nhân
- **Elements:**
  - Profile: tên hiển thị, avatar, email
  - Change password: current, new, confirm
  - Notification preferences: channel, reminder settings
  - Theme: light/dark mode
  - Logout

## Luồng điều hướng chính

### Onboarding Flow
```
Landing → Đăng ký → Đăng nhập → First-use/Join Group → Dashboard
```

### Làm việc với task (Member)
```
Dashboard → Click task → Task Detail → Cập nhật tiến độ/Submit → Dashboard
```

### Quản lý dự án (Leader)
```
Dashboard → Group Workspace → Project Overview → Task List → Task Detail
```

### Review task (Leader)
```
Dashboard → Leader Progress → Click task cần review → Task Detail → Approve/Yêu cầu sửa
```

### Marketplace
```
Task Detail → Yêu cầu Need Help/Transfer/Swap → Marketplace → Leader duyệt → Task cập nhật
```

## Breadcrumb Navigation

Các trang con nên có breadcrumb để dễ dàng điều hướng:

```
Groups → [Group Name] → Projects → [Project Name] → Tasks → [Task Name]
Groups → [Group Name] → Progress
Groups → [Group Name] → Activity
```

## Navigation Structure

### Main Navigation (Authenticated)
- Dashboard
- Groups (dropdown)
- Tasks (dropdown)
- Notifications (with badge)
- Profile/Settings

### Secondary Navigation
- Contextual based on current page
- Example: trong Project → Tasks, Files, Members

## Not Found & Error Pages

### 404 Not Found
- **Path:** `/404`
- **Elements:** Error message, illustration, button: Quay lại trang chủ

### 500 Server Error
- **Path:** `/500`
- **Elements:** Error message, illustration, button: Thử lại, Contact support

## URL Convention

```
/groups/:groupId
/groups/:groupId/projects/:projectId
/groups/:groupId/projects/:projectId/tasks/:taskId
/groups/:groupId/progress
/groups/:groupId/activity
/marketplace
/notifications
/settings
```

Tất cả URLs nên sử dụng RESTful convention với snake_case cho segment names.

## A2 additions
- `/dashboard` — overview (stats, attention list, mini calendar, groups, upcoming deadlines).
- `/groups` — group list cards; `/groups/:id` remains group detail.
