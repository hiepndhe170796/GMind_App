import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import Button from '../components/ui/Button';
import { EmptyState, ErrorState } from '../components/workspace/WorkspaceUI';
import ConfirmationDialog from '../components/workspace/ConfirmationDialog';
import { groupByDay, type NotificationDto } from '../services/notifications';
import { useNotificationCount } from '../components/notifications/useNotificationCount';
import { useNotificationInbox } from '../components/notifications/useNotificationInbox';
import NotificationItem from '../components/notifications/NotificationItem';
import { authService } from '../services/auth';
import '../components/workspace/workspace.css';
import '../components/notifications/notifications.css';

function NotificationsWorkspace() {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const unreadOnly = params.get('unread') === '1';
  const count = useNotificationCount();
  const [confirming, setConfirming] = useState(false);
  const closeConfirm = useCallback(() => setConfirming(false), []);
  const inbox = useNotificationInbox(unreadOnly, closeConfirm);
  const [focusTarget, setFocusTarget] = useState<{ id?: string; next?: string } | null>(null);
  const lastFocused = useRef<typeof focusTarget>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const allFilterRef = useRef<HTMLButtonElement>(null);
  const unreadFilterRef = useRef<HTMLButtonElement>(null);
  const busy = inbox.pending !== null;
  const navState = { navigationSection: '/notifications', returnTo: `/notifications${location.search}` };
  const groups = useMemo(() => inbox.items ? groupByDay(inbox.items, inbox.today) : [], [inbox.items, inbox.today]);
  const hasUnread = (count.count ?? 0) > 0 || inbox.items?.some(n => !n.isRead);
  const setFilter = (unread: boolean) => setParams(previous => {
    const next = new URLSearchParams(previous);
    if (unread) next.set('unread', '1'); else next.delete('unread');
    return next;
  }, { replace: true });
  useEffect(() => {
    if (!focusTarget || busy || lastFocused.current === focusTarget) return;
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[data-notification-id]') ?? []);
    const row = rows.find(n => n.dataset.notificationId === focusTarget.id)
      ?? rows.find(n => n.dataset.notificationId === focusTarget.next);
    const target = row?.querySelector<HTMLElement>('h4') ?? (unreadOnly ? unreadFilterRef.current : allFilterRef.current);
    target?.focus();
    lastFocused.current = focusTarget;
  }, [focusTarget, busy, unreadOnly]);
  const read = async (item: NotificationDto) => {
    const index = inbox.items?.findIndex(n => n.id === item.id) ?? -1;
    const next = inbox.items?.[index + 1]?.id ?? inbox.items?.[index - 1]?.id;
    if (await inbox.markOne(item.id)) setFocusTarget({ id: item.id, next });
  };
  const readAll = async () => {
    if (await inbox.markAll()) { setConfirming(false); setFocusTarget({}); }
  };

  return (
    <div className="notifications-surface workspace-surface mx-auto w-full max-w-4xl">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Thông báo</h2>
          <p className="mt-1 text-sm text-slate-600" data-unread-summary>
            {count.count === null ? 'Cập nhật từ nhóm và công việc của bạn.' : `${count.count} thông báo chưa đọc`}
            {count.error && count.count !== null && ' (chưa làm mới)'}
          </p>
        </div>
        <Button variant="secondary" className="min-h-11 shrink-0" onClick={() => void inbox.refresh()}
          aria-busy={inbox.refreshing} disabled={busy || inbox.refreshing || (inbox.items === null && !inbox.fatal)}>
          {inbox.refreshing ? 'Đang làm mới' : 'Làm mới'}
        </Button>
      </div>
      {count.error && (
        <div role="alert" className="mb-4 flex flex-wrap items-center gap-x-3 rounded-xl bg-warning-50 px-4 py-2 text-sm text-warning-700">
          Chưa làm mới được số chưa đọc.
          <button type="button" disabled={busy || count.loading} onClick={() => void count.refresh(true)}
            className="min-h-11 font-semibold underline underline-offset-4">Thử lại số chưa đọc</button>
        </div>
      )}
      {inbox.success && <p role="status" className="mb-4 rounded-xl bg-success-50 px-4 py-3 text-sm text-success-700">{inbox.success}</p>}
      {inbox.actionError && !confirming && <p role="alert" className="mb-4 rounded-xl bg-danger-50 px-4 py-3 text-sm text-danger-700">{inbox.actionError}</p>}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-3 sm:px-5">
          <div role="group" aria-label="Lọc thông báo" className="flex gap-1 rounded-xl bg-slate-100 p-1">
            <button ref={allFilterRef} type="button" aria-pressed={!unreadOnly} aria-controls="notifications-list"
              disabled={busy} onClick={() => setFilter(false)}
              className={`min-h-11 rounded-lg px-3 text-sm font-medium ${!unreadOnly ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:text-slate-950'}`}>Tất cả</button>
            <button ref={unreadFilterRef} type="button" aria-pressed={unreadOnly} aria-controls="notifications-list"
              disabled={busy} onClick={() => setFilter(true)}
              className={`min-h-11 rounded-lg px-3 text-sm font-medium ${unreadOnly ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:text-slate-950'}`}>
              Chưa đọc{count.count !== null && <span className="ml-1.5 tabular-nums text-primary-700">({count.count})</span>}
            </button>
          </div>
          <Button variant="ghost" className="notification-bulk"
            onClick={() => setConfirming(true)} disabled={busy || !hasUnread || inbox.items === null}>
            Đánh dấu tất cả đã đọc
          </Button>
        </div>
        {inbox.refreshError && <p role="alert" className="border-b border-warning-100 bg-warning-50 px-4 py-3 text-sm text-warning-700">Không làm mới được danh sách. Dữ liệu đang hiển thị có thể chưa cập nhật.</p>}
        <div id="notifications-list" ref={listRef} aria-busy={inbox.refreshing || (inbox.items === null && !inbox.fatal)}>
        {inbox.items === null && !inbox.fatal && (
          <div>
          <p role="status" className="sr-only">Đang tải thông báo</p>
          <ul aria-hidden="true" className="divide-y divide-slate-100">
            {[1, 2, 3].map(i => (
              <li key={i} className="flex gap-3 px-4 py-5 motion-safe:animate-pulse">
                <span className="h-9 w-9 rounded-lg bg-slate-100" />
                <span className="flex-1 space-y-3 py-1"><span className="block h-4 w-2/3 rounded bg-slate-100" /><span className="block h-3 w-full rounded bg-slate-100" /><span className="block h-3 w-1/3 rounded bg-slate-100" /></span>
              </li>
            ))}
          </ul>
          </div>
        )}
        {inbox.fatal && <div className="p-5"><ErrorState message={inbox.fatal} onRetry={() => void inbox.refresh()} /></div>}
        {inbox.items?.length === 0 && (
          <div className="px-5 py-3">
            <EmptyState title={unreadOnly ? 'Không có thông báo chưa đọc' : 'Chưa có thông báo'}
              body={unreadOnly ? 'Bạn có thể xem lại các thông báo đã đọc trong mục Tất cả.' : 'Những cập nhật về công việc và nhóm sẽ xuất hiện ở đây.'}
              action={unreadOnly ? <Button variant="secondary" onClick={() => setFilter(false)}>Xem tất cả</Button> : undefined} />
          </div>
        )}
        {inbox.items !== null && inbox.items.length > 0 && (
          <>
            {groups.map(([label, rows]) => (
              <section key={label} aria-label={label}>
                <h3 className="border-b border-slate-100 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-700 sm:px-5">{label}</h3>
                <ul className="divide-y divide-slate-100">
                  {rows.map(n => (
                    <NotificationItem key={n.id} item={n} busy={busy} onRead={() => void read(n)} navState={navState} />
                  ))}
                </ul>
              </section>
            ))}
            {inbox.items.length >= 100 && <p className="border-t border-slate-200 px-5 py-3 text-xs text-slate-600">Hiển thị tối đa 100 thông báo gần nhất theo bộ lọc. Chưa hỗ trợ tải các mục cũ hơn.</p>}
          </>
        )}
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-600">Thời gian hiển thị theo giờ Việt Nam (UTC+7).</p>
      <ConfirmationDialog open={confirming} title="Đánh dấu tất cả đã đọc?" busy={busy}
        onClose={() => { if (!busy) setConfirming(false); }}>
        <p>Áp dụng cho tất cả thông báo chưa đọc của bạn, kể cả những mục không nằm trong danh sách đang xem. Không thể hoàn tác thao tác này.</p>
        {inbox.actionError && <p role="alert" className="mt-3 text-danger-700">{inbox.actionError}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" className="min-h-11" onClick={() => setConfirming(false)} disabled={busy}>Hủy</Button>
          <Button className="min-h-11" onClick={() => void readAll()} disabled={busy}>{busy ? 'Đang cập nhật...' : 'Đánh dấu tất cả'}</Button>
        </div>
      </ConfirmationDialog>
    </div>
  );
}

export default function Notifications() {
  const me = authService.currentUser();
  return <MainLayout><NotificationsWorkspace key={me?.id ?? ''} /></MainLayout>;
}
