# GMind — Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Sinh viên làm bài tập và dự án theo nhóm, cần biết việc phải làm, người phụ trách và hạn nộp.
- Leader điều phối công việc trong từng nhóm: quản lý thành viên, giao việc, theo dõi tiến độ, duyệt kết quả và xử lý yêu cầu hỗ trợ.
- Member thực hiện công việc được giao: cập nhật tiến độ, trao đổi, nộp kết quả và đề nghị hỗ trợ/chuyển/đổi task.
- Vai trò thuộc membership hiện hành của từng nhóm. Một người có thể là Leader ở nhóm này và Member ở nhóm khác.

## Product Purpose

GMind tập trung nhóm, dự án, công việc, deadline và trao đổi vào cùng một ứng dụng. Member cần biết hôm nay làm gì; Leader cần biết việc nào cần duyệt, có nguy cơ trễ hoặc cần phân công lại.

Mục tiêu trước mắt do chủ sản phẩm xác nhận ngày 01/11/2026 là **demo và nghiệm thu đồ án trên máy local**. Bản nghiệm thu phải thực hiện được nghiệp vụ qua giao diện, API và database thật, giữ dữ liệu sau refresh và đăng nhập lại. Chưa đặt mục tiêu vận hành trực tuyến cho đợt nghiệm thu này.

## Operating Context

- Ứng dụng web responsive cho máy tính và điện thoại; công việc quản lý nhóm ưu tiên thao tác rõ ràng trên desktop, mobile vẫn phải sử dụng được.
- Chủ sản phẩm muốn mở solution trong Visual Studio và dùng Run/F5 để chạy cả API lẫn frontend, không phải tự gõ terminal mỗi lần.
- Kiến trúc hiện có: React + TypeScript, Vite, Tailwind CSS; ASP.NET Core Web API, Entity Framework Core và SQL Server/LocalDB. Giữ kiến trúc này khi hoàn thiện sản phẩm.
- Ngôn ngữ giao diện mặc định là tiếng Việt. Lưu thời gian bằng UTC; hiển thị deadline theo Asia/Ho_Chi_Minh và so sánh hạn nhất quán.
- Luồng chính: đăng nhập → tạo/tham gia nhóm → Leader tạo dự án và giao task → Member bắt đầu, cập nhật tiến độ, nộp → Leader yêu cầu sửa hoặc duyệt → cập nhật dashboard, thông báo và lịch sử.
- Khi cần phối hợp lại: Member gửi Need Help, Transfer/Claim hoặc Swap; các bên thao tác theo quyền và Leader phê duyệt trước khi thay đổi trách nhiệm.

## Capabilities and Constraints

Các mục sau là yêu cầu của bản lõi cần hoàn thiện, không phải xác nhận rằng mọi tính năng đã triển khai hoặc nghiệm thu.

- Tài khoản: đăng ký, đăng nhập, đăng xuất, hồ sơ, đổi/quên/đặt lại mật khẩu. Khôi phục mật khẩu được nghiệm thu trước bằng hộp thư local/development; chưa coi đó là gửi email production.
- Nhóm và dự án: tạo/tham gia nhóm bằng lời mời, quản lý thành viên và vai trò, tạo/sửa/lưu trữ dự án, giữ lịch sử thay đổi. Không để nhóm mất Leader duy nhất.
- Task/subtask: mô tả, người phụ trách, deadline, ưu tiên, estimate, tiến độ và tài liệu liên quan. Mỗi task có một assignee chính; người hỗ trợ được quản lý riêng.
- Quy trình task: ToDo → InProgress → Submitted → ChangesRequested hoặc Completed. Sau yêu cầu sửa, người phụ trách làm lại và nộp lại; chỉ duyệt mới hoàn thành. Cập nhật tiến độ lên 100% không tự thay thế bước duyệt.
- Member được xem bảng task chung hạn chế; không được xem % tiến độ, workload hoặc chi tiết riêng tư của người khác. Leader/người phụ trách chỉ truy cập chi tiết theo quyền hiện hành. Lịch sử toàn nhóm dành cho Leader.
- Dashboard cá nhân, mini-calendar trên trang chủ, lịch công việc và dashboard Leader phải dùng dữ liệu thật. Thống kê task cha/con cần quy tắc nhất quán; không đếm trùng hoặc tự đồng nhất tỷ lệ hoàn thành với điểm đóng góp.
- Thông báo trong ứng dụng, nhắc hạn, preferences, cảnh báo và lịch sử là phần của bản lõi. Nhắc hạn theo BA: 3 ngày, 1 ngày, 3 giờ trước hạn và khi quá hạn; chống trùng và xử lý lại khi deadline đổi hoặc task hoàn thành.
- Cảnh báo nguy cơ theo quyết định dùng mặc định BA: còn ≤8 giờ và tiến độ <70%, hoặc task đang làm không cập nhật trong 24 giờ. Khả năng Leader chỉnh ngưỡng thuộc cài đặt nhóm cần hoàn thiện.
- Need Help giữ assignee chính và ghi người/phần việc hỗ trợ. Transfer/Claim cần luồng nhận việc và duyệt. Swap xác định đủ hai task và hai người. Duyệt phải kiểm tra lại membership, assignee, trạng thái hiện tại, cập nhật nhất quán và lưu lịch sử.
- Quyền đọc/ghi phải được kiểm tra ở backend theo membership hiện tại. Ẩn nút không thay thế authorization; mất quyền hoặc đổi trang không được giữ lại dữ liệu riêng tư cũ.
- Ưu tiên phần lõi trước. Chat dự án realtime, upload/download file nhị phân, tính điểm đóng góp và các tích hợp mở rộng thuộc giai đoạn sau; task comments và URL tài liệu là khả năng phối hợp ban đầu.

## Open Decisions and Acceptance Boundaries

- Công thức điểm đóng góp, cách chia điểm Help/Transfer và xử lý lịch sử điểm chưa được chủ sản phẩm chốt. Không dùng số task hoàn thành làm công thức đóng góp chính thức.
- Công thức thống kê tiến độ và quy tắc tính task cha/con cần được ghi rõ, kiểm chứng trước khi nghiệm thu dashboard; đề xuất trong BA không tự trở thành quyết định đã duyệt.
- Dịch vụ email production, storage cho file nhị phân, OAuth và môi trường triển khai trực tuyến chưa được lựa chọn cho bản nghiệm thu local.
- Các giả định cũ trong `docs/decisions/OPEN_QUESTIONS.md` về điểm đóng góp và cảnh báo sau 3 ngày không thay thế các quyết định nêu trên. Chênh lệch giữa yêu cầu và implementation cần được xử lý ở milestone tương ứng.
- Bản UI A2 là mốc xem trước Dashboard, Project và Task Detail; hồ sơ sản phẩm này không thay cho việc chủ sản phẩm duyệt giao diện hoặc nghiệm thu chức năng.

## Brand Commitments

- Tên sản phẩm: **GMind**.
- Hướng đã được chủ sản phẩm chọn: giao diện sáng, xanh nhẹ, clean nhưng đủ đẹp; ưu tiên dễ dùng, rõ thứ bậc và nhất quán.
- Nội dung thao tác và trạng thái hướng tới sinh viên, bằng tiếng Việt dễ hiểu. Giữ thuật ngữ Leader/Member và ý nghĩa nghiệp vụ Need Help, Transfer/Claim, Swap.

## Evidence on Hand

- `docs/requirements/GMind_Business_Analysis_Specification_v1.0.docx`: nguồn BA/SRS chính; chứa yêu cầu, ma trận quyền, giả định và tiêu chí nghiệm thu.
- `docs/requirements/GMind_AI_Implementation_Prompt.txt`: quy tắc triển khai theo milestone, API/database thật, phân quyền và kiểm chứng.
- `docs/design/sitemap.md`, `docs/design/user-flows.md`, `docs/design/design-tokens.md`: tài liệu thiết kế hiện có; đọc cùng code và các quyết định được xác nhận sau đó.
- `GMind-Frontend/src/App.tsx`, các pages/services và `GMind-Backend/`: bằng chứng implementation hiện hành, không phải bằng chứng mọi luồng đã hoàn chỉnh.
- `README.md`, `GMind.slnx`, `GMind.slnLaunch`: hướng dẫn và cấu hình chạy local. Cấu hình đã có không đồng nghĩa thao tác GUI F5 đã được xác nhận.
- Không có bằng chứng được cung cấp để công bố số người dùng, kết quả học tập, hiệu quả vận hành hoặc thành tích sản phẩm.

## Product Principles

1. Hoàn thành nghiệp vụ qua UI → API → database thật; không dùng số liệu hoặc phản hồi giả để làm màn hình có vẻ hoàn chỉnh.
2. Bảo vệ dữ liệu cá nhân và trách nhiệm theo vai trò hiện hành của từng nhóm.
3. Giao việc, nộp, duyệt và điều phối đều có người thực hiện, trạng thái và lịch sử rõ ràng.
4. Hoàn thiện luồng lõi trước các tính năng mở rộng; giữ yêu cầu chưa chốt ở trạng thái mở.
5. Nghiệm thu bằng hành vi chạy được và bằng chứng đã kiểm tra; phân biệt yêu cầu, implementation và kết quả xác minh.

## Accessibility & Inclusion

- Form có nhãn rõ, dùng được bằng bàn phím, có focus nhìn thấy và độ tương phản phù hợp.
- Trạng thái có nhãn chữ; không chỉ dùng màu để truyền đạt lỗi, quá hạn hoặc tiến độ.
- Desktop/mobile đều có bố cục đọc và thao tác được, không tràn ngang ngoài kiểm soát.
- Có loading, empty, error/retry, validation và phản hồi thành công. Giữ dữ liệu form hợp lý khi lỗi; thông báo không lộ chi tiết nội bộ hoặc secrets.

## Lecturer Feedback — UI Delivery Requirements

Yêu cầu bổ sung được chủ sản phẩm cung cấp ngày 01/11/2026, ưu tiên hơn trang trí giao diện:

- Login và Register phải là hai trang với layout riêng. Hai layout vẫn dùng chung thương hiệu GMind và các thành phần nền tảng để giữ nhất quán.
- Register có Confirm Password và kiểm tra Password/Confirm Password khớp nhau. Giữ validation frontend/backend hiện có, làm rõ phản hồi lỗi tại trường nhập.
- Có điều hướng rõ Login ↔ Register. Forgot Password là một luồng riêng, gồm yêu cầu đặt lại và đặt lại mật khẩu; nghiệm thu theo hộp thư local đã thống nhất.
- Hoàn thiện nhóm Auth trước, sau đó lần lượt theo sidebar hiện hành: Tổng quan → Việc của tôi → Nhóm của tôi → Lịch công việc → Thông báo. Hoàn thành từng menu và các trang liên quan trước khi sang mục tiếp theo; tái sử dụng các trang chung.
- Giữ nhất quán layout, khoảng cách, typography, components và thứ bậc điều hướng. Không phát triển đồng thời các trang không liên quan.
- Phạm vi hiện tại là critique và kế hoạch cải thiện có trọng tâm; giữ chức năng, kiến trúc và hướng nhận diện đã chốt. Chưa yêu cầu redesign toàn ứng dụng.
- Kế hoạch chi tiết: `docs/design/ui-improvement-plan.md`. Hồ sơ/đổi mật khẩu vẫn thuộc A2, không bị loại khỏi yêu cầu khi sắp xếp lại thứ tự UI.
