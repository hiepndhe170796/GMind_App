GMind

BUSINESS ANALYSIS & SOFTWARE REQUIREMENTS SPECIFICATION

Đặc tả nghiệp vụ cho ứng dụng quản lý bài tập và dự án nhóm sinh viên

| Thông tin tài liệu | Giá trị |
| --- | --- |
| Phiên bản | 1.0 - Draft for design & implementation |
| Ngày lập | 24/10/2026 |
| Ngôn ngữ | Tiếng Việt; tên trạng thái/mã kỹ thuật có thể dùng tiếng Anh nhất quán |
| Nguồn nghiệp vụ | “Tổng quan các tính năng.docx” và “Các tính năng có thể làm được.docx” do người dùng cung cấp |
| Đối tượng sử dụng | AI thiết kế UI/UX, AI lập trình, Product Owner, developer, tester |
| Trạng thái | Bản đặc tả đề xuất; các giả định cần xác nhận được đánh dấu rõ trong tài liệu |

Mục tiêu: biến danh sách ý tưởng thành yêu cầu đủ rõ để thiết kế, code, kiểm thử và bàn giao.

# Hướng dẫn đọc và sử dụng tài liệu

Đây là bản BA/SRS (Business Analysis / Software Requirements Specification) dành cho ứng dụng GMind. AI thiết kế và AI lập trình cần dùng tài liệu này làm nguồn yêu cầu chính, không tự suy diễn thêm tính năng lớn hoặc tự bỏ yêu cầu mà không ghi nhận.

- Yêu cầu bắt nguồn từ tài liệu: các chức năng và quy tắc được nêu trong hai file người dùng cung cấp.

- Đề xuất BA: các cách làm cụ thể hóa để đội phát triển có thể triển khai, chẳng hạn công thức tính tiến độ, mô hình dữ liệu, trạng thái và tiêu chí nghiệm thu. Các mục này không có nghĩa là người dùng đã chốt; cần giữ tính cấu hình hoặc ghi là giả định.

- MVP: phiên bản tối thiểu có thể sử dụng end-to-end. Các phần được ghi “chưa thử” trong nguồn không tự động bị loại bỏ, mà được xếp giai đoạn để giảm rủi ro.

- Nếu repository/codebase đã tồn tại: AI lập trình phải kiểm tra công nghệ và cấu trúc hiện có trước, giữ lại những phần ổn định, không viết lại tùy tiện.

| Nguyên tắc quan trọng  Không được chỉ tạo giao diện tĩnh. Các chức năng phải có dữ liệu thật, xác thực quyền ở backend, trạng thái loading/empty/error, kiểm thử và hướng dẫn chạy ứng dụng. |
| --- |

# Mục lục nội dung

1. Tổng quan sản phẩm

2. Mục tiêu và chỉ số thành công

3. Phạm vi và kế hoạch phát hành

4. Người dùng, vai trò và phân quyền

5. Luồng nghiệp vụ tổng quát

6. Yêu cầu chức năng chi tiết

7. Quy tắc nghiệp vụ

8. Mô hình dữ liệu đề xuất

9. Danh sách màn hình và yêu cầu UI/UX

10. Yêu cầu phi chức năng

11. Định hướng kiến trúc và quy chuẩn code

12. API và tích hợp đề xuất

13. Tiêu chí nghiệm thu end-to-end

14. Giả định, quyết định còn mở và rủi ro

15. Prompt bàn giao cho AI lập trình

Phụ lục A. Thuật ngữ

# 1. Tổng quan sản phẩm

## 1.1 Tóm tắt

GMind là ứng dụng web hỗ trợ sinh viên tổ chức bài tập và dự án nhóm: tạo nhóm, lập dự án, chia task, giao người phụ trách, theo dõi deadline, phối hợp trao đổi, kiểm tra kết quả và quan sát tiến độ. Khác với danh sách việc đơn giản, GMind cần làm rõ trách nhiệm của Leader và Member, đồng thời tạo quy trình hỗ trợ khi một người có nguy cơ không hoàn thành task.

## 1.2 Vấn đề cần giải quyết

- Thông tin bài tập, deadline và tài liệu dễ bị phân tán ở nhiều nơi.

- Leader khó biết ai đang làm gì, task nào bị trễ và ai cần hỗ trợ.

- Member cần một dashboard cá nhân để ưu tiên việc hôm nay và việc sắp đến hạn.

- Khi member quá tải, nhóm cần quy trình Need Help, Transfer hoặc Swap có kiểm soát thay vì tự ý đẩy việc cho nhau.

- Nhóm cần lưu lịch sử thay đổi để truy lại ai đã giao task, đổi deadline, submit hoặc duyệt kết quả.

## 1.3 Tầm nhìn và nguyên tắc sản phẩm

- Một nguồn dữ liệu thống nhất cho nhóm, dự án, task, deadline và thảo luận.

- Leader nhìn thấy tiến độ toàn nhóm; Member được bảo vệ quyền riêng tư về tiến độ cá nhân của người khác.

- Mọi hành động quan trọng có người thực hiện và thời điểm thực hiện.

- Ưu tiên luồng sử dụng dễ hiểu với sinh viên; không làm giao diện phức tạp chỉ để trình diễn công nghệ.

- Tính toán tiến độ phải có công thức rõ ràng, không hiển thị phần trăm “ảo” không giải thích được.

## 1.4 Phạm vi nền tảng

Phạm vi mặc định của bản này là ứng dụng web responsive, dùng được trên máy tính và điện thoại. Tài liệu nguồn mô tả website và lịch nhỏ trên trang chủ; chưa có yêu cầu bắt buộc tạo app iOS/Android native. Email, push notification, đăng nhập Google và lưu file cloud được xem là tích hợp có thể triển khai theo giai đoạn.

# 2. Mục tiêu và chỉ số thành công

| Mục tiêu | Cách xác minh đề xuất |
| --- | --- |
| Giao việc rõ ràng | Mỗi task có tên, dự án, người phụ trách, deadline, trạng thái và độ ưu tiên. |
| Member biết việc cần làm | Dashboard hiển thị task của tôi, task hôm nay/sắp đến hạn/quá hạn và số liệu trạng thái. |
| Leader nắm tiến độ | Leader xem tiến độ dự án, task theo trạng thái, task trễ và tiến độ từng member trong nhóm. |
| Giảm bỏ lỡ deadline | Task có nhắc trước hạn theo mốc cấu hình và thông báo quá hạn. |
| Tăng minh bạch khi phối hợp | Có comment/review và activity log cho hành động quan trọng. |
| Chuyển giao công việc có kiểm soát | Yêu cầu Need Help/Transfer/Swap đi qua luồng phê duyệt của Leader. |

Chỉ số đo lường sau khi vận hành (đề xuất): tỷ lệ task có assignee và deadline; số task quá hạn; thời gian từ khi giao task đến khi bắt đầu; số task bị yêu cầu sửa; số yêu cầu hỗ trợ được giải quyết. Chưa có mục tiêu số cụ thể trong tài liệu gốc, vì vậy không tự đặt KPI cứng.

# 3. Phạm vi và kế hoạch phát hành

Tài liệu nguồn liệt kê 15 nhóm tính năng. Tài liệu thứ hai ghi rõ một số chức năng “Có thể”, một số “Hên xui (chưa thử)”, và tính point Marketplace chưa biết công thức. Bảng dưới đây tách mức độ cần thiết của sản phẩm khỏi trạng thái đã thử kỹ thuật.

## 3.1 MVP - phiên bản đầu tiên nên triển khai

| Mã / nhóm | Phạm vi MVP | Lý do |
| --- | --- | --- |
| MVP-01 Tài khoản | Đăng ký, đăng nhập, đăng xuất, đổi/quên mật khẩu, hồ sơ cơ bản. | Nền tảng xác thực người dùng. |
| MVP-02 Nhóm | Tạo nhóm, tham gia bằng mã/link, xem thành viên, phân vai Leader/Member, mời/xóa theo quyền. | Nền tảng phối hợp. |
| MVP-03 Dự án & task | Tạo dự án, task/subtask, giao việc, deadline, ưu tiên, mô tả, estimate, trạng thái và % tiến độ. | Chức năng lõi. |
| MVP-04 Dashboard | Dashboard cá nhân và dashboard Leader; bộ lọc trạng thái và deadline. | Có trong danh sách khả thi. |
| MVP-05 Review | Comment trong task; Submit → Review → Approve hoặc yêu cầu sửa. | Giúp đánh giá kết quả, không chỉ đánh dấu Done. |
| MVP-06 Thông báo | Notification trong web; nhắc task sắp hạn và báo task quá hạn theo mốc cấu hình. | Nguồn ghi nhắc deadline là yêu cầu bắt buộc. |
| MVP-07 History log | Lưu và lọc các thay đổi ảnh hưởng đến task/nhóm/dự án. | Có trong danh sách khả thi và cần cho truy vết. |
| MVP-08 Marketplace cơ bản | Need Help, Transfer, Swap; Leader duyệt/từ chối; chưa bắt buộc bật tính điểm tự động ở MVP. | Workflow khả thi; công thức point chưa chốt. |
| MVP-09 Tài liệu liên quan | Cho phép lưu URL/link tài liệu và thông tin mô tả. Upload file trực tiếp có thể để giai đoạn kế tiếp. | Nguồn nêu gửi link là phương án khả thi trước. |

## 3.2 Giai đoạn kế tiếp / mở rộng

| Tính năng | Đề xuất giai đoạn | Lưu ý |
| --- | --- | --- |
| Calendar / Timeline / Kanban nâng cao | V1.1 | Có thể bắt đầu bằng Kanban đơn giản; Calendar đầy đủ sau khi deadline và dữ liệu task ổn định. |
| Chat nhóm thời gian thực, @mention, reply, gửi file | V1.1 hoặc V2 | Tốn công đồng bộ realtime, quyền truy cập, lưu tin nhắn và upload. |
| Upload/download file trực tiếp | V1.1 | Phải có giới hạn dung lượng/loại file, kiểm tra quyền, lưu trữ an toàn và xóa file. |
| Cảnh báo nguy cơ trễ nâng cao | V1.1 | Quy tắc dựa trên % tiến độ, thời gian còn lại và lần cập nhật gần nhất. |
| Email/push notification | V1.1 | MVP nên hoàn thành notification trong web trước; email/push là kênh bổ sung. |
| Google sign-in | Tùy chọn | Không chặn đăng ký/đăng nhập email-mật khẩu nếu chưa cấu hình OAuth. |
| Point đóng góp và báo cáo đóng góp | V1.1 sau khi chốt công thức | Không được ngầm lấy số lượng task đơn thuần làm phần trăm đóng góp. |

| Lưu ý về ưu tiên  Nhắc deadline được đánh dấu “chưa thử” ở tài liệu khả thi nhưng lại được ghi là “bắt buộc” trong tài liệu tổng quan. Vì vậy, BA xếp nhắc deadline cơ bản vào MVP; AI cần triển khai ít nhất bằng cơ chế notification trong web và job nền đáng tin cậy. |
| --- |

# 4. Người dùng, vai trò và phân quyền

## 4.1 Các vai trò

| Vai trò | Ý nghĩa | Phạm vi |
| --- | --- | --- |
| Khách chưa đăng nhập | Chưa có phiên đăng nhập. | Chỉ vào trang giới thiệu, đăng ký, đăng nhập và khôi phục mật khẩu; không đọc dữ liệu riêng tư. |
| Leader | Người điều phối một nhóm cụ thể. | Quản lý thành viên, dự án, task, phân công, xem tiến độ toàn nhóm, duyệt Marketplace và xem activity log của nhóm. |
| Member | Thành viên của một nhóm cụ thể. | Xem task được giao và thông tin chung được phép xem; cập nhật tiến độ, comment, submit task, yêu cầu hỗ trợ/chuyển/đổi task. |
| System administrator | Không được xác định trong hai tài liệu nguồn. | Không đưa vào phạm vi nghiệp vụ MVP trừ khi chủ sản phẩm quyết định cần bảng quản trị hệ thống. |

Một người dùng có thể thuộc nhiều nhóm và giữ vai trò khác nhau ở từng nhóm. “Leader” là quyền theo membership của nhóm, không phải quyền toàn hệ thống.

## 4.2 Ma trận quyền đề xuất

| Hành động | Leader | Member |
| --- | --- | --- |
| Tạo nhóm / tham gia nhóm | Có | Có |
| Sửa thông tin nhóm / quản lý thành viên | Có | Không; trừ chức năng tự rời nhóm |
| Tạo/sửa dự án trong nhóm | Có | Xem; quyền tạo dự án cần chốt, mặc định Không |
| Tạo task / đổi người phụ trách | Có | Không; có thể gửi yêu cầu thay đổi |
| Xem task được giao cho mình | Có | Có |
| Xem task chung được phép của dự án | Có | Có, theo cấu hình hiển thị |
| Xem % tiến độ cá nhân của thành viên khác | Có | Không |
| Xem dashboard tổng thể nhóm | Có | Chỉ xem thông tin tổng quan không tiết lộ chi tiết tiến độ từng người |
| Comment và cập nhật tiến độ task mình phụ trách | Có | Có |
| Submit task để review | Có | Có nếu là người phụ trách |
| Approve / yêu cầu sửa task | Có | Không; mặc định Leader review |
| Duyệt Need Help / Transfer / Swap | Có | Không |
| Xem activity log của dự án/nhóm | Có | Không; Member chỉ xem lịch sử cần thiết trên task mình tham gia |
| Xóa file/link thuộc dự án | Có | Người tạo hoặc Leader; chính sách cuối cùng cần chốt |

| Quy tắc bảo mật  Ẩn nút ở giao diện không đủ để bảo vệ dữ liệu. Mọi API truy cập dự án/task/member phải kiểm tra người dùng có membership hợp lệ và đúng quyền tại backend. |
| --- |

# 5. Luồng nghiệp vụ tổng quát

## 5.1 Tạo nhóm và khởi tạo dự án

1. Người dùng đăng ký/đăng nhập.

2. Người dùng tạo nhóm; hệ thống ghi nhận người tạo là Leader đầu tiên.

3. Leader mời thành viên qua mã/link hoặc thành viên nhập mã để tham gia.

4. Leader tạo dự án/bài tập, nhập tên, mô tả, môn học, deadline và tài liệu liên quan.

5. Leader tạo task/subtask, gán người phụ trách, đặt ưu tiên, deadline và ước lượng thời gian.

6. Hệ thống gửi notification cho người được giao task và hiển thị task trong dashboard cá nhân.

## 5.2 Vòng đời một task

| Bước | Trạng thái / hành động | Kết quả |
| --- | --- | --- |
| 1 | To do / Chưa bắt đầu | Task được tạo và có thể chưa có cập nhật tiến độ. |
| 2 | In progress / Đang làm | Người phụ trách bắt đầu làm và cập nhật % tiến độ. |
| 3 | Submit for review / Chờ review | Người phụ trách gửi kết quả; thời điểm submit được lưu. |
| 4A | Changes requested / Cần chỉnh sửa | Leader/Reviewer ghi nhận phản hồi; task quay lại In progress. |
| 4B | Approved / Đã duyệt | Kết quả được chấp thuận; hệ thống chuyển Complete và tiến độ task thành 100%. |
| Ngoại lệ | Overdue / Quá hạn | Nhãn suy ra khi đã qua deadline mà task chưa hoàn thành; không nên xóa trạng thái thực của task. |

Khuyến nghị mô hình: lưu trạng thái công việc (To do/In progress/Submitted/Changes requested/Completed) riêng với cờ “quá hạn” được tính từ deadline. Như vậy task vẫn có thể “In progress” đồng thời hiển thị cảnh báo “Overdue”.

## 5.3 Luồng Marketplace

1. Member gửi Need Help, Transfer hoặc Swap; bắt buộc nhập lý do và chọn task liên quan.

2. Với Transfer/Swap, Member có thể đề xuất người nhận/đổi task nếu biết; hệ thống hiển thị workload và deadline liên quan cho Leader.

3. Leader xem yêu cầu, lý do, task, deadline, người nhận và workload; sau đó Accept hoặc Reject, có thể để lại ghi chú.

4. Khi Accept, hệ thống cập nhật người phụ trách hoặc người hỗ trợ theo loại yêu cầu, ghi activity log và gửi thông báo cho người liên quan.

5. Khi Reject, task không thay đổi; requester nhận lý do từ chối.

# 6. Yêu cầu chức năng chi tiết

Mỗi yêu cầu có mã định danh để truy vết từ BA sang ticket, API và test case. Mức ưu tiên: Must = cần có cho MVP; Should = nên có trong MVP nếu không làm chậm luồng lõi; Later = giai đoạn mở rộng.

## 6.1 Quản lý tài khoản (AUTH)

| Mã | Yêu cầu / hành vi | Ưu tiên | Tiêu chí nghiệm thu chính |
| --- | --- | --- | --- |
| AUTH-01 | Đăng ký bằng tên hiển thị, email và mật khẩu. Email phải đúng định dạng và duy nhất. | Must | Từ chối email đã dùng; báo lỗi rõ; sau đăng ký người dùng có thể đăng nhập. |
| AUTH-02 | Đăng nhập và đăng xuất an toàn. | Must | Sai thông tin không tiết lộ tài khoản nào tồn tại; sau logout phiên không truy cập được API riêng tư. |
| AUTH-03 | Quên/đặt lại mật khẩu qua luồng xác minh. | Must | Token reset có hạn dùng, dùng một lần; không gửi mật khẩu hiện tại qua email. |
| AUTH-04 | Đổi mật khẩu khi đã đăng nhập. | Must | Yêu cầu xác nhận mật khẩu hiện tại hoặc xác minh tương đương. |
| AUTH-05 | Chỉnh sửa hồ sơ: tên, avatar, email theo chính sách xác minh. | Must | Dữ liệu lưu lại và cập nhật ở các màn hình liên quan; avatar có giới hạn loại/kích thước. |
| AUTH-06 | Đăng nhập Google. | Later | Chỉ bật khi cấu hình OAuth; không làm hỏng đăng nhập thường nếu chưa có credentials. |

## 6.2 Quản lý nhóm và membership (GROUP)

| Mã | Yêu cầu / hành vi | Ưu tiên | Tiêu chí nghiệm thu chính |
| --- | --- | --- | --- |
| GROUP-01 | Tạo nhóm với tên và thông tin mô tả cơ bản. Người tạo thành Leader. | Must | Nhóm có mã định danh; người tạo có membership Leader. |
| GROUP-02 | Tham gia qua mã/link mời. | Must | Mã/link hợp lệ mới cho phép tham gia; không thể tham gia hai lần cùng một nhóm. |
| GROUP-03 | Tạo mới, thu hồi hoặc vô hiệu hóa mã/link mời. | Should | Mã/link bị thu hồi không thể dùng; không lộ danh sách nhóm ngoài quyền. |
| GROUP-04 | Xem danh sách thành viên và vai trò. | Must | Hiển thị tên/avatar/vai trò; dữ liệu giới hạn trong nhóm hiện tại. |
| GROUP-05 | Leader xóa thành viên hoặc thay đổi quyền theo chính sách. | Must | Hành động được ghi log; không cho thao tác phá vỡ nhóm hoặc xóa Leader duy nhất mà chưa chuyển quyền. |
| GROUP-06 | Member tự rời nhóm. | Should | Cảnh báo nếu còn task đang phụ trách; yêu cầu Leader phân công lại hoặc xác nhận phương án. |

## 6.3 Quản lý dự án/bài tập (PROJECT)

| Mã | Yêu cầu / hành vi | Ưu tiên | Tiêu chí nghiệm thu chính |
| --- | --- | --- | --- |
| PROJECT-01 | Leader tạo dự án với tên, mô tả, môn học, deadline và tài liệu/link. | Must | Tên bắt buộc; deadline được kiểm tra hợp lệ; dự án thuộc đúng nhóm. |
| PROJECT-02 | Xem, sửa và lưu trữ dự án. | Must | Chỉ người có quyền được chỉnh sửa; thao tác lưu trữ có xác nhận. |
| PROJECT-03 | Hiển thị trạng thái dự án. | Must | Mặc định đề xuất suy ra từ task: chưa bắt đầu, đang thực hiện, hoàn thành; quá hạn nếu deadline qua và chưa hoàn thành. |
| PROJECT-04 | Một nhóm có nhiều dự án. | Must | Task của dự án này không được hiển thị nhầm trong dự án khác. |
| PROJECT-05 | Thêm các URL tài liệu liên quan. | Must | URL được validate; chỉ thành viên có quyền dự án mới xem link nội bộ. |

## 6.4 Quản lý task và phân công (TASK)

| Mã | Yêu cầu / hành vi | Ưu tiên | Tiêu chí nghiệm thu chính |
| --- | --- | --- | --- |
| TASK-01 | Leader tạo/sửa task và subtask trong dự án. | Must | Task có tên, dự án, trạng thái; subtask tham chiếu parentTaskId; không cho quan hệ cha-con vòng lặp. |
| TASK-02 | Lưu mô tả, assignee, deadline, ưu tiên, estimate, link/tệp đính kèm. | Must | Các trường tùy chọn được để trống; người phụ trách phải là thành viên đang hoạt động của nhóm. |
| TASK-03 | Gán/đổi người phụ trách. | Must | Người được gán nhận thông báo; đổi assignee ghi activity log và giữ lịch sử. |
| TASK-04 | Assignee cập nhật trạng thái và % tiến độ. | Must | % nằm trong 0-100; Completed/Approved đặt về 100%; không cho member sửa task không thuộc quyền. |
| TASK-05 | Sắp xếp và lọc theo assignee, trạng thái, deadline, ưu tiên. | Must | Bộ lọc có thể kết hợp; trạng thái overdue phản ánh đúng deadline hiện tại. |
| TASK-06 | Cho phép một task có một assignee chính ở MVP. Người hỗ trợ được ghi riêng qua Help Request. | Assumption | Không tự gán đồng thời nhiều assignee nếu chưa có quy tắc phân chia trách nhiệm rõ. |
| TASK-07 | Ước lượng thời gian và điểm độ phức tạp của task. | Should | Estimate tính bằng giờ; points là số nguyên dương do Leader đặt nếu bật contribution. |

## 6.5 Dashboard cá nhân (DASH)

| Mã | Yêu cầu / hành vi | Ưu tiên | Tiêu chí nghiệm thu chính |
| --- | --- | --- | --- |
| DASH-01 | Hiển thị task của tôi theo Hôm nay, Ngày mai, Sắp đến hạn, Quá hạn và Tất cả. | Must | Mỗi task có tên dự án, deadline, trạng thái, ưu tiên và liên kết mở chi tiết. |
| DASH-02 | Hiển thị tổng số task, hoàn thành, đang làm, quá hạn và sắp đến hạn. | Must | Các số liệu lấy từ dữ liệu thật và tôn trọng bộ lọc/nhóm hiện tại. |
| DASH-03 | Có khu vực lịch/deadline nhỏ trên trang chủ. | Should | MVP tối thiểu có thể là danh sách deadline gần nhất nếu Calendar đầy đủ chưa làm. |
| DASH-04 | Màn hình dashboard phản hồi được khi người dùng chưa có nhóm/dự án/task. | Must | Hiển thị empty state và CTA phù hợp thay vì trang trống hoặc lỗi. |

## 6.6 Tiến độ nhóm và Leader dashboard (PROGRESS)

| Mã | Yêu cầu / hành vi | Ưu tiên | Tiêu chí nghiệm thu chính |
| --- | --- | --- | --- |
| PROG-01 | Leader xem tổng quan dự án: completed, doing, todo, overdue và tiến độ. | Must | Số đếm nhất quán với danh sách task; quy tắc loại trừ/hợp nhất subtask được áp dụng nhất quán. |
| PROG-02 | Leader xem bảng tiến độ từng member và mở chi tiết member. | Must | Member thường không truy cập được dữ liệu % chi tiết của người khác. |
| PROG-03 | Leader thấy task quá hạn, deadline gần nhất và task không cập nhật lâu. | Must | Mỗi cảnh báo dẫn đến task/màn hình chi tiết; không chỉ hiển thị số liệu trang trí. |
| PROG-04 | Leader có thể nhắc member, thay deadline, yêu cầu hỗ trợ hoặc phân bổ lại task. | Should | Hành động có kiểm tra quyền, xác nhận khi thay đổi ảnh hưởng người khác và ghi log. |

## 6.7 Comment, submit và review (REVIEW)

| Mã | Yêu cầu / hành vi | Ưu tiên | Tiêu chí nghiệm thu chính |
| --- | --- | --- | --- |
| REV-01 | Member có thể comment trong task được phép truy cập. | Must | Comment có tác giả và thời điểm; người dùng không thể giả danh người khác. |
| REV-02 | Assignee submit task để Leader review. | Must | Lưu submittedAt, người submit và nội dung/ghi chú bàn giao tùy chọn. |
| REV-03 | Leader approve hoặc yêu cầu chỉnh sửa với nhận xét. | Must | Approve hoàn tất task; yêu cầu sửa đưa task về In progress và thông báo assignee. |
| REV-04 | Hiển thị lịch sử comment và các lần submit/review. | Must | Không ghi đè lịch sử cũ khi submit lại; người có quyền xem được lịch sử liên quan. |

## 6.8 Notification và nhắc deadline (NOTIFY)

| Mã | Yêu cầu / hành vi | Ưu tiên | Tiêu chí nghiệm thu chính |
| --- | --- | --- | --- |
| NOT-01 | Tạo notification trong web cho sự kiện quan trọng. | Must | Có loại, tiêu đề, nội dung, người nhận, thời điểm tạo, readAt và liên kết tới tài nguyên liên quan. |
| NOT-02 | Thông báo khi được giao task, đổi deadline/assignee, submit, approve, yêu cầu hỗ trợ hoặc marketplace được duyệt. | Must | Chỉ gửi cho những người liên quan; không lộ nội dung nhóm riêng cho người ngoài. |
| NOT-03 | Nhắc deadline tại các mốc mặc định: 3 ngày, 1 ngày, 3 giờ trước và khi quá hạn. | Must | Không nhắc trùng cùng mốc cho cùng người/task; task đã hoàn thành không nhận nhắc trước hạn. |
| NOT-04 | Người dùng tùy chỉnh bật/tắt và chọn mốc nhắc. | Should | Lưu cấu hình; mặc định bật các mốc nêu trong tài liệu nguồn. |
| NOT-05 | Có trạng thái đã đọc/chưa đọc và đánh dấu đã đọc. | Must | Số notification chưa đọc cập nhật sau thao tác. |
| NOT-06 | Email/push là kênh bổ sung. | Later | Lỗi gửi ngoài không được làm hỏng giao dịch tạo task; có retry/log khi tích hợp. |

## 6.9 Calendar, Timeline và Kanban (VIEW)

| Mã | Yêu cầu / hành vi | Ưu tiên | Tiêu chí nghiệm thu chính |
| --- | --- | --- | --- |
| VIEW-01 | Calendar hiển thị deadline của task theo ngày/tháng. | Later | Click event mở task; hiển thị rõ task nhiều ngày hoặc nhiều deadline trùng. |
| VIEW-02 | Kanban hiển thị task theo To do, In progress, Review, Completed. | Should | Kéo-thả chỉ hoạt động nếu người dùng có quyền thay đổi trạng thái; cập nhật qua backend. |
| VIEW-03 | Timeline cho phép nhìn trình tự deadline trên dự án. | Later | Nếu chưa có phụ thuộc task thì không giả lập quan hệ phụ thuộc. |

## 6.10 Chat và trao đổi (CHAT)

| Mã | Yêu cầu / hành vi | Ưu tiên | Tiêu chí nghiệm thu chính |
| --- | --- | --- | --- |
| CHAT-01 | Khu vực trao đổi theo project. | Later | Chỉ member hiện tại của nhóm được đọc/gửi; lưu người gửi và thời điểm. |
| CHAT-02 | Hỗ trợ @mention, reply và gửi file. | Later | Mention báo đúng người; reply trỏ đến message gốc; file đi qua kiểm tra quyền/loại/dung lượng. |
| CHAT-03 | Nếu chưa có realtime, cho phép comment/task discussion hoạt động thay thế trong MVP. | Must | Người dùng vẫn có đường trao đổi gắn với task. |

## 6.11 Activity / History Log (AUDIT)

| Mã | Yêu cầu / hành vi | Ưu tiên | Tiêu chí nghiệm thu chính |
| --- | --- | --- | --- |
| LOG-01 | Ghi lịch sử tạo task, giao task, đổi assignee, trạng thái, deadline, submit/review/approve. | Must | Log có actor, action, entity, entityId, timestamp và dữ liệu thay đổi đủ để giải thích. |
| LOG-02 | Ghi thành viên tham gia/rời nhóm và thay đổi quyền. | Must | Chỉ Leader xem log nhóm đầy đủ. |
| LOG-03 | Leader lọc theo member, thời gian, dự án và loại hoạt động. | Should | Kết quả có phân trang hoặc giới hạn hợp lý; sắp xếp mới nhất trước. |
| LOG-04 | Log không được chỉnh sửa bởi Member thông thường. | Must | Log được tạo phía server, không tin dữ liệu actor do client gửi. |

## 6.12 File và tài liệu (FILE)

| Mã | Yêu cầu / hành vi | Ưu tiên | Tiêu chí nghiệm thu chính |
| --- | --- | --- | --- |
| FILE-01 | MVP hỗ trợ URL/tài liệu tham chiếu gắn với project/task. | Must | Kiểm tra URL, hiển thị tên/link, người tạo và thời điểm. |
| FILE-02 | Upload/download file trực tiếp vào project hoặc task. | Later | Whitelist loại file, giới hạn kích thước, kiểm tra MIME/đuôi file, phân quyền tải/xóa. |
| FILE-03 | Xóa tài liệu/file theo quyền và có xác nhận. | Should | Xóa tham chiếu hoặc file theo chính sách nhất quán; ghi log. |

## 6.13 Task Marketplace (MARKET)

| Mã | Yêu cầu / hành vi | Ưu tiên | Tiêu chí nghiệm thu chính |
| --- | --- | --- | --- |
| MARKET-01 | Need Help: Member vẫn giữ task và yêu cầu thành viên khác hỗ trợ một phần. | Must | Có mô tả phần cần hỗ trợ, lý do, người yêu cầu, task và trạng thái request. |
| MARKET-02 | Transfer: Member đề nghị chuyển task cho thành viên khác hoặc Marketplace. | Must | Task chưa tự đổi assignee trước khi Leader duyệt. |
| MARKET-03 | Swap: Member đề nghị đổi task với một Member khác. | Must | Cả hai task và hai thành viên phải được xác định; thay đổi chỉ xảy ra khi duyệt. |
| MARKET-04 | Leader Accept/Reject và xem deadline, lý do, workload. | Must | Khi Accept hệ thống cập nhật nguyên tử và thông báo tất cả bên liên quan; khi Reject lưu lý do. |
| MARKET-05 | Tính điểm đóng góp của project. | Later / cần xác nhận | Không đưa vào mặc định cho đến khi công thức được chủ sản phẩm chốt; xem đề xuất ở mục 7.6. |

## 6.14 Cảnh báo task có nguy cơ trễ (RISK)

| Mã | Yêu cầu / hành vi | Ưu tiên | Tiêu chí nghiệm thu chính |
| --- | --- | --- | --- |
| RISK-01 | Cảnh báo mức bình thường, có nguy cơ chậm và đã chậm. | Must cho quá hạn; Later cho phân tích rủi ro nâng cao | Overdue xác định bằng deadline và trạng thái chưa hoàn thành. |
| RISK-02 | Cảnh báo nguy cơ nếu còn ít thời gian nhưng tiến độ thấp. | Later | Ngưỡng đề xuất cấu hình: còn <= 8 giờ và progress < 70%. |
| RISK-03 | Cảnh báo task In progress không được cập nhật trong thời gian cấu hình. | Later | Ngưỡng mặc định đề xuất 24 giờ; tránh gửi cảnh báo lặp liên tục. |
| RISK-04 | Member nhận cảnh báo task của mình; Leader nhận cảnh báo thành viên/task thuộc nhóm. | Must cho overdue | Nội dung kèm task, người phụ trách, deadline và thời gian quá hạn. |

## 6.15 Cài đặt hệ thống / quản trị tối thiểu (SETTINGS)

| Mã | Yêu cầu / hành vi | Ưu tiên | Tiêu chí nghiệm thu chính |
| --- | --- | --- | --- |
| SET-01 | Cấu hình tên ứng dụng, timezone và các mốc nhắc deadline. | Should | Mặc định timezone Asia/Ho_Chi_Minh; mốc nhắc có thể thay đổi mà không sửa mã nguồn. |
| SET-02 | Trang lỗi/không có quyền/không tìm thấy dữ liệu. | Must | Không để lộ stack trace, SQL hoặc thông tin bí mật cho người dùng cuối. |
| SET-03 | Màn hình quản trị toàn hệ thống. | Out of scope | Chưa được yêu cầu trong hai tài liệu; chỉ triển khai khi có quyết định sản phẩm. |

# 7. Quy tắc nghiệp vụ

## 7.1 Thành viên và quyền

- BR-01: User có thể là Member ở nhóm A và Leader ở nhóm B; quyền được tính theo GroupMembership hiện hành.

- BR-02: Người tạo nhóm mặc định là Leader đầu tiên.

- BR-03: Không xóa hoặc vô hiệu hóa Leader duy nhất mà không chuyển quyền cho một Member khác trước.

- BR-04: Một task thuộc đúng một project; project thuộc đúng một group; assignee phải là thành viên hợp lệ của group tại thời điểm gán.

- BR-05: Member không xem phần trăm hoàn thành và chi tiết workload riêng của Member khác. Các dữ liệu tổng quan của nhóm có thể hiển thị mà không tiết lộ tiến độ cá nhân, ví dụ số task toàn dự án.

- BR-06: Quyền phải được kiểm tra ở server cho mọi thao tác đọc/ghi; không dựa vào việc ẩn nút ở frontend.

## 7.2 Deadline và trạng thái

- BR-07: Deadline lưu theo timestamp có timezone; giao diện hiển thị theo Asia/Ho_Chi_Minh mặc định.

- BR-08: Một task là quá hạn nếu now > deadline và task chưa Completed/Approved. “Overdue” là trạng thái tính toán/nhãn, không thay thế trạng thái công việc.

- BR-09: Nếu task/project không có deadline, không được đánh dấu overdue và không gửi nhắc deadline.

- BR-10: Task Completed luôn có progressPercent = 100; progressPercent nằm trong khoảng 0-100.

- BR-11: Nếu project có task con, tránh đếm cả task cha và task con như hai đơn vị ngang nhau trong KPI. Đề xuất tính thống kê theo task lá (leaf tasks) hoặc theo một quy tắc thống nhất được mô tả trong mã và test.

- BR-12: Trạng thái project đề xuất tự suy ra: không có task bắt đầu → Not started; có ít nhất một task đang làm/đã submit nhưng chưa tất cả hoàn tất → In progress; tất cả task hiệu lực hoàn tất → Completed; deadline project qua mà chưa hoàn tất → Overdue flag.

## 7.3 Công thức tiến độ đề xuất

Để tránh hai trang hiển thị hai tỷ lệ khác nhau, đề xuất phân biệt tiến độ task, tiến độ dự án và phần đóng góp của một thành viên:

| Chỉ số | Công thức đề xuất | Ghi chú |
| --- | --- | --- |
| Tiến độ một task | progressPercent do assignee cập nhật từ 0-100; nếu Completed/Approved thì = 100. | Phản ánh ước lượng tiến triển thực tế. |
| Tiến độ dự án theo task | Số task lá Completed / Tổng số task lá đang hoạt động × 100%. | Dễ hiểu ở MVP; không dùng trung bình % task nếu chưa xác nhận. |
| Tiến độ có trọng số | Tổng(points của task lá Completed) / Tổng(points của task lá đang hoạt động) × 100%. | Có thể dùng khi point đã được gán đầy đủ. |
| Tiến độ Member | Số task được giao cho Member và hoàn thành / tổng task được giao đang hoạt động × 100%. | Chỉ Leader xem; nêu rõ đây là tỷ lệ theo số lượng, không phải point contribution. |

| Khuyến nghị  Chọn một công thức cho dashboard MVP và dùng nhất quán. Không trộn “% tiến độ làm task” với “% đóng góp của Member” vì hai con số trả lời hai câu hỏi khác nhau. |
| --- |

## 7.4 Nhắc deadline

- BR-13: Mốc mặc định gồm 3 ngày, 1 ngày và 3 giờ trước deadline, cộng một thông báo sau khi quá hạn.

- BR-14: Mỗi notification có khóa chống trùng theo task + người nhận + mốc nhắc. Job chạy lại không tạo thông báo lặp.

- BR-15: Task được hoàn thành trước mốc nhắc thì các nhắc trước hạn còn chưa gửi phải bị bỏ qua.

- BR-16: Nếu deadline đổi, các reminder đã lên lịch cần được tính lại; không gửi nhắc theo deadline cũ.

- BR-17: Nhắc quá hạn có thể lặp theo chu kỳ cấu hình; mặc định MVP chỉ gửi thông báo quá hạn đầu tiên, tránh spam.

## 7.5 Marketplace

- BR-18: Yêu cầu Marketplace mặc định Pending; chỉ Leader mới được Accept/Reject.

- BR-19: Accept Transfer/Swap cập nhật assignee của các task liên quan trong một transaction; nếu một phần cập nhật thất bại thì rollback toàn bộ.

- BR-20: Need Help không đổi assignee chính; hệ thống ghi nhận người hỗ trợ và phạm vi hỗ trợ. Cách tính điểm hỗ trợ cần được chốt riêng.

- BR-21: Không cho đổi task đã Completed/Archived trừ khi có quy tắc nghiệp vụ rõ ràng.

- BR-22: Workload chỉ là tín hiệu hỗ trợ Leader quyết định; không tự động từ chối yêu cầu chỉ dựa trên số task.

## 7.6 Point và % đóng góp - đề xuất cần xác nhận

Tài liệu gốc muốn tính point khi hoàn thành task để suy ra phần trăm đóng góp trong project nhưng chưa xác định công thức. Đề xuất mặc định để thảo luận: Leader gán mỗi task lá một point nguyên dương theo độ phức tạp; khi task được Approve, số point đó được tính cho assignee tại thời điểm hoàn thành. Contribution của Member = point đã được approve ghi nhận cho Member / tổng point approve của tất cả Member trong project × 100%.

- Phải quyết định riêng: point tổng lấy theo task đã hoàn thành hay toàn bộ point kế hoạch; task chuyển người phụ trách có chia point hay không; Need Help chia point theo tỷ lệ nào; Swap có làm thay lịch sử phân bổ hay không; task bị reopen xử lý ra sao.

- Khuyến nghị lưu ContributionCredit/PointLedger có lịch sử thay vì ghi đè một con số tổng, để chuyển giao task không xóa công sức đã đóng góp trước đó.

- Nếu chưa chốt quy tắc, chỉ lưu trường point tùy chọn và chưa hiển thị phần trăm đóng góp như dữ liệu chính thức.

## 7.7 Activity log

- BR-23: Log được tạo phía server cùng transaction với hành động nghiệp vụ quan trọng.

- BR-24: Mỗi log nên lưu actorUserId, groupId/projectId nếu có, entityType, entityId, action, timestamp, summary và before/after cho những trường phù hợp.

- BR-25: Không ghi mật khẩu, token, secret, nội dung nhạy cảm hoặc file nhị phân vào log.

# 8. Mô hình dữ liệu đề xuất

Đây là mô hình khái niệm để AI lập trình thiết kế database. Tên bảng/cột có thể đổi theo quy ước dự án nhưng quan hệ, quyền và dữ liệu nghiệp vụ phải được giữ.

| Entity / bảng | Trường chính gợi ý | Quan hệ / lưu ý |
| --- | --- | --- |
| Users | Id, DisplayName, Email, PasswordHash, AvatarUrl, CreatedAt, UpdatedAt, IsActive | Email unique; không lưu mật khẩu dạng plain text. |
| Groups | Id, Name, Description, CreatedByUserId, CreatedAt, IsArchived | Nhóm là không gian làm việc. |
| GroupMembers | Id, GroupId, UserId, Role, JoinedAt, Status | Unique(GroupId, UserId); Role = Leader/Member. |
| GroupInvites | Id, GroupId, TokenHash/Code, CreatedBy, ExpiresAt, MaxUses, UsedCount, RevokedAt | Không lưu token mời nhạy cảm dạng plain text nếu có thể tránh. |
| Projects | Id, GroupId, Name, Description, Subject, DeadlineAt, Status/StatusComputed, CreatedBy, CreatedAt, ArchivedAt | Project thuộc một Group. |
| Tasks | Id, ProjectId, ParentTaskId, Title, Description, AssigneeUserId, Status, ProgressPercent, Priority, EstimateHours, DeadlineAt, Points, CreatedBy, CreatedAt, UpdatedAt, SubmittedAt, CompletedAt | Task có thể có subtask; FK assignee phải được kiểm tra membership. |
| TaskLinks / Attachments | Id, ProjectId, TaskId nullable, Url, DisplayName, Type, CreatedBy, CreatedAt | MVP ưu tiên URL; file nhị phân ở phase sau. |
| TaskComments | Id, TaskId, AuthorUserId, Body, CreatedAt, UpdatedAt, DeletedAt nullable | Comment thuộc task; nên giữ lịch sử sửa/xóa theo chính sách. |
| TaskReviews | Id, TaskId, ReviewerUserId, Decision, Comment, CreatedAt, SubmissionVersion | Lưu các lần Review/Approve/Changes requested. |
| Notifications | Id, RecipientUserId, GroupId nullable, Type, Title, Body, RelatedEntityType, RelatedEntityId, CreatedAt, ReadAt | Index theo RecipientUserId + CreatedAt + ReadAt. |
| ReminderDeliveries | Id, TaskId, RecipientUserId, ReminderType, ScheduledFor, SentAt, DeduplicationKey, Status | Chống gửi trùng và hỗ trợ retry. |
| ActivityLogs | Id, ActorUserId, GroupId, ProjectId nullable, EntityType, EntityId, Action, Summary, BeforeJson, AfterJson, CreatedAt | Chỉ server ghi; filter theo group/time/action. |
| MarketplaceRequests | Id, GroupId, ProjectId, TaskId, RequestType, RequestedByUserId, TargetUserId nullable, RelatedTaskId nullable, Reason, Status, ReviewerUserId, ReviewComment, CreatedAt, ReviewedAt | NeedHelp/Transfer/Swap; lưu snapshot đủ để truy vết. |
| HelpAssignments | Id, MarketplaceRequestId, HelperUserId, ScopeDescription, Status, CreatedAt | Tùy chọn nếu Need Help được duyệt và có người hỗ trợ. |
| NotificationPreferences | Id, UserId, Channel, Reminder3Days, Reminder1Day, Reminder3Hours, OverdueAlert | Mỗi user có cấu hình riêng; default rõ ràng. |
| PointLedger (phase sau) | Id, ProjectId, TaskId, UserId, PointsDelta, Reason, RelatedRequestId, CreatedAt | Lưu lịch sử điểm, không chỉ lưu tổng. |

## 8.1 Ràng buộc dữ liệu quan trọng

- Email người dùng phải unique sau khi chuẩn hóa chữ hoa/chữ thường và khoảng trắng.

- GroupMembers có unique key (GroupId, UserId) để tránh membership trùng.

- Xóa project/group nên dùng soft delete/archive hoặc xác nhận ảnh hưởng; không cascade xóa dữ liệu lịch sử quan trọng một cách âm thầm.

- Task parent và child phải thuộc cùng project; ngăn parentTaskId tham chiếu chính task hoặc tạo vòng lặp.

- Các entity quan trọng dùng UTC ở database; chỉ chuyển sang timezone người dùng ở UI. Nếu dùng SQL Server datetimeoffset, quy tắc phải nhất quán.

- Các chỉ mục nên cân nhắc: Tasks(ProjectId, Status, DeadlineAt), Tasks(AssigneeUserId, Status, DeadlineAt), Notifications(RecipientUserId, ReadAt, CreatedAt), ActivityLogs(GroupId, CreatedAt).

# 9. Danh sách màn hình và yêu cầu UI/UX

| Mã màn hình | Mục đích / thành phần chính | Quyền / trạng thái đặc biệt |
| --- | --- | --- |
| UI-01 Landing / Auth | Giới thiệu ngắn, đăng nhập, đăng ký, quên mật khẩu. | Guest; validation và lỗi xác thực. |
| UI-02 First-use / Join group | Tạo nhóm mới hoặc nhập mã/link tham gia. | User đã login nhưng chưa có group. |
| UI-03 Home Dashboard | Task hôm nay, task sắp hạn/quá hạn, số liệu và lịch/deadline thu gọn. | Nội dung theo user hiện tại; empty state. |
| UI-04 Group workspace | Danh sách dự án, thành viên, vai trò và hoạt động gần đây. | Các chức năng quản trị nhóm chỉ hiện cho Leader. |
| UI-05 Project overview | Mô tả, môn học, deadline, tiến độ, task counts, deadline tiếp theo. | Leader xem toàn bộ; Member thấy dữ liệu được phép. |
| UI-06 Task list / Kanban | Bảng task, lọc/sắp xếp; Kanban theo trạng thái nếu triển khai. | Hành động có quyền mới khả dụng. |
| UI-07 Task detail | Mô tả, assignee, deadline, priority, progress, comment, file/link, review history. | Submit/Approve/Edit theo role và status. |
| UI-08 Leader progress | Bảng member/task hoàn thành, tiến độ nhóm, overdue, deadline gần nhất. | Leader only; Member không thể xem chi tiết qua URL/API. |
| UI-09 Notifications | Danh sách mới nhất, unread badge, đánh dấu đã đọc. | Chỉ dữ liệu của user hiện tại. |
| UI-10 Activity log | Bộ lọc thành viên, khoảng thời gian, project và action. | Leader only theo nhóm. |
| UI-11 Marketplace | Tab yêu cầu của tôi, chờ duyệt, đã duyệt/từ chối; form Need Help/Transfer/Swap. | Leader có thao tác duyệt; Member chỉ tạo/xem yêu cầu có quyền. |
| UI-12 Files / links | Danh sách link/file, tên hiển thị, người tạo, thời gian tạo, tải/xóa theo quyền. | Upload file ở phase sau. |
| UI-13 Settings | Hồ sơ, mật khẩu, tùy chỉnh reminder. | Cấu hình cá nhân; không hiển thị secret. |

## 9.1 Nguyên tắc thiết kế

- Thiết kế responsive theo desktop-first cho màn hình làm việc nhóm, đồng thời usable trên mobile; không để bảng bị tràn ngang ngoài kiểm soát.

- Điều hướng rõ: Dashboard, Groups, Projects/Tasks, Notifications, Profile/Settings.

- Dùng màu trạng thái nhất quán nhưng không chỉ dựa vào màu: đi kèm nhãn chữ và biểu tượng phù hợp.

- Form cần validation tại client để hỗ trợ trải nghiệm và tại server để bảo vệ dữ liệu.

- Mọi trang lấy dữ liệu bất đồng bộ cần loading, empty, error, retry và success feedback.

- Không dùng dữ liệu giả cứng làm như dữ liệu thật. Seed demo phải được phân biệt rõ và không được phụ thuộc để ứng dụng hoạt động.

- Có confirm dialog cho xóa thành viên, archive project, xóa file/link, thay deadline lớn và các thao tác có tác động nhóm.

# 10. Yêu cầu phi chức năng

| Mã | Nhóm | Yêu cầu |
| --- | --- | --- |
| NFR-SEC-01 | Xác thực | Mật khẩu phải được hash bằng thuật toán chuẩn hiện đại; không lưu hoặc log mật khẩu dạng rõ. |
| NFR-SEC-02 | Phân quyền | Mọi endpoint kiểm tra authentication và authorization theo group/project/task; chống IDOR (đổi ID để đọc dữ liệu người khác). |
| NFR-SEC-03 | Bảo vệ web | Validate input; chống SQL injection qua ORM/parameterization; encode output; bảo vệ CSRF nếu dùng cookie; rate limit endpoint nhạy cảm. |
| NFR-SEC-04 | Secrets | Connection string, OAuth secret, JWT signing key, SMTP credentials dùng biến môi trường hoặc secret store; không commit vào Git. |
| NFR-SEC-05 | Upload | Nếu hỗ trợ upload: giới hạn size/extension/MIME, tên file không tin cậy, lưu ngoài webroot hoặc storage riêng, kiểm tra quyền tải. |
| NFR-DATA-01 | Toàn vẹn | Các thao tác cập nhật đồng thời như approve transfer/swap phải dùng transaction; FK/unique/check constraint phù hợp. |
| NFR-DATA-02 | Backup | Có hướng dẫn backup/restore database và file storage; không coi migration thay thế backup. |
| NFR-PERF-01 | Hiệu năng | Danh sách lớn có pagination; tránh N+1 query; chỉ truy vấn trường cần thiết. |
| NFR-PERF-02 | Phản hồi | Mục tiêu đề xuất: các truy vấn màn hình thông thường dưới 2 giây ở môi trường demo với dữ liệu vừa phải; đo thực tế trước khi tuyên bố đạt. |
| NFR-UX-01 | Khả dụng | Hiển thị lỗi dễ hiểu, giữ dữ liệu form hợp lý khi lỗi, empty state và trạng thái đang tải. |
| NFR-UX-02 | Accessibility | Nhãn form rõ; tab keyboard; focus visible; contrast phù hợp; trạng thái không chỉ phân biệt bằng màu. |
| NFR-LOC-01 | Ngôn ngữ / thời gian | Giao diện mặc định tiếng Việt; timezone Asia/Ho_Chi_Minh; quy tắc UTC trong database phải nhất quán. |
| NFR-MAINT-01 | Bảo trì | Code chia layer/module; quy ước naming nhất quán; không đặt toàn bộ nghiệp vụ vào controller hoặc component UI. |
| NFR-OBS-01 | Logging | Log lỗi server có correlation/request ID; không trả stack trace hoặc secrets tới browser. |
| NFR-TEST-01 | Kiểm thử | Có unit test cho business rules, integration test cho quyền/API quan trọng và smoke test các luồng end-to-end. |
| NFR-DEP-01 | Triển khai | Có README, file cấu hình mẫu .env.example (không có secret thật), database migrations và hướng dẫn deploy. |

# 11. Định hướng kiến trúc và quy chuẩn code

## 11.1 Quy tắc trước khi code

- Nếu đã có repository: kiểm tra file, framework, version, schema, cách chạy và code hiện có trước khi sửa; không thay stack chỉ vì sở thích.

- Nếu bắt đầu từ đầu và chưa có lựa chọn công nghệ, stack mặc định đề xuất để dễ phát triển trong hệ sinh thái Visual Studio là ASP.NET Core Web API + Entity Framework Core + SQL Server cho backend/database, React + TypeScript cho frontend, OpenAPI/Swagger cho tài liệu API.

- Frontend và backend tách ranh giới rõ. Backend là nơi quyết định quyền, trạng thái, điểm, deadline, công thức dashboard và tạo activity log.

- Không viết tất cả vào một file; tách feature/module và lớp trách nhiệm. Dùng DTO/request models thay vì bind trực tiếp entity database trong API.

- Dùng migration có version cho database; seed data chỉ dành cho development/demo; có script reset dữ liệu demo an toàn.

- Không tự tạo fake endpoint hoặc nút bấm không hoạt động để làm UI trông hoàn chỉnh.

## 11.2 Cấu trúc module đề xuất

| Phần | Trách nhiệm | Ví dụ thành phần |
| --- | --- | --- |
| Frontend / UI | Màn hình, routing, state, form validation, gọi API, loading/error. | auth, groups, projects, tasks, dashboard, notifications, marketplace. |
| API / Controller | Nhận request, xác thực, kiểm tra input, gọi service và trả response thống nhất. | AuthController, GroupsController, ProjectsController, TasksController. |
| Application / Services | Quy tắc nghiệp vụ và điều phối transaction. | TaskService, ReviewService, MarketplaceService, ReminderService. |
| Domain / Models | Entity, enum, value object và business rules cốt lõi. | GroupMembership, TaskStatus, MarketplaceRequestStatus. |
| Persistence | EF Core DbContext, repositories nếu thật sự hữu ích, migrations, query. | ApplicationDbContext, configurations, migrations. |
| Background jobs | Lên lịch nhắc deadline và cảnh báo inactivity/overdue. | Hosted service hoặc scheduler phù hợp; cần chống chạy trùng. |
| External adapters | Email, Google OAuth, storage, push. | Interface + provider implementation; cấu hình được bật/tắt. |

## 11.3 Chuẩn chất lượng code

- Dùng enum/constant cho Role, TaskStatus, Priority, ReviewDecision, MarketplaceRequestType và NotificationType; tránh magic string rải rác.

- Xử lý lỗi thống nhất (validation 400, unauthenticated 401, forbidden 403, not found 404, conflict 409, lỗi bất ngờ 500) và thông báo không lộ nội bộ.

- API list có pagination, sort/filter allowlist; không chấp nhận sort field bất kỳ từ client.

- Các thao tác đổi deadline, đổi assignee, review và Marketplace phải tạo notification/activity log tương ứng.

- Dùng cancellation, async/await và transaction hợp lý ở backend; không block thread bằng gọi đồng bộ với tác vụ I/O.

- Viết test cho các edge case: membership đã bị thu hồi, task deadline vừa đổi, task đã hoàn thành, request duyệt bị gửi hai lần, hai Leader xử lý đồng thời.

# 12. API và tích hợp đề xuất

Các route dưới đây là gợi ý REST, không phải ràng buộc tên chính xác. AI có thể điều chỉnh theo convention của codebase nhưng cần giữ ngữ nghĩa và kiểm soát quyền tương đương.

| Domain | Endpoint mẫu | Mục đích |
| --- | --- | --- |
| Auth | POST /api/auth/register; POST /api/auth/login; POST /api/auth/logout; POST /api/auth/forgot-password | Xác thực và quản lý phiên. |
| Me | GET /api/me; PATCH /api/me; PATCH /api/me/password | Hồ sơ người dùng hiện tại. |
| Groups | GET/POST /api/groups; GET/PATCH /api/groups/{id}; POST /api/groups/{id}/invites | Quản lý nhóm và lời mời. |
| Members | GET /api/groups/{id}/members; PATCH /api/groups/{id}/members/{userId}; DELETE /api/groups/{id}/members/{userId} | Thành viên/vai trò; yêu cầu Leader. |
| Projects | GET/POST /api/groups/{groupId}/projects; GET/PATCH /api/projects/{id} | CRUD dự án có authorization. |
| Tasks | GET/POST /api/projects/{id}/tasks; GET/PATCH /api/tasks/{id}; POST /api/tasks/{id}/submit | Task, bộ lọc, submit. |
| Reviews | POST /api/tasks/{id}/reviews; GET /api/tasks/{id}/reviews | Approve hoặc yêu cầu sửa. |
| Comments | GET/POST /api/tasks/{id}/comments | Trao đổi gắn với task. |
| Dashboard | GET /api/dashboard/me; GET /api/groups/{id}/progress | Tổng hợp số liệu cá nhân/Leader. |
| Notifications | GET /api/notifications; PATCH /api/notifications/{id}/read; PATCH /api/notification-preferences | Notification và cấu hình. |
| Marketplace | GET/POST /api/marketplace/requests; POST /api/marketplace/requests/{id}/decision | Tạo và duyệt request. |
| Activity | GET /api/groups/{id}/activity?from=&to=&userId=&action= | Lịch sử, chỉ role phù hợp. |
| Links / Files | POST/GET /api/projects/{id}/links; POST /api/tasks/{id}/links | MVP lưu URL; upload endpoint ở phase sau. |

## 12.1 Quy ước API

- Dùng HTTPS khi triển khai; version API khi cần thay đổi phá vỡ tương thích.

- Không tin userId/role do frontend tự truyền để quyết định actor; lấy identity từ phiên/token đã xác thực.

- Các response lỗi có code ổn định và message người dùng đọc được; không trả query SQL hoặc exception detail.

- POST approve/transfer/swap phải idempotent hoặc có kiểm soát xung đột để double-click không xử lý hai lần.

- OpenAPI/Swagger phải khớp implementation và không để lộ endpoint quản trị/debug ở production.

# 13. Tiêu chí nghiệm thu end-to-end

Một bản demo chỉ được coi là MVP hoàn thành khi các luồng dưới đây chạy được với dữ liệu trong database, không phụ thuộc dữ liệu cứng trong giao diện.

| Mã / luồng | Các bước | Điều kiện đạt |
| --- | --- | --- |
| E2E-01 Đăng ký và tạo nhóm | User A đăng ký, đăng nhập, tạo nhóm G. | A được ghi thành Leader; group/member lưu DB và hiện trong UI. |
| E2E-02 Mời Member | A tạo invite; User B tham gia bằng mã/link. | B xuất hiện trong danh sách với vai trò Member; mã hết hạn/thu hồi bị từ chối. |
| E2E-03 Tạo project và task | A tạo project P và task T, gán B, đặt deadline/priority/estimate. | T xuất hiện trong project và dashboard B; B nhận notification; log lưu task creation/assignment. |
| E2E-04 Cập nhật tiến độ | B đổi T sang In progress và cập nhật 40%. | Leader nhìn thấy trạng thái/%; member C không xem được tiến độ cá nhân riêng của B. |
| E2E-05 Submit và review | B submit T; A yêu cầu sửa; B sửa và submit lại; A approve. | Lịch sử submit/review được giữ; task hoàn thành 100%; số liệu dashboard cập nhật. |
| E2E-06 Nhắc deadline | T có deadline trong tương lai; scheduler chạy các mốc nhắc. | Mỗi recipient nhận tối đa một reminder cho từng mốc; hoàn thành/đổi deadline ngăn nhắc cũ. |
| E2E-07 Marketplace Transfer | B yêu cầu transfer T cho C; A duyệt. | Assignee chỉ đổi sau khi duyệt; B/C/A nhận thông báo phù hợp; history ghi nhận trước/sau. |
| E2E-08 Marketplace Reject | B gửi Swap/Transfer; A từ chối kèm lý do. | Task không đổi assignee; request lưu trạng thái Rejected và thông báo lý do. |
| E2E-09 Audit log | A thay deadline T; B submit T. | Log ghi đúng actor, timestamp, entity và thay đổi; member không thể sửa log qua API. |
| E2E-10 Authorization | User ngoài nhóm biết URL/id task T và thử truy cập trực tiếp API. | Backend trả 403 hoặc 404 theo chính sách, không trả dữ liệu T. |
| E2E-11 Empty/error states | User mới chưa tham gia nhóm hoặc API lỗi tạm thời. | UI có empty/error/retry state; không crash hoặc hiển thị dữ liệu demo giả. |
| E2E-12 Reload persistence | Sửa task, refresh trang hoặc đăng nhập lại. | Dữ liệu vẫn tồn tại trong DB; không mất do chỉ lưu ở state frontend. |

## 13.1 Definition of Done cho mỗi tính năng

- Đã có UI, API, business logic và persistence cần thiết; không chỉ mockup.

- Đã kiểm tra quyền ở server, validation, trạng thái lỗi và trường hợp dữ liệu rỗng.

- Đã có test phù hợp và thử luồng thực tế trên local.

- Đã cập nhật migration/schema, README và tài liệu API khi cần.

- Không còn secret hard-code, lỗi nghiêm trọng trong console/server log hoặc nút chức năng không hoạt động.

- Có mô tả rõ phần chưa hoàn thiện và không tuyên bố tính năng đã xong khi còn mock.

# 14. Giả định, quyết định còn mở và rủi ro

## 14.1 Giả định đang dùng trong bản BA

| Mã | Giả định đề xuất | Ảnh hưởng nếu khác |
| --- | --- | --- |
| A-01 | Sản phẩm đầu tiên là web responsive, không phải mobile app native. | Ảnh hưởng kiến trúc UI và phát hành app store. |
| A-02 | Ngôn ngữ mặc định là tiếng Việt; timezone mặc định Asia/Ho_Chi_Minh. | Ảnh hưởng i18n và cách hiển thị deadline. |
| A-03 | Một task có một assignee chính trong MVP; hỗ trợ phụ qua workflow riêng. | Nếu nhiều assignee, tiến độ/point và quyền cập nhật cần thiết kế lại. |
| A-04 | Leader duyệt Submit/Approve và Marketplace. | Nếu nhóm cho phép peer review, ma trận quyền cần sửa. |
| A-05 | Notification trong web là bắt buộc; email/push là phần mở rộng. | Nếu email là bắt buộc ngay, cần cấu hình provider và xử lý bounce/retry. |
| A-06 | Project status phần lớn suy ra từ task; task overdue là nhãn tính toán. | Nếu người dùng muốn chỉnh status thủ công, cần giải quyết mâu thuẫn giữa trạng thái tự động và trạng thái nhập tay. |
| A-07 | MVP dùng URL tài liệu; file upload trực tiếp ở giai đoạn sau. | Nếu file upload bắt buộc ngay, cần storage, bảo mật, giới hạn dung lượng và backup. |

## 14.2 Các quyết định chủ sản phẩm cần chốt

| Câu hỏi cần quyết định | Mặc định đề xuất cho MVP |
| --- | --- |
| Member có được tạo project/task không? | Mặc định chỉ Leader tạo/sửa project, gán task; Member gửi yêu cầu nếu cần thay đổi. |
| Task có thể có nhiều assignee chính? | Không; một assignee chính, helper được quản lý riêng. |
| Có hiển thị tiến độ tổng quan cho Member? | Có số liệu tổng dự án, không có % chi tiết của từng Member khác. |
| Công thức point đóng góp? | Chưa bật hiển thị contribution chính thức đến khi chốt; đề xuất point được Leader gán và credit theo task được approve. |
| Need Help ghi nhận point cho người hỗ trợ thế nào? | Chưa tự chia point; cần quyết định tỷ lệ hoặc subtask/credit riêng. |
| Reminder lặp sau khi quá hạn? | MVP chỉ gửi cảnh báo quá hạn đầu tiên; có thể thêm nhắc lặp theo preference. |
| Ngưỡng cảnh báo risk? | Đề xuất còn <= 8 giờ và progress < 70%; không cập nhật trong 24 giờ; để cấu hình. |
| Có cần chat realtime ngay không? | Không trong MVP; comment/task discussion là kênh trao đổi ban đầu. |
| Có cần upload file nhị phân ngay không? | Không trong MVP; dùng URL, trừ khi người dùng xác nhận storage trực tiếp là bắt buộc. |
| Có cần admin toàn hệ thống? | Chưa; không xây dựng nếu chưa có yêu cầu riêng. |

## 14.3 Rủi ro và giảm thiểu

| Rủi ro | Biện pháp |
| --- | --- |
| Phạm vi quá lớn làm AI code dở dang | Làm theo module và milestone; test sau mỗi giai đoạn; ưu tiên luồng E2E cốt lõi. |
| UI hoàn chỉnh nhưng dữ liệu giả | Yêu cầu API/database từ đầu; seed data được đánh dấu demo; nghiệm thu sau refresh/login. |
| Lộ tiến độ Member cho thành viên khác | Authorization theo group/role ở server và test IDOR. |
| Nhắc deadline gửi trùng hoặc sai deadline | ReminderDeliveries, deduplication key, tính lại lịch khi deadline đổi, bỏ nhắc khi hoàn tất. |
| Marketplace chuyển task một phần | Transaction DB, idempotency và concurrency handling. |
| Công thức point chưa thống nhất | Không hiển thị con số đóng góp chính thức trước khi chốt quy tắc và test. |
| File upload có nội dung nguy hiểm | MVP dùng link; phase file upload có whitelist, size limits, storage riêng và kiểm tra quyền. |

# 15. Prompt bàn giao cho AI lập trình

Sao chép prompt dưới đây và gửi cùng file BA này cho AI lập trình. Nếu AI hỗ trợ chế độ Agent/Workspace, yêu cầu nó đọc repository hiện tại và tiến hành từng milestone trong cùng repo.

Bạn là Senior Business Analyst + Software Architect + Senior Full-stack Engineer. Hãy đọc toàn bộ file “GMind_Business_Analysis_Specification_v1.0.docx” trước khi sửa code. Đây là nguồn yêu cầu nghiệp vụ chính.

MỤC TIÊU
Xây dựng GMind - web app quản lý bài tập/dự án nhóm sinh viên. Phải làm cả thiết kế UI/UX và triển khai code thực tế. Trước khi code giao diện, lập sitemap, user flows, design system (màu, typography, spacing, component rules) và cấu trúc các màn hình theo BA; sau đó triển khai giao diện nhất quán, responsive và kết nối với API/database thật. Không chỉ tạo UI tĩnh: chức năng phải hoạt động qua backend/API, authorization, validation, error/loading/empty states và tests.

QUY TẮC BẮT BUỘC
1. Trước khi code, kiểm tra repository hiện có: framework/version, cấu trúc, cách chạy, DB, migrations và code đã có. Nếu repo đã dùng stack nào thì giữ stack đó trừ khi có lý do kỹ thuật rõ ràng. Không phá hoặc viết lại phần ổn định tùy tiện.
2. Nếu repo trống và chưa có quyết định công nghệ, mặc định đề xuất ASP.NET Core Web API + EF Core + SQL Server ở backend/database và React + TypeScript ở frontend. Dùng OpenAPI/Swagger. Trình bày kiến trúc và các lệnh chạy trước khi triển khai.
3. Đọc toàn bộ BA, đặc biệt ma trận quyền, business rules, data model, reminders, Marketplace và tiêu chí nghiệm thu. Nếu yêu cầu chưa chốt, làm theo mặc định được ghi trong BA và đánh dấu rõ; không tự phát minh chính sách quan trọng.
4. Triển khai theo milestone nhỏ, mỗi milestone phải build/run/test được. Không tạo một khối code khổng lồ hoặc tất cả vào một file.
5. Không dùng fake API hay dữ liệu hard-code giả làm production. Có thể tạo seed data cho demo nhưng phải ghi rõ cách seed và cách đăng nhập demo.
6. Tất cả quyền phải kiểm tra ở backend. Không được tin role/userId gửi từ frontend. Đặc biệt Member không được đọc % tiến độ cá nhân của Member khác; chỉ Leader có quyền xem chi tiết tiến độ từng người trong nhóm.
7. Password phải hash an toàn. Secrets/connection strings/OAuth keys không được commit. Validate input và chuẩn hóa lỗi API. Không trả stack trace hoặc secret ra frontend.
8. Dùng database migrations có version; có FK/unique constraints/indexes hợp lý. Các thao tác Marketplace, review, thay đổi assignee và log/notification phải giữ tính toàn vẹn bằng transaction khi cần.
9. Notification/reminder phải chống trùng. Khi deadline đổi hoặc task hoàn thành, cập nhật/bỏ reminder cũ. Job nền phải có hướng dẫn chạy và quan sát lỗi.
10. Mỗi tính năng phải có loading, empty, error, success state; UI responsive; không để nút không hoạt động.
11. Viết unit/integration tests cho business rules và authorization quan trọng. Ít nhất phải test các luồng E2E trong mục 13 của BA, đặc biệt IDOR, task submit/review, reminder deduplication và Marketplace accept/reject.
12. Sau mỗi milestone, báo: file tạo/sửa, quyết định kiến trúc, migration, lệnh chạy, lệnh test và kết quả thực tế. Không tuyên bố test/build thành công nếu chưa chạy.

THỨ TỰ TRIỂN KHAI
Milestone 0: audit repo, đề xuất architecture/plan, kiểm tra môi trường và tạo README cấu hình.
Milestone 0.5: tạo sitemap, user flows, design tokens, component inventory và wireframe/thiết kế màn hình chính (Dashboard, Group, Project, Task detail, Leader progress, Notifications, Marketplace, Settings); sau đó triển khai UI theo design system thay vì tạo từng trang không đồng bộ.
Milestone 1: database model + migrations + authentication/profile.
Milestone 2: groups, invitations, membership và authorization.
Milestone 3: projects, tasks/subtasks, assignment, dashboard cá nhân và Leader.
Milestone 4: comments, submit/review/approve, activity log.
Milestone 5: in-app notifications + background deadline reminders với chống trùng.
Milestone 6: Need Help/Transfer/Swap, approval transaction và notifications.
Milestone 7: Calendar/Kanban, file upload trực tiếp, realtime chat và risk alerts chỉ sau khi luồng MVP ổn định hoặc khi BA/PO xác nhận ưu tiên.
Milestone 8: chạy đầy đủ tests, sửa lỗi, rà soát bảo mật, cập nhật README và bàn giao.

ĐẦU RA CẦN BÀN GIAO
- Source code đầy đủ trong repo; frontend/backend có thể chạy theo README.
- Database migrations và seed/demo data có hướng dẫn.
- File cấu hình mẫu không chứa secret thật.
- API docs/OpenAPI, mô tả cấu trúc thư mục và các quyết định chính.
- Tests cùng kết quả chạy thực tế.
- Danh sách chức năng đã hoàn thành, chưa hoàn thành, giới hạn và vấn đề còn mở.

Bắt đầu bằng cách kiểm tra repository và báo cáo ngắn tình trạng hiện tại + kế hoạch milestone. Sau đó thực hiện từng milestone, không chỉ đưa code mẫu trong câu trả lời.

# Phụ lục A. Thuật ngữ

| Thuật ngữ | Giải thích dễ hiểu |
| --- | --- |
| BA (Business Analysis) | Phân tích nghiệp vụ: xác định người dùng cần gì, quy tắc hoạt động, phạm vi và cách kiểm tra đúng/sai. |
| SRS (Software Requirements Specification) | Đặc tả yêu cầu phần mềm: tài liệu mô tả hệ thống cần làm gì và yêu cầu chất lượng. |
| MVP (Minimum Viable Product) | Phiên bản tối thiểu có thể sử dụng thực tế và kiểm chứng luồng nghiệp vụ chính. |
| RBAC (Role-Based Access Control) | Phân quyền dựa trên vai trò, ví dụ Leader và Member. |
| CRUD | Create, Read, Update, Delete: tạo, xem, cập nhật và xóa dữ liệu. |
| API | Giao diện để frontend gọi backend lấy/cập nhật dữ liệu. |
| Entity / FK | Entity là thực thể/bảng dữ liệu; FK (Foreign Key) là khóa ngoại liên kết dữ liệu giữa các bảng. |
| Migration | Phiên bản thay đổi schema database được quản lý bằng code để môi trường khác có thể cập nhật nhất quán. |
| IDOR | Lỗi phân quyền khi người dùng đổi ID trên URL/API để xem hoặc sửa tài nguyên của người khác. |
| UTC / Timezone | UTC là mốc thời gian chuẩn; timezone xác định cách chuyển giờ để hiển thị đúng địa phương. |
| Idempotency | Một thao tác gửi lặp không tạo kết quả lặp ngoài ý muốn, ví dụ click Accept hai lần không chuyển task hai lần. |
| Transaction | Nhóm thao tác DB được thực hiện toàn bộ hoặc rollback toàn bộ để tránh dữ liệu nửa chừng. |
| Activity log / Audit log | Lịch sử ai làm gì, với đối tượng nào và lúc nào. |
| Need Help / Transfer / Swap | Lần lượt là xin hỗ trợ một phần, đề nghị chuyển task và đề nghị đổi task. |
| Point / Contribution | Point là điểm độ phức tạp/giá trị task; contribution là tỷ lệ đóng góp được tính theo công thức đã thống nhất. |
| Empty / Loading / Error state | Trạng thái giao diện khi chưa có dữ liệu, đang tải hoặc xảy ra lỗi. |
