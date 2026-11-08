import api from './api';
import { timestamp, dayKey as vnDayKey } from '../utils/presentation';
import type { IconName } from '../components/ui/Icon';

export interface NotificationDto {
  id: string; type: string; title: string; body: string;
  relatedEntityType?: string | null; relatedEntityId?: string | null;
  isRead: boolean; createdAt: string; groupId?: string | null;
}

export const notificationsService = {
  async list(unreadOnly = false): Promise<NotificationDto[]> {
    return (await api.get('/api/notifications', { params: { unreadOnly, take: 100 } })).data.data;
  },
  async unreadCount(): Promise<number> {
    return (await api.get('/api/notifications/unread-count')).data.data.count;
  },
  async markRead(id: string) {
    return (await api.post(`/api/notifications/${id}/read`)).data;
  },
  async markAllRead(): Promise<number> {
    return (await api.post('/api/notifications/read-all')).data.data.count;
  },
};

// --- model helpers ---
const GUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const VN_DAY = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
const VN_TIME = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
const CIVIL = (d: string) => new Date(`${d}T00:00:00Z`).getTime();

export const vnToday = () => vnDayKey(new Date().toISOString());
export const dayLabel = (day: string, today: string): string => {
  if (!day) return 'Không rõ ngày';
  if (day === today) return 'Hôm nay';
  const diff = Math.round((CIVIL(today) - CIVIL(day)) / 86400000);
  if (diff === 1) return 'Hôm qua';
  const t = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(t.getTime()) ? 'Không rõ ngày' : VN_DAY.format(t);
};
export const vnTime = (createdAt: string): string => {
  const t = timestamp(createdAt);
  return Number.isNaN(t.getTime()) ? '' : VN_TIME.format(t);
};

export interface NotificationTarget { href: string; label: string; }
export const notificationTarget = (n: NotificationDto): NotificationTarget | null => {
  if (n.type === 'MemberRemoved') return null; // informational only
  const kind = n.relatedEntityType ?? '', id = n.relatedEntityId ?? '';
  if (!GUID.test(id)) return null;
  switch (kind) {
    case 'Task': return { href: `/tasks/${id}`, label: 'Xem công việc' };
    case 'Project': return { href: `/projects/${id}`, label: 'Xem dự án' };
    case 'Group': return { href: `/groups/${id}`, label: 'Xem nhóm' };
    case 'MarketplaceRequest':
      return n.groupId && GUID.test(n.groupId) ? { href: `/groups/${n.groupId}/marketplace`, label: 'Xem Marketplace' } : null;
    default: return null;
  }
};

const TYPE_ICON: Record<string, IconName> = {
  TaskAssigned: 'tasks', TaskUpdated: 'tasks', TaskSubmitted: 'tasks',
  TaskApproved: 'check', TaskChangesRequested: 'tasks',
  MarketplaceRequestCreated: 'link', MarketplaceRequestApproved: 'check', MarketplaceRequestRejected: 'link',
  DeadlineReminder: 'calendar', OverdueAlert: 'bell', StaleTaskWarning: 'bell',
  MemberInvited: 'users', MemberJoined: 'users', MemberRemoved: 'users',
  CommentAdded: 'bell',
};
export const typeIcon = (type: string): IconName => Object.hasOwn(TYPE_ICON, type) ? TYPE_ICON[type] : 'bell';
const TYPE_TONE: Record<string, string> = {
  TaskApproved: 'text-success-700', TaskChangesRequested: 'text-warning-700', MarketplaceRequestApproved: 'text-success-700',
  MarketplaceRequestRejected: 'text-danger-700', OverdueAlert: 'text-danger-700', StaleTaskWarning: 'text-warning-700',
};
export const typeTone = (type: string) => Object.hasOwn(TYPE_TONE, type) ? TYPE_TONE[type]
  : Object.hasOwn(TYPE_ICON, type) ? 'text-primary-600' : 'text-slate-600';

export const groupByDay = (items: NotificationDto[], today: string): [string, NotificationDto[]][] => {
  const map = new Map<string, NotificationDto[]>();
  for (const n of items) { const k = vnDayKey(n.createdAt); (map.get(k) ?? map.set(k, []).get(k)!).push(n); }
  return [...map.entries()]
    .sort((a, b) => {
      if (a[0] === '' && b[0] !== '') return 1; // unknown/invalid days LAST
      if (a[0] !== '' && b[0] === '') return -1;
      return a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0;
    })
    .map(([k, v]) => [k === '' ? 'Không rõ ngày' : dayLabel(k, today), [...v].sort((a, b) =>
      (timestamp(b.createdAt).getTime() || 0) - (timestamp(a.createdAt).getTime() || 0) || a.id.localeCompare(b.id))]);
};
