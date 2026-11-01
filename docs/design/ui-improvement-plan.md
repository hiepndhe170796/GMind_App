⚠️ DEGRADED: single-context (đánh giá thiết kế trong luồng chính, chưa có hai đánh giá độc lập).

**Giao diện hiện tại đã đủ gọn để tiếp tục hoàn thiện. Ưu tiên là đáp ứng yêu cầu Auth và làm liền mạch từng menu.** Tôi đã xem Login/Register trên Edge ở 1440px và 390px; các trang còn lại được đối chiếu qua source.

**Những phần đã có và nên giữ:**

- `/login` và `/register` đã là hai trang riêng, có liên kết qua lại.
- Register **đã có Confirm Password**, kiểm tra khớp ở frontend; backend có `[Compare(nameof(Password))]`. Trên trình duyệt, nhập lệch mật khẩu hiện lỗi và không gửi request đăng ký.
- Branding GMind, form và nút chính thống nhất; không thấy tràn ngang hoặc lỗi JavaScript trong các lượt xem Auth.

**Hai nhóm vấn đề ưu tiên:**

1. **P1 — Auth chưa đáp ứng đầy đủ yêu cầu giảng viên.** Hai trang vẫn dùng chung `AuthLayout`; Login chưa có đường “Quên mật khẩu”, router chưa có trang forgot/reset. Cần `LoginLayout` và `RegisterLayout` riêng, giữ chung logo/components; Login tập trung đăng nhập và khôi phục, Register tập trung tạo tài khoản và xác nhận mật khẩu. Giữ validation đang hoạt động, bổ sung lỗi gắn với trường nhập và hướng dẫn mật khẩu. Hướng xử lý: `layout` rồi `harden` trong cùng nhóm Auth.
2. **P2 — Các trang theo menu chưa đồng nhất về điều hướng.** `MyTasks` mở trang dự án khi bấm một task; nhãn còn trộn “Task/Projects” với tiếng Việt. Project/Task chưa giữ rõ mục sidebar đang thuộc về; Calendar chưa dùng cùng cách xử lý ngày với mini-calendar. Cần hoàn thiện đường đi và trạng thái từng menu trước khi chuyển tiếp. Hướng xử lý: `clarify` và `polish` theo từng mục.

Đánh giá heuristic **riêng Auth**, thang 0–4, điểm cao hơn tốt hơn:

| Tiêu chí | Điểm | Nhận xét chính |
|---|---:|---|
| Trạng thái hệ thống | 3 | Có loading và thông báo lỗi |
| Ngôn ngữ quen thuộc | 4 | Nhãn form rõ, tiếng Việt |
| Kiểm soát/thoát luồng | 2 | Có chuyển trang; thiếu khôi phục |
| Nhất quán | 3 | Components đồng bộ |
| Ngăn lỗi | 3 | Required, email, độ dài, xác nhận |
| Dễ nhận biết | 3 | Hành động chính rõ |
| Hiệu quả thao tác | 2 | Thiếu khai báo autocomplete phù hợp |
| Gọn và có thứ bậc | 3 | Ít nhiễu; còn điểm tương phản |
| Khắc phục lỗi | 2 | Lỗi chưa gắn rõ với trường nhập |
| Hướng dẫn | 1 | Thiếu gợi ý quy tắc mật khẩu |
| **Tổng** | **26/40** | **Chấp nhận được, cần hoàn thiện** |

Form quen thuộc phù hợp với ứng dụng thao tác; chưa có lý do thêm trang trí. Tải nhận thức thấp: Login có hai trường, Register bốn trường, mỗi trang một hành động chính. Người mới dễ bị kẹt khi quên mật khẩu; người dùng trình đọc màn hình chưa được thông báo lỗi Register qua `role="alert"` hoặc liên kết lỗi với input.

Detector source không báo lỗi, nhưng detector trên bản render phát hiện **hai điểm tương phản ở mỗi trang**: dòng giới thiệu khoảng **4,4:1**, chữ trên nút xanh khoảng **4,2:1**, dưới mức 4,5:1 cho chữ thường. Đưa vào lần sửa Auth, giữ tông xanh đã chọn. Overlay chỉ nằm trong ảnh kiểm tra, không có tab tương tác đang mở.

**Thứ tự triển khai đề xuất theo đúng sidebar:**

| Thứ tự | Nhóm trang | Phần cần hoàn thiện |
|---|---|---|
| 0 | Login, Register, Forgot/Reset | Layout riêng, liên kết rõ, validation và khôi phục tách biệt |
| 1 | **Tổng quan** — Dashboard, MiniCalendar | Thứ bậc nội dung, bộ lọc, empty/error/retry, đường mở task |
| 2 | **Việc của tôi** — MyTasks, TaskDetail | Mở đúng task; thống nhất nhãn, deadline; hoàn thiện thao tác theo quyền |
| 3 | **Nhóm của tôi** — Groups, JoinGroup, GroupDetail, ProjectDetail, Marketplace | Đi từ nhóm → dự án → task; quản lý thành viên, review và Marketplace rõ ngữ cảnh |
| 4 | **Lịch công việc** — Calendar | Đồng nhất ngày/giờ, tuần lịch, điều hướng tháng và mobile |
| 5 | **Thông báo** — Notifications | Mở đúng tài nguyên, đồng bộ badge, lỗi/thử lại |

Mỗi mục chỉ đóng khi trang chính và trang liên quan dùng được, có các trạng thái cần thiết và kiểm tra desktop/mobile. Trang dùng chung như TaskDetail sẽ được tái sử dụng. Hồ sơ/đổi mật khẩu vẫn giữ trong kế hoạch A2, đặt sau các menu hiện tại tại khu vực tài khoản cuối sidebar.

## Phạm vi file khi triển khai

- Auth: sửa `GMind-Frontend/src/pages/Login.tsx`, `Register.tsx`, `layouts/AuthLayout.tsx` và `src/App.tsx`; thêm `layouts/LoginLayout.tsx`, `layouts/RegisterLayout.tsx`, `pages/ForgotPassword.tsx`, `pages/ResetPassword.tsx`. Hai layout riêng phải có bố cục phù hợp từng tác vụ, không chỉ đổi tên cùng một wrapper. Dùng chung branding và components, không thêm ảnh/hiệu ứng trang trí.
- Luồng khôi phục dự kiến dùng `/forgot-password` và `/reset-password` riêng. Nối vào hợp đồng API hiện có, bổ sung hộp thư development theo A2; không giả lập thành công khi chưa có luồng backend. Giữ hành vi đăng ký rồi đăng nhập hiện tại và các bảo vệ session/return path.
- Components Auth liên quan: `src/components/ui/Input.tsx`, `Button.tsx`, tokens hiện có nếu cần chỉnh tương phản. Bổ sung `autocomplete`, lỗi gắn input, focus/alert; giữ chữ ký component tương thích các trang khác. Không thay palette toàn ứng dụng.
- Shell: `src/layouts/MainLayout.tsx`; giữ thứ tự menu hiện có, làm rõ active menu/breadcrumb cho trang con. Project/Task/Marketplace vẫn là trang liên quan trong cấu trúc nhóm, không tạo thêm menu cấp cao rời rạc.
- Các menu: các page/component được liệt kê theo thứ tự ở bảng trên; tái sử dụng `src/utils/presentation.ts` cho nhãn trạng thái và ngày giờ. Chỉ sửa module đang thực hiện cùng các phụ thuộc dùng chung cần thiết.

## Điều kiện đóng từng mục

1. Trang chính và các trang liên quan thực hiện được tác vụ với API/data thật, đúng Leader/Member; không coi một form tĩnh là hoàn tất.
2. Có loading, empty, error/retry, validation và phản hồi thành công phù hợp; điều hướng và nút quay lại rõ ràng.
3. Kiểm tra desktop/mobile, bàn phím và trường hợp lỗi quan trọng của mục vừa sửa. Auth phải chứng minh mật khẩu không khớp bị chặn, link qua lại đúng, hai layout riêng, quên/đặt lại mật khẩu có luồng riêng.
4. Chỉ chạy build/static checks và test liên quan đến thay đổi; không lặp lại toàn bộ bộ kiểm thử cho mỗi chỉnh sửa nhỏ. Nghiệm thu tổng thể và kiểm thử quyền mở rộng vẫn thuộc A7/A1c theo kế hoạch.
5. Đóng mục hiện tại rồi mới chuyển sang mục kế tiếp. Nếu nghiệp vụ/backend chưa đủ thì ghi phần còn thiếu và hoàn thiện tại mục đó, không bù bằng dữ liệu giả. Các yêu cầu A2–A7 còn lại không bị loại bỏ bởi thứ tự UI mới.

## Bằng chứng và giới hạn của lượt critique

- Ngày: 01/11/2026. Target lưu snapshot: `GMind-Frontend/src/pages/Register.tsx`, bao gồm Login/AuthLayout liên quan. Điểm 26/40 là đánh giá heuristic của Auth, không phải tỷ lệ test pass hay điểm toàn ứng dụng.
- Đã xem Edge 1440px/390px, kiểm tra chuyển Login ↔ Register và sai Confirm Password. Không thực hiện đăng ký thành công, đăng nhập, khôi phục mật khẩu hoặc thay đổi database trong lượt này.
- Backend `[Compare(nameof(Password))]` được xác nhận qua source; chưa chạy lại test API trong lượt critique.
- Detector source: hai file Login/Register không có findings; detector DOM: hai cảnh báo low-contrast mỗi trang. Các cảnh báo thuộc dòng giới thiệu trong AuthLayout và nút primary dùng chung; kết quả source sạch không xác nhận accessibility đã đạt.
- Các trang sau đăng nhập được đọc source để lập kế hoạch, chưa kiểm tra lại đầy đủ trên browser trong lượt này. Server và helper chỉ mở cho critique đã dừng.
- Chỉ cập nhật tài liệu/kế hoạch; chưa sửa UI, API hoặc database. Kiến trúc và chức năng hiện có được giữ nguyên.

Questions skipped: 2 Priority Issues; người dùng đã chỉ định ưu tiên Auth, phạm vi kế hoạch và thứ tự sidebar.
