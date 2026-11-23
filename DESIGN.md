---
name: GMind
description: Không gian làm việc nhóm cho sinh viên — sáng, rõ ràng, xanh tin cậy với tím cho khoảnh khắc cộng tác.
colors:
  blue-50: "#eef4ff"
  blue-100: "#dbe7ff"
  blue-200: "#bdd3ff"
  blue-300: "#8fb4fb"
  blue-400: "#5d8ef4"
  blue-500: "#3a6fe8"
  blue-600: "#2b57cf"
  blue-700: "#2445a6"
  blue-800: "#213b84"
  blue-900: "#1f3468"
  blue-950: "#141f3f"
  violet-50: "#f6f3ff"
  violet-100: "#ede7ff"
  violet-200: "#ddd2ff"
  violet-300: "#c2b0fd"
  violet-400: "#a387f8"
  violet-500: "#8a62f2"
  violet-600: "#7346e0"
  violet-700: "#5f36bf"
  violet-800: "#4d2f99"
  violet-900: "#3f297a"
  canvas: "#f5f7fb"
  surface: "#ffffff"
  surface-subtle: "#f0f3f9"
  line: "#e3e8f1"
  line-strong: "#cdd5e2"
  ink: "#121a2c"
  ink-secondary: "#46526b"
  ink-muted: "#5f6b84"
  success-50: "#ecfbf2"
  success-100: "#d3f5e0"
  success-600: "#16a34a"
  success-700: "#15803d"
  warning-50: "#fff6e5"
  warning-100: "#feeccc"
  warning-600: "#d97706"
  warning-700: "#b45309"
  danger-50: "#fff1f0"
  danger-100: "#ffe0dd"
  danger-600: "#dc2626"
  danger-700: "#b42318"
typography:
  display:
    fontFamily: "Be Vietnam Pro, Segoe UI, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Be Vietnam Pro, Segoe UI, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.015em"
  section:
    fontFamily: "Be Vietnam Pro, Segoe UI, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.45
  body:
    fontFamily: "Be Vietnam Pro, Segoe UI, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.6
  small:
    fontFamily: "Be Vietnam Pro, Segoe UI, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.5
  caption:
    fontFamily: "Be Vietnam Pro, Segoe UI, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  xs: "6px"
  sm: "8px"
  md: "10px"
  lg: "14px"
  xl: "20px"
  full: "9999px"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  5: "20px"
  6: "24px"
  8: "32px"
  10: "40px"
  12: "48px"
components:
  button-primary:
    backgroundColor: "{colors.blue-600}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    height: "44px"
    padding: "0 16px"
  button-primary-hover:
    backgroundColor: "{colors.blue-700}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "44px"
    padding: "0 14px"
  button-accent:
    backgroundColor: "{colors.violet-600}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    height: "44px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "44px"
    padding: "0 12px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "20px"
  status-pill:
    rounded: "{rounded.full}"
    typography: "{typography.caption}"
    padding: "2px 10px"
  nav-item-active:
    backgroundColor: "{colors.blue-50}"
    textColor: "{colors.blue-700}"
    rounded: "{rounded.md}"
---

# Design System: GMind

## Overview

GMind là nơi một nhóm sinh viên biết **hôm nay ai làm gì, việc nào đang chờ ai**. Giao diện phục vụ thao tác (Operate): đọc nhanh, quyết định nhanh, ít phải đoán. Nền sáng như một bàn học sạch; xanh là màu của hành động và điều hướng; **tím là màu của sự trao tay giữa người với người** — chờ duyệt, nhờ hỗ trợ, chuyển giao, đóng góp. Hai màu không trang trí ngẫu nhiên: mỗi lần tím xuất hiện, người dùng hiểu đang có một người khác liên quan.

Kế thừa từ bản trước: nền sáng, xanh nhẹ, ô logo chữ "G", sidebar trái, toàn bộ copy tiếng Việt và thuật ngữ Leader/Member. Nâng cấp: font tiếng Việt chuyên dụng, thang chữ rõ bậc, bảng màu hai sắc có vai trò, hệ component thống nhất thay cho bảy stylesheet riêng, minh họa empty state, lớp phản hồi (toast) và một khoảnh khắc chuyển động khi việc được duyệt.

Chưa làm dark mode. Nền sáng được chọn vì bối cảnh dùng: lớp học, thư viện, ban ngày, màn hình laptop/điện thoại sinh viên.

## Colors

### Primary — Blue
Hành động chính, liên kết, focus, mục điều hướng đang chọn, trạng thái "Đang làm". `blue-600` là màu nút chính (tương phản chữ trắng ≥ 4.5:1); `blue-700` hover; `blue-50/100` nền chọn.

### Secondary — Violet
Màu thương hiệu thứ hai và ngữ nghĩa cộng tác: trạng thái "Chờ duyệt", Marketplace (Cần hỗ trợ, Chuyển giao, Hoán đổi, Nhận việc), người hỗ trợ, điểm đóng góp, nhắc tên. Dùng tiết chế: pill, icon, viền mảnh, nền `violet-50`. Nút `button-accent` chỉ cho hành động cộng tác chính (ví dụ "Tạo yêu cầu").

### Neutral
Xám ngả xanh. `canvas` cho nền app, `surface` cho vùng nội dung, `surface-subtle` cho nhóm phụ/hover, `line` cho phân tách, `line-strong` cho viền input. Chữ: `ink` (chính), `ink-secondary` (mô tả), `ink-muted` (metadata, placeholder — vẫn ≥ 4.5:1 trên trắng).

### Semantic
Success (Hoàn thành, thành công), Warning (Cần chỉnh sửa, sắp đến hạn), Danger (Quá hạn, lỗi, xóa). Chữ dùng sắc 700 trên nền 50.

### Named Rules
- **Trạng thái task:** Cần làm = neutral; Đang làm = blue; Chờ duyệt = violet; Cần chỉnh sửa = warning; Hoàn thành = success; Quá hạn = danger (độc lập với trạng thái). Luôn kèm nhãn chữ.
- **Ưu tiên:** Thấp = neutral; Trung bình = blue nhạt; Cao = warning; Khẩn cấp = danger.
- **Không dùng gradient cho chữ.** Gradient xanh→tím chỉ có ở ô logo và panel thương hiệu trang xác thực.

## Typography

Be Vietnam Pro tự host (`@fontsource/be-vietnam-pro`, 400/500/600/700) — thiết kế cho dấu tiếng Việt, rõ ở cỡ nhỏ. Fallback Segoe UI.

### Hierarchy
- `display` 30px/700 — lời chào Dashboard, tiêu đề trang xác thực.
- `title` 24px/600 — tiêu đề trang.
- `section` 18px/600 — tiêu đề khối.
- `body` 15px/1.6 — nội dung, form.
- `small` 13px/500 — metadata, nhãn form, nút nhỏ.
- `caption` 12px/500 — pill, chú thích. Không nhỏ hơn 12px.

### Named Rules
- Số liệu, ngày giờ, đếm: `font-variant-numeric: tabular-nums`.
- Đoạn văn tối đa ~70ch; tiêu đề `text-wrap: balance`.
- Không đặt nhãn nhỏ (eyebrow/kicker) phía trên tiêu đề.

## Layout

- App shell: sidebar 264px cố định từ `lg`; dưới `lg` dùng header + ngăn điều hướng (`<dialog>`). Nội dung tối đa 1280px, lề 32px (desktop), 24px (tablet), 16px (mobile).
- Lưới 8px; khoảng cách trong nhóm 8–12px, giữa các khối 24–32px; khoảng trên tiêu đề lớn hơn khoảng dưới.
- Trang chi tiết: cột nội dung + cột phụ 320–360px từ `xl`; dưới đó cột phụ chuyển lên trên (thao tác trước) hoặc xuống dưới (thông tin) tùy trang.
- Mobile: thao tác chính của trang nằm trong vùng ngón cái khi hợp lý (thanh hành động dính đáy cho TaskDetail); bộ lọc gom sau một nút "Bộ lọc (N)".

## Elevation & Depth

Phẳng là mặc định: vùng nội dung là `surface` + viền `line` 1px. Bóng chỉ dùng có lý do:
- `raised` — thẻ có thể kéo/nhấn (thẻ kanban, thẻ dự án khi hover): `0 1px 2px rgb(18 26 44 / .06), 0 4px 12px -4px rgb(18 26 44 / .08)`.
- `overlay` — dialog, menu, toast: `0 16px 40px -12px rgb(18 26 44 / .22), 0 2px 6px rgb(18 26 44 / .06)`.
Không có bóng màu, không bóng lệch cứng, không glass trang trí. Không lồng card trong card: nhóm con dùng `surface-subtle` hoặc đường phân tách.

## Shapes

Bo góc vừa phải, nhất quán: input/nút `md` 10px, card `lg` 14px, dialog/panel lớn `xl` 20px, pill/avatar `full`. Icon nét 1.5px (bộ Heroicons outline hiện có trong `Icon.tsx`), không emoji thay icon.

## Components

### Buttons
Primary (blue-600), Secondary (trắng, viền `line-strong`), Ghost (chữ blue-700, nền hover blue-50), Accent (violet-600, chỉ hành động cộng tác), Danger (chữ danger-700, viền nhạt; xác nhận bằng dialog). Cao 44px (sm 36px, vùng chạm mobile ≥ 44px). Trạng thái: hover, active (dịch 1px), focus ring 2px blue-500 offset 2px, disabled 50% + con trỏ mặc định, loading giữ nguyên độ rộng.

### Status pills
Nền sắc 50, chữ sắc 700, chấm tròn 6px cùng sắc đứng trước nhãn. Dùng cho trạng thái task, ưu tiên, vai trò (Trưởng nhóm = violet, Thành viên = neutral), trạng thái yêu cầu.

### Cards / Containers
`surface`, viền `line`, `lg`, padding 20px (16px mobile). Tiêu đề khối `section` + hành động phụ bên phải. Không dùng hàng card cùng cỡ "icon + tiêu đề + chữ" làm cấu trúc trang.

### Inputs / Fields
Nhãn `small` 600 phía trên, hint/lỗi phía dưới (lỗi danger-700 kèm icon), viền `line-strong`, focus viền blue-500 + ring blue-100. Placeholder `ink-muted`. Select/date dùng cùng khung.

### Navigation
Sidebar trắng, logo "G" gradient xanh→tím + chữ GMind; mục đang chọn nền blue-50, chữ blue-700, icon blue-600; badge đếm dạng pill. Khu tài khoản cuối sidebar. Header trang: tiêu đề + hành động chính bên phải; breadcrumb chỉ ở trang chi tiết.

### Feedback
- Toast và thanh trạng thái dự án sẽ ship ở M2+.
- Toast góc dưới phải (mobile: trên thanh đáy), tự ẩn 5s, có nút đóng, `role=status`.
- Empty state: minh họa SVG nét mảnh hai màu (blue + violet), một câu giải thích, một hành động.
- Skeleton theo đúng hình nội dung.

### Signature — Thanh trạng thái dự án
Thanh ngang chia đoạn theo số task từng trạng thái (màu theo Named Rules), có chú thích số ở dưới; dùng ở thẻ dự án, ProjectDetail và Leader cockpit. Đây là dữ liệu thật, không phải trang trí.

### Signature — Khoảnh khắc "Đã duyệt"
Khi task chuyển sang Hoàn thành, pill trạng thái và dấu tích chạy một chuyển động ngắn (~600ms, ease-out, tôn trọng `prefers-reduced-motion`) kèm toast. Đây là chuyển động được "tác giả hóa" duy nhất; phần còn lại chỉ có chuyển trạng thái 150–200ms.

## Do's and Don'ts

### Do:
- Dùng tím khi có người thứ hai liên quan (duyệt, hỗ trợ, chuyển giao, đóng góp).
- Kèm nhãn chữ cho mọi màu trạng thái; tương phản chữ ≥ 4.5:1.
- Theme cả bề mặt trình duyệt: `::selection` violet-100, caret blue-600, thanh cuộn mảnh màu `line-strong`, focus ring thống nhất.
- Giữ dữ liệu thật trong mọi biểu đồ; trạng thái rỗng nói rõ vì sao rỗng và làm gì tiếp.

### Don't:
- Không eyebrow/kicker trên tiêu đề, không đánh số section trang trí.
- Không template "số lớn + nhãn nhỏ" làm phần đầu Dashboard; số liệu đi kèm danh sách hành động.
- Không gradient chữ, không viền trái màu dày, không bóng màu, không glass trang trí, không card lồng card.
- Không dùng font hệ thống làm giọng hiển thị; không chữ nhỏ hơn 12px.
- Không dùng modal cho việc không cần chặn ngữ cảnh.
