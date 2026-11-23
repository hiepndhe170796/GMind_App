# Open Questions & Deferred Decisions

Mục này ghi nhận các quyết định nghiệp vụ/kỹ thuật chưa được xác nhận hoặc còn chờ triển khai. Không coi các mục dưới đây là yêu cầu đã phê duyệt.

## Phase-2 / Sau MVP (theo BA, chưa implement)

| Item | Trạng thái | Ghi chú |
|---|---|---|
| Realtime chat (SignalR) | Deferred | BA đánh dấu later/optional; MVP dùng Task comments làm fallback |
| Direct file upload | Deferred | MVP dùng TaskLink (URL/reference) theo BA; upload trực tiếp cần storage provider + quyết định quota |
| Kanban drag-drop nâng cao | Deferred | Hiện có kanban 5 cột status; drag-drop + reorder tùy biến là phase-2 |
| Email/push notifications | Deferred | In-app notifications đã có; email cần SMTP provider config |
| Contribution points formula | Assumption | BA không định nghĩa công thức chính xác; hiện tính theo số task Completed. Cần PO xác nhận trọng số (priority, points field, deadline adherence) |

## Assumptions đã dùng (chờ xác nhận)

1. **Member chỉ tạo task giao cho chính mình** — Leader assign cho bất kỳ ai. (BA không ghi rõ Member có tạo task cho người khác không.)
2. **1 task = 1 assignee chính** — BA mô tả assignee đơn lẻ.
3. **Leader duyệt tất cả review + marketplace** — theo permission matrix BA.
4. **Stale task warning**: task `InProgress` không cập nhật > 3 ngày → báo Leader, dedup 1 lần/ngày/task. Ngưỡng 3 ngày là giả định; BA không định nghĩa "stale".
5. **Invite code**: 8 ký tự, lưu SHA256 hash, hỗ trợ expires/maxUses/usedCount.
6. **JWT secret:** từ M7, khóa dev chỉ nằm trong `appsettings.Development.json`; môi trường khác phải cấu hình `Jwt__Secret` (≥ 32 byte) qua environment variable/secret manager, nếu không API từ chối khởi động (xem M7 bên dưới).
7. **Timezone**: DB lưu UTC; hiển thị `vi-VN` locale trên frontend. `TimeZone=Asia/Ho_Chi_Minh` trong config dành cho format hiển thị server-side nếu cần sau.

## Vấn đề kỹ thuật đã biết

- `System.Security.Cryptography.Pkcs` đã được pin 9.0.21; quét `dotnet list package --vulnerable --include-transitive` (API + Tests) và `npm audit` sạch tại M7 (2026-11-23).
- Dự án chạy .NET SDK 11.0.100 (bản chính thức), target `net11.0`. Các gói EF Core/JwtBearer vẫn ở 10.0.13; nâng cùng nhịp khi có bản 11 ổn định.
- Thông báo nội bộ nhóm chỉ hiển thị/đánh dấu đã đọc khi người nhận còn là thành viên đang hoạt động của nhóm chưa lưu trữ. Ngoại lệ: thông báo MemberRemoved của chính người nhận vẫn hiển thị để biết quyền đã bị thu hồi. Đây là lựa chọn bảo thủ cho A1; không xóa lịch sử thông báo.

## Xác nhận sản phẩm khi khởi tạo PRODUCT.md — 01/11/2026

- Chủ sản phẩm chọn **demo và nghiệm thu đồ án trên máy local** làm mục đích sử dụng trước mắt; tiếp tục ưu tiên Visual Studio Run/F5 cho API và frontend. Chưa đặt mục tiêu vận hành trực tuyến cho đợt nghiệm thu này.
- **Điểm đóng góp chưa được chốt.** Dòng giả định cũ “hiện tính theo số task Completed” ở trên không phải công thức được phê duyệt; tỷ lệ hoàn thành và điểm đóng góp phải được phân biệt. Không nghiệm thu contribution trước khi có quy tắc và kiểm chứng riêng.
- **Cảnh báo nguy cơ dùng mặc định BA đã thống nhất:** còn ≤8 giờ và tiến độ <70%, hoặc task đang làm không cập nhật trong 24 giờ; phần cho Leader chỉnh ngưỡng nằm trong cài đặt nhóm. Giả định cũ 3 ngày ở trên ghi nhận cách làm trước đây, không phải tiêu chí nghiệm thu cuối; việc đồng bộ implementation thuộc A5.
- `PRODUCT.md` ghi lại mục tiêu, ràng buộc và quyết định sản phẩm; không xác nhận rằng A2 hay toàn bộ bản lõi đã hoàn thành.

## Phase 5 — Notifications

- **Khi nào tự đánh dấu đã đọc:** BA NOT-05/UI-09 yêu cầu trạng thái và thao tác
  đánh dấu, nhưng không quy định mở liên kết tài nguyên có tự đọc hay không.
  Giữ cách bảo thủ của API hiện có: chỉ POST đọc một mục/đọc tất cả mới cập nhật
  ReadAt; mở task/project/group không tự thay đổi. PO có thể xác nhận một luồng
  tự đọc riêng sau, không coi đó là hành vi đã được phê duyệt.
- **Lịch sử cũ hơn 100 mục:** BA 11.3 nêu pagination cho list API; endpoint
  Notifications hiện chỉ có unreadOnly/take, không có cursor/page. Phase 5 công
  khai giới hạn 100 mục theo bộ lọc, không dựng nút tải thêm hoặc giả phân trang.
  Đây là phần backend còn thiếu so với định hướng BA, không phải lịch sử đã được
  tải đầy đủ. Cần chốt hợp đồng pagination trước khi mở rộng API.
- **Phạm vi đọc tất cả:** endpoint hiện áp dụng toàn bộ thông báo chưa đọc còn
  hiển thị theo quyền của người nhận, không chỉ 100 hàng đang xem. Dialog nói rõ
  phạm vi này và việc chưa có API hoàn tác/đánh dấu chưa đọc.

## Phase 6 - Account Capability Boundaries

- User confirmed separate Profile/Settings pages using the current API.
  AUTH-05 email changes require a verification policy/API that does not exist;
  email remains read-only. Avatar is a URL, not an upload: format/length are
  validated but remote image MIME/byte-size limits are not supported.
- NOT-04 reminder preferences have a database entity but no public settings
  contract. Do not present nonfunctional toggles or imply the requirement was
  completed. Timezone, active-device management and OAuth controls are likewise
  not invented as editable settings.
- Password mismatch is business validation (400), not failed JWT authentication
  (401). Successful authenticated change must invalidate outstanding reset links
  as well as existing sessions. These are correctness/security fixes, not a new
  password-strength policy.
- User approved compatible security patch updates through official NuGet sources.
  Pkcs 9.0.21 is the chosen same-major patch; final audit/build results must be
  recorded before the older NU1902/NU1903 item can be considered resolved.
  Resolved 2026-11-09: `dotnet list package --vulnerable` reports none (PR #6).

## Stage 1 Discovery — chờ quyết định (2026-11-09)

Báo cáo: `docs/discovery/stage-1-discovery-report.md`. Chủ sản phẩm đã bỏ giới hạn
"UI cơ bản" và yêu cầu hoàn thiện toàn bộ tính năng.

**Đã trả lời 09/11/2026:** chấp nhận toàn bộ cột "Đề xuất" cho Q1–Q11. Q8 chọn A
(nâng cấp sáng/xanh) và bổ sung **màu tím** làm màu nhấn; được dùng thêm yếu tố bản
sắc mới (B) nếu làm app đẹp hơn. Các ràng buộc bản demo cơ bản trong `PRODUCT.md`
được gỡ bỏ. Roadmap: `docs/discovery/stage-2-roadmap.md`.

| # | Câu hỏi | Loại | Đề xuất |
|---|---|---|---|
| Q1 | Mục tiêu phát hành: demo local, sẵn sàng triển khai, hay triển khai online | BLOCKING | Demo local + cấu hình sẵn sàng triển khai, chưa deploy |
| Q2 | Tính năng "Later" làm ngay: kanban kéo-thả, realtime + thảo luận dự án, upload file, timeline, email thật, Google login | BLOCKING | Kéo-thả, realtime SignalR + thảo luận dự án, upload file lưu local; hoãn email thật/Google |
| Q3 | Transfer/Swap: người nhận có phải đồng ý trước khi Leader duyệt; có Claim (chuyển mở) | BLOCKING | Người nhận đồng ý → Leader duyệt; có Claim |
| Q4 | Need Help: người hỗ trợ có quyền gì | BLOCKING | Được ghi tên trên task, xem chi tiết và bình luận; không đổi trạng thái |
| Q5 | Thành viên rời/bị xóa còn task đang mở | BLOCKING | Task về "Chưa giao" + báo Leader; dialog nêu số task |
| Q6 | Leader tự duyệt task/yêu cầu của chính mình | BLOCKING | Cần Leader khác nếu nhóm có; nhóm một Leader thì cho phép và ghi log |
| Q7 | Điểm đóng góp | BLOCKING cho tính năng điểm | Leader đặt points; cộng khi Approved; Need Help không chia điểm |
| Q8 | Hướng thị giác và quyền thay đổi điều hướng chính | BLOCKING cho redesign | Nâng cấp light/blue thành design system premium; được thêm mục điều hướng; chưa dark mode |
| Q9 | Member tự tạo task | NON-BLOCKING | Giữ Leader tạo task; assignee tạo subtask cho task của mình |
| Q10 | Cho phép nhiều thiết bị đăng nhập đồng thời | NON-BLOCKING | Có (bảng refresh session riêng) |
| Q11 | Cách giao nhận Git theo milestone | NON-BLOCKING | Commit local theo milestone trên nhánh feature; không push/merge khi chưa duyệt |

Giả định mặc định nếu NON-BLOCKING chưa được trả lời: dùng cột "Đề xuất".

## Stage 2 — M2 quyết định nghiệp vụ (giả định đã ghi nhận, chờ chủ sản phẩm xác nhận)

- **Đơn vị thống kê (BR-11):** tiến độ dự án, trạng thái dự án, tiến độ nhóm/thành viên và điểm đóng góp tính theo *công việc cấp trên cùng* (task không có `ParentTaskId`). Công việc con là phần chia nhỏ của một công việc chính, không được đếm như một đơn vị KPI riêng. Danh sách việc cá nhân (Việc của tôi, Dashboard, Lịch) vẫn hiển thị mọi mục được giao cho người dùng, kể cả công việc con, và số đếm ở các màn hình cá nhân đếm đúng các mục trong danh sách đó. Lý do: người phụ trách được tự tạo công việc con (Q9); nếu đếm theo task lá, việc chia nhỏ sẽ làm thay đổi KPI dự án và cho phép dự án "Hoàn thành" trong khi công việc chính chưa được duyệt.
- **Luồng công việc con:** Cần làm ↔ Đang làm → Hoàn thành, và mở lại Hoàn thành → Đang làm khi công việc chính chưa Chờ duyệt/Hoàn thành. Không có Chờ duyệt/Cần chỉnh sửa và không có bản ghi duyệt; người thao tác: người phụ trách công việc con, người phụ trách công việc chính hoặc Trưởng nhóm. Công việc con không có % tiến độ và không có điểm.
- **Nộp công việc chính:** chỉ nộp được khi mọi công việc con đã Hoàn thành; khi nộp có thể kèm ghi chú bàn giao (≤ 2000 ký tự), lưu theo phiên bản nộp.
- **Tiến độ % (TASK-04):** chỉ người phụ trách cập nhật, chỉ khi công việc chính đang ở "Đang làm"; giá trị 0–100; đặt 100% không tự hoàn thành — vẫn phải nộp và được duyệt; khi được duyệt hệ thống đặt 100%.
- **Tạo/sửa công việc con:** Trưởng nhóm tạo cho mọi công việc chính; người phụ trách công việc chính tạo công việc con cho chính mình (giao cho bản thân hoặc để trống). Người tạo là người phụ trách công việc chính được sửa/xóa công việc con mình tạo khi chưa hoàn thành. Không thêm công việc con vào công việc đang Chờ duyệt hoặc đã Hoàn thành.
- **Điểm (TASK-07, Q7):** chỉ Trưởng nhóm đặt, chỉ cho công việc chính, số nguyên dương.
- **Xóa công việc:** không xóa công việc đã Hoàn thành, công việc còn công việc con, hoặc công việc đã có yêu cầu Marketplace (giữ lịch sử); liên kết tài liệu của công việc bị xóa cùng.
- **Tài liệu dự án (FILE-01/03):** mọi thành viên đang hoạt động xem và thêm liên kết cấp dự án; người tạo hoặc Trưởng nhóm xóa, có xác nhận và ghi log.

## Stage 2 — M3 quyết định nghiệp vụ (giả định đã ghi nhận, chờ chủ sản phẩm xác nhận)
- **Ngưỡng cảnh báo theo nhóm:** mặc định có nguy cơ trễ khi còn ≤ 8 giờ đến hạn và tiến độ < 70%; đình trệ khi công việc đang làm không có cập nhật ≥ 24 giờ. Trưởng nhóm chỉnh trong Cài đặt nhóm (1–168 giờ; 1–100%; 1–720 giờ). Cảnh báo chỉ áp dụng cho công việc chính có người phụ trách.
- **Người nhận cảnh báo (RISK-04):** người phụ trách và mọi Trưởng nhóm đang hoạt động của nhóm nhận cảnh báo quá hạn, có nguy cơ trễ và đình trệ. Mỗi loại cảnh báo gửi một lần cho mỗi hạn (quá hạn, nguy cơ) hoặc mỗi lần ngừng cập nhật (đình trệ); đổi hạn hoặc có cập nhật mới thì có thể cảnh báo lại.
- **Nhắc việc thủ công (PROG-04):** Trưởng nhóm nhắc người phụ trách một công việc chưa hoàn thành, tối đa một lần mỗi giờ cho mỗi công việc.
- **Điểm đóng góp:** ghi nhận vào sổ điểm (không ghi đè) tại thời điểm duyệt; chuyển giao sau đó không làm mất điểm đã ghi nhận. Công việc đã hoàn thành trước khi có sổ điểm được ghi bù một lần khi cập nhật cơ sở dữ liệu. Thành viên chỉ xem điểm và tỷ lệ của mình cùng tổng điểm dự án; Trưởng nhóm xem toàn bộ.

## Stage 2 — M4 quyết định nghiệp vụ (giả định đã ghi nhận, chờ chủ sản phẩm xác nhận)
1. **Marketplace 3 bên (Q3 = A):** Chuyển giao/Hoán đổi có người nhận → "Chờ người nhận" → người nhận Đồng ý → "Chờ duyệt" → Trưởng nhóm Duyệt hoặc Từ chối. Người nhận Từ chối → "Người nhận từ chối" (kết thúc).
2. **Nhận việc (Claim):** Chuyển giao không chọn người nhận và Cần hỗ trợ không chọn người hỗ trợ được đăng ở trạng thái "Đang mở"; mọi thành viên đang hoạt động (trừ người tạo) có thể Nhận; nhận đồng nghĩa với đồng ý → "Chờ duyệt". Hoán đổi luôn phải chọn thành viên và công việc của họ.
3. **Cần hỗ trợ (Q4 = A):** bắt buộc mô tả phần cần hỗ trợ. Khi được duyệt, người hỗ trợ được ghi trên công việc, được xem chi tiết và bình luận; không đổi trạng thái, không thêm tài liệu, không nhận điểm. Trưởng nhóm hoặc người phụ trách có thể kết thúc hỗ trợ; người hỗ trợ rời/bị xóa khỏi nhóm thì tự kết thúc.
4. Trưởng nhóm có thể Từ chối ở mọi giai đoạn chưa kết thúc, chỉ Duyệt khi "Chờ duyệt". Trưởng nhóm là người tạo hoặc người nhận của yêu cầu thì không được duyệt/từ chối nếu nhóm có Trưởng nhóm khác (mở rộng quy tắc tự duyệt Q6); nhóm một Trưởng nhóm thì được, log ghi "(tự duyệt)".
5. Yêu cầu đang hoạt động (Đang mở / Chờ người nhận / Chờ duyệt) tự hủy khi: công việc được giao lại hoặc hoàn thành; dự án hoặc nhóm bị lưu trữ; người tạo hoặc người nhận rời nhóm; một yêu cầu khác của cùng công việc được duyệt. Mỗi công việc chỉ có một yêu cầu đang hoạt động cho mỗi loại. Chỉ tạo yêu cầu cho công việc chính (không cho công việc con).
6. Workload (số công việc đang mở của người tạo và người nhận) chỉ hiển thị cho Trưởng nhóm (BR-05, BR-22).
7. Yêu cầu "Đang mở" được thông báo cho mọi thành viên đang hoạt động trừ người tạo; Trưởng nhóm được thông báo khi yêu cầu chuyển sang "Chờ duyệt".
8. **Lưu trữ nhóm:** chỉ Trưởng nhóm, phải gõ đúng tên nhóm. Nhóm lưu trữ bị đóng băng: ẩn khỏi danh sách, không truy cập được nội dung cho đến khi một Trưởng nhóm khôi phục; mã mời không dùng được; yêu cầu Marketplace đang hoạt động bị hủy; thành viên được thông báo. Mục "Nhóm đã lưu trữ" hiện tên, thời điểm và người lưu trữ. (Chế độ xem chỉ đọc để giai đoạn sau.)
9. **Dự án lưu trữ:** thành viên thấy danh sách dự án đã lưu trữ (tên, thời điểm, số công việc); chỉ Trưởng nhóm khôi phục; nội dung không truy cập được khi đang lưu trữ.
10. **Mã mời:** nhãn tùy chọn (≤ 100 ký tự), hạn dùng từ 1 giờ đến 90 ngày hoặc không hạn, số lượt 1–500 hoặc không giới hạn. Mã chỉ hiển thị một lần khi tạo (chỉ lưu hash); bản rõ của các mã cũ được xóa khỏi cơ sở dữ liệu khi đã có hash. Trạng thái: Đang hoạt động / Hết hạn / Hết lượt / Đã thu hồi.
11. **Nhật ký hoạt động:** chỉ Trưởng nhóm; lọc theo người thực hiện, dự án, loại (Công việc, Trạng thái & duyệt, Thành viên, Dự án, Marketplace, Nhóm) và khoảng ngày theo giờ Việt Nam; mới nhất trước; tải thêm 30 dòng mỗi lần.
12. **Nhắc việc:** server trả `remindedRecently` khi Trưởng nhóm đã nhắc công việc trong khung giờ đồng hồ hiện tại (quy tắc tối đa 1 lần/giờ của M3), để giao diện hiện "Đã nhắc" cả sau khi tải lại trang.

## Stage 2 — M5 quyết định (giả định đã ghi nhận, chờ chủ sản phẩm xác nhận)
1. **Realtime:** SignalR một hub `/hubs/realtime`, xác thực bằng JWT. Máy chủ chỉ đẩy (a) thông báo mới tới đúng người nhận và (b) tín hiệu "đã thay đổi" chỉ chứa mã định danh tới thành viên đang hoạt động của nhóm liên quan; trình duyệt tự tải lại dữ liệu qua API có phân quyền. Mất kết nối thì quay về làm mới định kỳ 60 giây. Chạy một máy chủ; mở rộng nhiều máy chủ cần backplane (Redis) ở giai đoạn triển khai.
2. **Nhiều phiên đăng nhập:** mỗi lần đăng nhập tạo một phiên riêng (tối đa 10 phiên hoạt động; vượt thì phiên lâu không dùng nhất bị đăng xuất). Đăng xuất chỉ kết thúc phiên hiện tại; người dùng xem danh sách phiên (trình duyệt, hệ điều hành, IP rút gọn, thời điểm) và đăng xuất từng phiên hoặc mọi phiên khác. Đổi hoặc đặt lại mật khẩu kết thúc mọi phiên. Phiên hết hạn sau 7 ngày không dùng và tối đa 30 ngày kể từ khi đăng nhập. IP chỉ lưu dạng rút gọn (IPv4 /24, IPv6 /48). Các phiên cũ trước M5 phải đăng nhập lại một lần.
3. **Tùy chọn nhắc hạn (NOT-04):** mỗi người bật/tắt 4 mốc: 3 ngày, 1 ngày, 3 giờ trước hạn và khi quá hạn; mặc định bật tất cả. Áp dụng cho thông báo trong ứng dụng; email/push để giai đoạn sau. Cảnh báo rủi ro/đình trệ và nhắc của Trưởng nhóm không tắt được.
4. **Phân trang thông báo:** 20 thông báo mỗi lần, mới nhất trước, con trỏ ổn định (không lặp, không bỏ sót khi có thông báo mới hoặc khi đánh dấu đã đọc).
5. **Đổi email (AUTH-05):** cần mật khẩu hiện tại; thư xác minh gửi tới email mới, liên kết hiệu lực 60 phút, dùng một lần; chỉ đổi sau khi xác minh; email cũ nhận thư báo đã đổi; yêu cầu mới thay thế yêu cầu cũ; các phiên đăng nhập giữ nguyên.
6. **Hộp thư dev:** ở môi trường Development, mọi thư (đặt lại mật khẩu, xác minh email, thông báo đổi email) được ghi vào hộp thư cục bộ và xem tại `/dev/mailbox`; môi trường khác không có hộp thư này và các tính năng cần email báo "chưa được cấu hình" cho tới khi cấu hình nhà cung cấp email.

## Stage 2 — M6 quyết định (giả định đã ghi nhận, chờ chủ sản phẩm xác nhận)

1. **Lưu trữ tệp:** tệp lưu trong thư mục cục bộ ngoài webroot (`Storage:RootPath`, mặc định `%LOCALAPPDATA%\GMind\Files`) với tên lưu trữ ngẫu nhiên; tên gốc chỉ dùng để hiển thị. Thư mục này phải được sao lưu cùng database. Chưa có quét virus: mọi tệp tải về dưới dạng đính kèm với `nosniff`. Có thể thay bằng storage riêng qua `IFileStorage` khi triển khai.
2. **Giới hạn:** 10 MB mỗi tệp, tối đa 5 tệp mỗi tin nhắn, 1 GB mỗi nhóm (tính mọi tệp chưa xóa, gồm đính kèm thảo luận); ảnh đại diện 2 MB. Định dạng cho phép: pdf, doc, docx, xls, xlsx, ppt, pptx, txt, md, csv, png, jpg, jpeg, gif, webp, zip. Kiểm tra cả đuôi tệp và chữ ký nội dung; không nhận svg, html, exe, script. Hai lượt tải lên đồng thời có thể vượt hạn mức nhóm một chút.
3. **Quyền tệp:** tệp dự án — mọi thành viên đang hoạt động xem, tải về, tải lên. Tệp công việc — xem/tải về theo quyền xem chi tiết công việc (kể cả người hỗ trợ); tải lên theo quyền thêm tài liệu (Trưởng nhóm, người phụ trách, người phụ trách công việc cha). Xóa: người tải lên hoặc Trưởng nhóm, có xác nhận, ghi nhật ký. Xóa công việc thì xóa luôn tệp của công việc. Dự án/nhóm đã lưu trữ: tệp giữ nguyên nhưng không truy cập được cho tới khi khôi phục.
4. **Thảo luận dự án:** mọi thành viên đang hoạt động của nhóm đọc và gửi. Trả lời chỉ trỏ tới tin trong cùng dự án. @nhắc tên chỉ chọn được thành viên đang hoạt động; người được nhắc và người được trả lời nhận thông báo; không thông báo cho mọi tin nhắn. Tác giả sửa được tin của mình (hiện "đã sửa"); tác giả hoặc Trưởng nhóm xóa (hiện "Tin nhắn đã bị xóa", nội dung và tệp đính kèm bị xóa). Trưởng nhóm xóa tin của người khác được ghi nhật ký. Tối đa 4000 ký tự mỗi tin, 30 tin mỗi phút mỗi người.
5. **Ảnh đại diện:** tải ảnh png/jpeg/webp; trình duyệt cắt vuông 256 px trước khi gửi (loại bỏ metadata như vị trí GPS). Ảnh được phục vụ qua địa chỉ khó đoán không cần đăng nhập (để thẻ ảnh hiển thị được ở mọi nơi), lưu cache lâu và đổi địa chỉ mỗi lần thay ảnh. Bỏ ô nhập URL ảnh; ảnh URL cũ vẫn hiển thị tới khi người dùng thay hoặc xóa.
6. **Realtime thảo luận:** sự kiện riêng `discussion` chỉ mang mã dự án, gửi tới thành viên đang hoạt động của nhóm; trình duyệt tự tải lại qua API có phân quyền.

## Stage 2 — M7 quyết định (giả định đã ghi nhận, chờ chủ sản phẩm xác nhận)

1. **Cấu hình khi khởi động:** API kiểm tra cấu hình trước khi chạy và dừng với thông báo nêu rõ khóa cấu hình (không in giá trị) khi `Jwt:Secret` thiếu hoặc < 32 byte, thiếu `Jwt:Issuer`/`Jwt:Audience`, thời hạn token không phải số nguyên dương, hoặc — ngoài Development — khóa vẫn là khóa dev (`Change_Me`). Khóa dev chỉ còn trong `appsettings.Development.json`, nên `dotnet run --launch-profile http`, F5 và `dotnet ef` (mặc định Development) vẫn chạy không cần cấu hình thêm.
2. **Header bảo mật:** mọi phản hồi API có `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` và `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'` (bỏ CSP riêng cho `/swagger` để Swagger UI chạy ở Development). Ngoài Development bật HSTS và chuyển hướng HTTPS. Chưa xử lý reverse proxy (`X-Forwarded-For`): sau proxy, giới hạn tần suất theo IP sẽ tính theo IP của proxy — cần cấu hình Forwarded Headers khi triển khai.
3. **Kiểm tra phiên khi chuyển trang:** trước M7, mỗi lần đổi đường dẫn đều chặn toàn màn hình cho tới khi `/api/me` trả về. Từ M7 chỉ lần kiểm tra đầu tiên của mỗi phiên chặn hiển thị; các lần chuyển trang sau hiển thị ngay và vẫn gọi `/api/me` ở nền. Lý do: máy chủ đã xác thực phiên (`sid`) ở mọi request, 401 → làm mới token → đăng xuất do lớp API xử lý, và thu hồi phiên được đẩy qua SignalR; việc chặn từng lần chuyển trang không thêm quyền kiểm soát nào mà gây nháy màn hình.
4. **Tách bundle theo trang:** các trang sau đăng nhập tải theo route (lazy) và được tải trước khi trình duyệt rảnh sau lần xác thực đầu; trang đăng nhập/đăng ký/khôi phục tải ngay. Nếu tải một phần của ứng dụng thất bại (ví dụ vừa triển khai bản mới), trang hiện thông báo và nút "Tải lại trang" thay vì màn hình trắng.
5. **Vùng chạm trên di động:** dưới 640 px mọi điều khiển đứng riêng (nút, liên kết đứng riêng, tab, mục menu, công tắc) có vùng chạm ≥ 44 px; trên desktop giữ cỡ `sm` 36 px theo `DESIGN.md`. Ngoại lệ: liên kết nằm trong câu, skip link khi chưa focus (khi focus ≥ 44 px), ô chọn/radio có nhãn ≥ 44 px bao quanh.
6. **Lịch và Thông báo:** bỏ nút "Làm mới"; dữ liệu cập nhật qua realtime, khi quay lại tab và làm mới định kỳ khi mất kết nối. Lịch dùng chung bộ nhớ đệm với Việc của tôi. Lỗi 401/403/404 khi làm mới thì ẩn dữ liệu cũ (như khi mất quyền); lỗi khác giữ dữ liệu cũ kèm cảnh báo và nút "Thử lại".
7. **Kiểm thử E2E:** Playwright nằm trong repo (`GMind-Frontend/e2e`), chạy với API + database local thật và trình duyệt Edge đã cài. Mỗi lần chạy tạo tài khoản và nhóm thử nghiệm mới (email `e2e-…@e2e.gmind.test`) trong database dev; dữ liệu này không tự xóa (không thực hiện thao tác xóa dữ liệu). Không chạy E2E trên database có dữ liệu thật.
