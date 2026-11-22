export const STATUS_LABEL: Record<string, string> = {
  ToDo: 'Cần làm', InProgress: 'Đang làm', Submitted: 'Chờ duyệt', ChangesRequested: 'Cần chỉnh sửa', Completed: 'Hoàn thành',
};
export const PRIORITY_LABEL: Record<string, string> = {
  Low: 'Thấp', Medium: 'Trung bình', High: 'Cao', Urgent: 'Khẩn cấp',
};
export function timestamp(value: string): Date {
  return new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value}Z`);
}
export function dayKey(value: string): string {
  const date = timestamp(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function formatDate(value?: string | null): string {
  if (!value) return 'Chưa đặt hạn';
  const d = timestamp(value);
  return Number.isNaN(d.getTime()) ? 'Chưa đặt hạn'
    : new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}
export function formatDateTime(value?: string | null): string {
  if (!value) return 'Chưa đặt hạn';
  const d = timestamp(value);
  return Number.isNaN(d.getTime()) ? 'Chưa đặt hạn'
    : new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);
}

/** "vừa xong" / "5 phút trước" / "2 giờ trước" / "3 ngày trước" for a UTC ISO timestamp. */
export function formatRelative(value?: string | null, now: number = Date.now()): string {
  if (!value) return '';
  const t = timestamp(value).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Math.max(0, now - t);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.floor(hours / 24)} ngày trước`;
}

/** vi-VN byte size: "512 B", "12 KB", "1,2 MB" (1 decimal for MB, none below). */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0 B';
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 * 1024 * 1024) {
    const mb = Math.round((n / (1024 * 1024)) * 10) / 10;
    return `${mb.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} MB`;
  }
  const gb = Math.round((n / (1024 * 1024 * 1024)) * 10) / 10;
  return `${gb.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} GB`;
}

/** Header date like "Thứ Sáu, 20 tháng 11, 2026" — built from parts so browsers that capitalize "Tháng" don't leak it. */
export function formatHeaderDate(d: Date): string {
  const parts = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric',
  }).formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  return `${get('weekday')}, ${get('day')} tháng ${get('month')}, ${get('year')}`;
}
