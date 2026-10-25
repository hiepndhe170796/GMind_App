# GMind User Flows

Đây là tài liệu mô tả các luồng người dùng chính trong GMind.

## Flow 1: Đăng ký và Tạo Nhóm (Onboarding)

### Bước 1: Đăng ký
**User:** Người dùng mới chưa có tài khoản
**Screen:** `/register`

**Actions:**
1. Nhập tên hiển thị
2. Nhập email
3. Nhập mật khẩu
4. Nhập xác nhận mật khẩu
5. Click "Đăng ký"

**Validation:**
- Email phải đúng định dạng và chưa được dùng
- Mật khẩu tối thiểu 8 ký tự
- Xác nhận mật khẩu phải khớp

**Result:**
- Tài khoản được tạo
- User được chuyển đến trang đăng nhập
- Hoặc auto-login (tùy chọn)

---

### Bước 2: Đăng nhập
**User:** Người dùng đã có tài khoản
**Screen:** `/login`

**Actions:**
1. Nhập email
2. Nhập mật khẩu
3. (Optional) Check "Remember me"
4. Click "Đăng nhập"

**Validation:**
- Email và mật khẩu phải khớp
- Tài khoản phải đang active

**Result:**
- User được đăng nhập
- Session được tạo với JWT token
- User được chuyển đến Dashboard hoặc First-use

---

### Bước 3: First-use / Join Group
**User:** User đã đăng nhập nhưng chưa có nhóm
**Screen:** `/join-group`

**Option A: Tạo nhóm mới**
1. Click "Tạo nhóm mới"
2. Nhập tên nhóm
3. Nhập mô tả (optional)
4. Click "Tạo nhóm"
5. User trở thành Leader của nhóm
6. Chuyển đến Group Workspace

**Option B: Tham gia bằng mã/link**
1. Click "Tham gia bằng mã"
2. Nhập mã nhóm hoặc paste link
3. Click "Tham gia"
4. Nếu mã hợp lệ → User trở thành Member
5. Chuyển đến Group Workspace
6. Nếu mã không hợp lệ → Hiển thị lỗi

---

## Flow 2: Quản lý Dự án và Task (Leader)

### Bước 1: Tạo Project
**User:** Leader
**Screen:** `/groups/:groupId`

**Actions:**
1. Click "Tạo dự án mới"
2. Nhập tên dự án
3. Nhập mô tả (optional)
4. Nhập môn học (optional)
5. Chọn deadline
6. (Optional) Thêm URL tài liệu
7. Click "Tạo dự án"

**Result:**
- Project được tạo
- Chuyển đến Project Overview

---

### Bước 2: Tạo Task
**User:** Leader
**Screen:** `/groups/:groupId/projects/:projectId/tasks`

**Actions:**
1. Click "Thêm task mới"
2. Nhập tên task
3. Nhập mô tả (optional)
4. Chọn assignee từ danh sách thành viên
5. Chọn deadline
6. Chọn priority (Low, Medium, High)
7. Nhập estimate hours (optional)
8. (Optional) Thêm subtasks
9. Click "Tạo task"

**Result:**
- Task được tạo
- Assignee nhận notification
- Task xuất hiện trong dashboard của assignee
- Activity log ghi lại

---

### Bước 3: Gán/Đổi Assignee
**User:** Leader
**Screen:** Task Detail

**Actions:**
1. Mở Task Detail
2. Click dropdown assignee
3. Chọn member mới
4. (Optional) Nhập lý do đổi
5. Click "Lưu"

**Result:**
- Assignee được cập nhật
- Assignee cũ và mới nhận notification
- Activity log ghi lại before/after

---

## Flow 3: Làm việc với Task (Member)

### Bước 1: Xem Task Cá nhân
**User:** Member
**Screen:** `/dashboard`

**Actions:**
1. Mở Dashboard
2. Xem task theo filter (Hôm nay, Sắp đến hạn, Quá hạn, Tất cả)
3. Click vào task để xem chi tiết

**Information hiển thị:**
- Tên task, project, deadline
- Trạng thái, priority
- % tiến độ hiện tại

---

### Bước 2: Cập nhật Tiến độ
**User:** Member (assignee)
**Screen:** Task Detail

**Actions:**
1. Mở Task Detail
2. Kéo slider progress hoặc nhập % (0-100)
3. (Optional) Nhập comment về progress
4. Click "Cập nhật"

**Result:**
- Progress được lưu
- Activity log ghi lại
- Leader có thể thấy progress trong Leader Dashboard

---

### Bước 3: Submit Task
**User:** Member (assignee)
**Screen:** Task Detail

**Actions:**
1. Set progress = 100%
2. (Optional) Nhập note bàn giao
3. Click "Submit để review"

**Result:**
- Task status chuyển sang "Submitted"
- SubmittedAt được lưu
- Leader nhận notification
- Task không thể edit thêm (trừ khi Leader yêu cầu sửa)

---

## Flow 4: Review và Approve Task (Leader)

### Bước 1: Xem Task cần Review
**User:** Leader
**Screen:** `/groups/:groupId/progress` hoặc Dashboard

**Actions:**
1. Xem danh sách task "Submitted"
2. Click vào task để review

---

### Bước 2: Review Task
**User:** Leader
**Screen:** Task Detail

**Option A: Approve**
1. Xem task details và comment bàn giao
2. (Optional) Nhận xét / feedback
3. Click "Approve"

**Result:**
- Task status chuyển sang "Completed"
- Progress = 100%
- CompletedAt được lưu
- Assignee nhận notification
- Activity log ghi lại

**Option B: Yêu cầu sửa**
1. Xem task details
2. Nhập feedback chi tiết
3. Click "Yêu cầu sửa"

**Result:**
- Task status quay lại "In Progress"
- Assignee nhận notification với feedback
- Assignee có thể edit task và submit lại
- Activity log ghi lại lần review

---

## Flow 5: Marketplace - Need Help

### Bước 1: Yêu cầu Help
**User:** Member (assignee)
**Screen:** Task Detail

**Actions:**
1. Click "Need Help"
2. Chọn task cần hỗ trợ
3. Mô tả phần cần hỗ trợ
4. Nhập lý do
5. Click "Gửi yêu cầu"

**Result:**
- Request được tạo với status "Pending"
- Leader nhận notification
- Request xuất hiện trong Marketplace

---

### Bước 2: Leader Duyệt Need Help
**User:** Leader
**Screen:** `/marketplace` hoặc từ notification

**Actions:**
1. Xem request details
2. Xem workload của các member
3. Chọn người hỗ trợ (optional)
4. Nhập comment (optional)
5. Click "Accept" hoặc "Reject"

**If Accept:**
- Request status = "Approved"
- Người hỗ trợ được ghi nhận
- Tất cả bên liên quan nhận notification
- Activity log ghi lại

**If Reject:**
- Request status = "Rejected"
- Requester nhận notification với lý do
- Task không thay đổi

---

## Flow 6: Marketplace - Transfer Task

### Bước 1: Yêu cầu Transfer
**User:** Member (assignee)
**Screen:** Task Detail

**Actions:**
1. Click "Transfer"
2. Chọn task muốn chuyển
3. Chọn người nhận (optional, hoặc để Leader chọn)
4. Nhập lý do
5. Click "Gửi yêu cầu"

**Result:**
- Request được tạo với status "Pending"
- Leader nhận notification
- Task KHÔNG đổi assignee ngay

---

### Bước 2: Leader Duyệt Transfer
**User:** Leader
**Screen:** `/marketplace`

**Actions:**
1. Xem request details
2. Xem workload của người nhận đề xuất
3. Chọn người nhận (nếu chưa chọn)
4. Nhận xét deadline và workload
5. Click "Accept" hoặc "Reject"

**If Accept:**
- Task assignee được cập nhật (trong transaction)
- Request status = "Approved"
- Cả hai member và Leader nhận notification
- Activity log ghi before/after assignee

**If Reject:**
- Request status = "Rejected"
- Requester nhận notification với lý do
- Task assignee không đổi

---

## Flow 7: Marketplace - Swap Task

### Bước 1: Yêu cầu Swap
**User:** Member
**Screen:** Task Detail

**Actions:**
1. Click "Swap"
2. Chọn task của mình muốn đổi
3. Chọn task của member khác muốn đổi với
4. Nhập lý do
5. Click "Gửi yêu cầu"

**Result:**
- Request được tạo với status "Pending"
- Leader nhận notification
- Cả hai task không đổi assignee ngay

---

### Bước 2: Leader Duyệt Swap
**User:** Leader
**Screen:** `/marketplace`

**Actions:**
1. Xem request details
2. Xem workload của cả hai member
3. Đánh giá deadline và task complexity
4. Click "Accept" hoặc "Reject"

**If Accept:**
- Cả hai task đổi assignee (trong transaction)
- Request status = "Approved"
- Cả hai member và Leader nhận notification
- Activity log ghi before/after cho cả hai task

**If Reject:**
- Request status = "Rejected"
- Cả hai member nhận notification với lý do
- Cả hai task không đổi assignee

---

## Flow 8: Notifications

### Nhận Notification
**User:** Bất kỳ user
**Trigger:** Các sự kiện quan trọng

**Sự kiện:**
- Được giao task
- Đổi deadline/assignee
- Task submit
- Task approve/reject
- Marketplace request (tạo, duyệt, từ chối)
- Deadline reminder (3 ngày, 1 ngày, 3 giờ trước)
- Task quá hạn

**Action:**
1. Notification badge cập nhật số unread
2. User click vào notification bell
3. Xem danh sách notifications
4. Click vào notification → navigate đến related resource
5. Notification tự động mark as read

---

## Flow 9: Quản lý Thành viên (Leader)

### Bước 1: Mời Thành viên
**User:** Leader
**Screen:** `/groups/:groupId`

**Actions:**
1. Click "Mời thành viên"
2. Chọn "Tạo mã mời" hoặc "Gửi link"
3. (Optional) Set expiry time
4. (Optional) Set max uses
5. Click "Tạo"

**Result:**
- Mã/link được tạo
- Leader có thể copy/share
- Member có thể dùng mã/link để tham gia

---

### Bước 2: Xóa Thành viên
**User:** Leader
**Screen:** Member list

**Actions:**
1. Click "Xóa" bên cạnh member
2. Confirm dialog hiển thị
3. (Optional) Nhập lý do
4. Click "Xóa"

**Validation:**
- Không thể xóa Leader duy nhất
- Cảnh báo nếu member còn task đang phụ trách

**Result:**
- Member bị xóa khỏi nhóm
- Member nhận notification
- Activity log ghi lại
- Tasks của member có thể được reassign hoặc để orphan (policy cần chốt)

---

## Flow 10: Deadline Reminders

### Tự động nhắc deadline
**Trigger:** Background job chạy định kỳ

**Logic:**
1. Check tất cả tasks có deadline
2. So sánh với mốc nhắc (3 ngày, 1 ngày, 3 giờ trước)
3. Với mỗi mốc:
   - Check deduplication key (task + recipient + reminder type)
   - Nếu chưa gửi → tạo notification
   - Nếu đã gửi → skip
4. Nếu task completed trước mốc → skip tất cả nhắc trước hạn
5. Nếu deadline đổi → tính lại lịch nhắc

**Result:**
- Assignee nhận notification
- Notification có link đến task
- Không gửi trùng (deduplication)

---

## Flow 11: Error States

### Connection Error
**Screen:** Bất kỳ màn hình API call

**Actions:**
1. API call thất bại
2. UI hiển thị error state
3. Hiển thị message: "Không thể kết nối đến server"
4. Button: "Thử lại"

---

### Empty State
**Screen:** Dashboard, Task list, etc.

**Actions:**
1. Không có dữ liệu
2. UI hiển thị empty state
3. Illustration + message
4. CTA: "Tạo task mới", "Tham gia nhóm", etc.

---

### Loading State
**Screen:** Bất kỳ màn hình

**Actions:**
1. Data đang tải
2. UI hiển thị loading spinner
3. Hoặc skeleton screens
4. Disable actions khi loading

---

## Accessibility Considerations

### Keyboard Navigation
- Tất cả interactive elements phải có keyboard access
- Tab order logic
- Focus visible
- Escape key đóng modals

### Screen Reader
- Semantic HTML
- ARIA labels cho icons
- Alt text cho images
- Live regions cho dynamic content

### Color Contrast
- WCAG AA compliance
- Không chỉ dựa vào màu để convey meaning
- High contrast cho text
