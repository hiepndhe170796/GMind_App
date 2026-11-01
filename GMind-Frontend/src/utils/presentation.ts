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
