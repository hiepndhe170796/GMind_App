import type { LeaderQueueItem, LeaderQueueKind } from '../../services/dashboard';
import { deadlineState } from '../../utils/task-time';
import { timestamp } from '../../utils/presentation';

export const REQUEST_TYPE_LABEL: Record<string, string> = {
  NeedHelp: 'Cần hỗ trợ', Transfer: 'Chuyển giao', Swap: 'Đổi task',
};

export const KIND_META: Record<LeaderQueueKind, { label: string; variant: 'accent' | 'danger' | 'warning' | 'neutral' }> = {
  Review: { label: 'Chờ duyệt', variant: 'accent' },
  Marketplace: { label: 'Marketplace', variant: 'accent' },
  Overdue: { label: 'Quá hạn', variant: 'danger' },
  AtRisk: { label: 'Có nguy cơ', variant: 'warning' },
  Stale: { label: 'Đình trệ', variant: 'warning' },
  Unassigned: { label: 'Chưa giao', variant: 'neutral' },
};

const HOUR = 3_600_000;
const DAY = 86_400_000;

const ago = (ms: number) =>
  ms < HOUR ? `${Math.max(1, Math.floor(ms / 60_000))} phút`
    : ms < DAY ? `${Math.floor(ms / HOUR)} giờ`
    : `${Math.floor(ms / DAY)} ngày`;

const until = (ms: number) =>
  ms < HOUR ? `${Math.max(1, Math.ceil(ms / 60_000))} phút`
    : ms < DAY ? `${Math.ceil(ms / HOUR)} giờ`
    : `${Math.ceil(ms / DAY)} ngày`;

export type RiskReasonKind = 'Overdue' | 'AtRisk' | 'Stale';

/** Shared reason for a risky task, e.g. "Quá hạn 14 giờ" — used by the leader queue and the member page. */
export function riskReason(
  kind: RiskReasonKind,
  item: { deadlineAt?: string | null; progressPercent?: number | null; updatedAt?: string | null },
  now: Date = new Date(),
): string {
  const dl = item.deadlineAt ? timestamp(item.deadlineAt) : null;
  switch (kind) {
    case 'Overdue':
      return dl ? `Quá hạn ${ago(now.getTime() - dl.getTime())}` : 'Đã quá hạn';
    case 'AtRisk': {
      const pct = item.progressPercent ?? 0;
      return dl ? `Còn ${until(dl.getTime() - now.getTime())} · tiến độ ${pct}%` : `Tiến độ ${pct}%`;
    }
    case 'Stale': {
      const up = item.updatedAt ? timestamp(item.updatedAt) : null;
      return up ? `Chưa cập nhật ${ago(now.getTime() - up.getTime())}` : 'Chưa có cập nhật gần đây';
    }
  }
}

/** Short reason line under a queue row, e.g. "Còn 5 giờ · tiến độ 40%". */
export function queueReason(item: LeaderQueueItem, now: Date = new Date()): string {
  const dl = item.deadlineAt ? timestamp(item.deadlineAt) : null;
  switch (item.kind) {
    case 'Review':
      return item.assigneeName ? `Nộp bởi ${item.assigneeName}` : 'Chờ bạn xem xét';
    case 'Marketplace': {
      const type = REQUEST_TYPE_LABEL[item.requestType ?? ''] ?? item.requestType ?? 'Yêu cầu';
      return item.requestedByName ? `${type} · ${item.requestedByName}` : type;
    }
    case 'Overdue':
    case 'AtRisk':
    case 'Stale':
      return riskReason(item.kind, item, now);
    case 'Unassigned': {
      const state = dl ? deadlineState(item.deadlineAt, 'ToDo', now) : null;
      return state && state.kind !== 'none' && state.label ? `Hạn: ${state.label}` : 'Chưa đặt hạn';
    }
  }
}

/** Action link per queue row kind. */
export function queueAction(item: LeaderQueueItem): { href: string; label: string } | null {
  switch (item.kind) {
    case 'Review':
      return item.taskId ? { href: `/tasks/${item.taskId}`, label: 'Xem và duyệt' } : null;
    case 'Marketplace':
      return { href: `/groups/${item.groupId}/marketplace`, label: 'Mở yêu cầu' };
    case 'Unassigned':
      return item.taskId ? { href: `/tasks/${item.taskId}`, label: 'Giao việc' } : null;
    default:
      return item.taskId ? { href: `/tasks/${item.taskId}`, label: 'Xem công việc' } : null;
  }
}
