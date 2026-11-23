import { dayKey, timestamp } from './presentation';

const VN_TZ = 'Asia/Ho_Chi_Minh';
const HOUR = 3_600_000;
const DAY = 86_400_000;

export type DeadlineKind = 'none' | 'overdue' | 'today' | 'tomorrow' | 'soon' | 'later';
export interface DeadlineState { kind: DeadlineKind; label: string }

const timeFmt = new Intl.DateTimeFormat('vi-VN', { timeZone: VN_TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const weekdayFmt = new Intl.DateTimeFormat('vi-VN', { timeZone: VN_TZ, weekday: 'long' });
const dateFmt = new Intl.DateTimeFormat('vi-VN', { timeZone: VN_TZ, day: '2-digit', month: '2-digit', year: 'numeric' });

const vnDay = (d: Date) => dayKey(d.toISOString());
const dayIndex = (key: string) => Date.parse(`${key}T00:00:00Z`) / DAY;

/**
 * Deadline semantics in the VN timezone. A deadline is 'overdue' only when
 * strictly before `now`; 'soon' covers VN dates within the next 7 days.
 */
export function deadlineState(deadlineAt?: string | null, status?: string, now: Date = new Date()): DeadlineState {
  if (status === 'Completed') return { kind: 'none', label: '' };
  if (!deadlineAt) return { kind: 'none', label: 'Chưa đặt hạn' };
  const deadline = timestamp(deadlineAt);
  if (Number.isNaN(deadline.getTime())) return { kind: 'none', label: 'Chưa đặt hạn' };

  const diff = deadline.getTime() - now.getTime();
  if (diff < 0) {
    const ago = -diff;
    const label = ago < HOUR
      ? `Quá hạn ${Math.max(1, Math.floor(ago / 60_000))} phút`
      : ago < DAY
        ? `Quá hạn ${Math.floor(ago / HOUR)} giờ`
        : `Quá hạn ${Math.floor(ago / DAY)} ngày`;
    return { kind: 'overdue', label };
  }

  const dayDiff = dayIndex(vnDay(deadline)) - dayIndex(vnDay(now));
  const time = timeFmt.format(deadline);
  if (dayDiff === 0) {
    const label = diff < HOUR
      ? `Còn ${Math.max(1, Math.ceil(diff / 60_000))} phút`
      : diff < 6 * HOUR
        ? `Còn ${Math.floor(diff / HOUR)} giờ`
        : `Hôm nay ${time}`;
    return { kind: 'today', label };
  }
  if (dayDiff === 1) return { kind: 'tomorrow', label: `Ngày mai ${time}` };
  if (dayDiff <= 7) return { kind: 'soon', label: `${weekdayFmt.format(deadline)} ${time}` };
  return { kind: 'later', label: dateFmt.format(deadline) };
}
