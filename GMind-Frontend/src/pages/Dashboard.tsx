import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import MainLayout from '../layouts/MainLayout';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Icon from '../components/ui/Icon';
import { buttonClasses } from '../components/ui/Button';
import StatusBar from '../components/ui/StatusBar';
import { EmptyState, ErrorState } from '../components/workspace/WorkspaceUI';
import MiniCalendar from '../components/dashboard/MiniCalendar';
import MyTaskRow from '../components/tasks/MyTaskRow';
import { KIND_META, queueAction, queueReason } from '../components/dashboard/leader-queue-model';
import { qk } from '../services/query-keys';
import { dashboardService, type LeaderQueueKind } from '../services/dashboard';
import { marketplaceService } from '../services/marketplace';
import { groupsService } from '../services/groups';
import { authService } from '../services/auth';
import { useCurrentUserId } from '../hooks/use-current-user-id';
import { deadlineState, type DeadlineKind } from '../utils/task-time';
import { dayKey, formatDate } from '../utils/presentation';

const errMsg = (e: unknown, fb: string) =>
  typeof (e as { message?: unknown })?.message === 'string' && (e as { message: string }).message ? (e as { message: string }).message : fb;
const NAV_STATE = { navigationSection: '/dashboard' };

const TABS: { key: DeadlineKind | 'all'; label: string }[] = [
  { key: 'today', label: 'Hôm nay' },
  { key: 'tomorrow', label: 'Ngày mai' },
  { key: 'soon', label: 'Sắp đến hạn (7 ngày)' },
  { key: 'overdue', label: 'Quá hạn' },
  { key: 'all', label: 'Tất cả' },
];

const REQUEST_TYPE_LABEL: Record<string, string> = { NeedHelp: 'Cần hỗ trợ', Transfer: 'Chuyển giao', Swap: 'Hoán đổi' };
const QUEUE_KINDS: LeaderQueueKind[] = ['Review', 'Marketplace', 'Overdue', 'AtRisk', 'Stale', 'Unassigned'];
const TOTAL_KEY: Record<LeaderQueueKind, 'review' | 'marketplace' | 'overdue' | 'atRisk' | 'stale' | 'unassigned'> = {
  Review: 'review', Marketplace: 'marketplace', Overdue: 'overdue',
  AtRisk: 'atRisk', Stale: 'stale', Unassigned: 'unassigned',
};

export default function Dashboard() {
  const me = useCurrentUserId() ?? '';
  const user = authService.currentUser();
  const [tab, setTab] = useState<DeadlineKind | 'all'>('all');
  const [kindFilter, setKindFilter] = useState<LeaderQueueKind | 'all'>('all');
  const [queueExpanded, setQueueExpanded] = useState(false);
  const [calDate, setCalDate] = useState<string | null>(null);

  const tasksQ = useQuery({
    queryKey: [...qk.myTasks(me), 'with-completed'] as const,
    queryFn: () => dashboardService.myTasks(true),
    enabled: !!me,
  });
  const queueQ = useQuery({
    queryKey: qk.leaderQueue(me),
    queryFn: () => dashboardService.leaderQueue(),
    enabled: !!me,
  });
  const groupsQ = useQuery({
    queryKey: qk.myGroups(me),
    queryFn: () => groupsService.myGroups(),
    enabled: !!me,
  });
  const incomingQ = useQuery({
    queryKey: qk.marketplaceIncoming(me),
    queryFn: () => marketplaceService.incoming(),
    enabled: !!me,
  });
  const incoming = incomingQ.data ?? [];

  const allTasks = useMemo(() => tasksQ.data ?? [], [tasksQ.data]);
  const openTasks = useMemo(() => allTasks.filter(t => t.status !== 'Completed'), [allTasks]);
  const completed30 = allTasks.length - openTasks.length;
  const inProgress = openTasks.filter(t => t.status === 'InProgress').length;

  const queue = queueQ.data;
  const groups = groupsQ.data ?? [];
  const isLeader = groups.some(g => g.myRole === 'Leader');
  const memberGroups = groups.filter(g => g.myRole !== 'Leader');

  // Personal tabs (DASH-01) via deadlineState; optional calendar day filter
  const tabCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of openTasks) {
      const k = deadlineState(t.deadlineAt, t.status).kind;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [openTasks]);
  const tabTasks = useMemo(() => {
    let list = tab === 'all' ? openTasks : openTasks.filter(t => deadlineState(t.deadlineAt, t.status).kind === tab);
    if (calDate) list = list.filter(t => t.deadlineAt && dayKey(t.deadlineAt) === calDate);
    return list;
  }, [openTasks, tab, calDate]);

  const queueItems = useMemo(() => {
    const items = queue?.items ?? [];
    return kindFilter === 'all' ? items : items.filter(i => i.kind === kindFilter);
  }, [queue, kindFilter]);
  const queueTotal = queue ? QUEUE_KINDS.reduce((s, k) => s + queue.totals[TOTAL_KEY[k]], 0) : 0;
  const shownQueueItems = queueExpanded ? queueItems : queueItems.slice(0, 6);
  const pickKind = (k: LeaderQueueKind | 'all') => { setKindFilter(k); setQueueExpanded(false); };
  const pickCalDate = (k: string | null) => { setCalDate(k); if (k) setTab('all'); };

  const calTasks = openTasks.filter(t => t.deadlineAt);
  const loading = tasksQ.isPending || groupsQ.isPending;
  const error = tasksQ.isError ? tasksQ.error : groupsQ.isError ? groupsQ.error : null;

  const skeleton = (
    <div aria-hidden="true" className="space-y-4 motion-safe:animate-pulse">
      <div className="h-8 w-64 rounded-lg bg-surface-subtle" />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="h-56 rounded-2xl bg-surface-subtle lg:col-span-2" />
        <div className="h-56 rounded-2xl bg-surface-subtle" />
      </div>
    </div>
  );

  const queueCard = isLeader && (
    <section aria-labelledby="dash-queue-title">
      <Card className="p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id="dash-queue-title" className="text-lg font-semibold text-ink">Cần bạn xử lý</h3>
          {queue && (
            <div role="group" aria-label="Lọc theo loại việc" className="-mx-1 flex flex-nowrap gap-1 overflow-x-auto whitespace-nowrap px-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
              <button type="button" aria-pressed={kindFilter === 'all'} onClick={() => pickKind('all')}
                className={`min-h-9 max-sm:min-h-11 shrink-0 rounded-lg px-3 text-small font-medium ${kindFilter === 'all' ? 'bg-primary-50 text-primary-700' : 'text-ink-secondary hover:bg-surface-subtle'}`}>
                Tất cả <span className="tabular-nums">({queueTotal})</span>
              </button>
              {QUEUE_KINDS.filter(k => queue.totals[TOTAL_KEY[k]] > 0).map(k => (
                <button key={k} type="button" aria-pressed={kindFilter === k} onClick={() => pickKind(k)}
                  className={`min-h-9 max-sm:min-h-11 shrink-0 rounded-lg px-3 text-small font-medium ${kindFilter === k ? 'bg-primary-50 text-primary-700' : 'text-ink-secondary hover:bg-surface-subtle'}`}>
                  {KIND_META[k].label} <span className="tabular-nums">({queue.totals[TOTAL_KEY[k]]})</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {queueQ.isPending ? (
          <div aria-hidden="true" className="mt-3 space-y-3 motion-safe:animate-pulse">
            {[0, 1, 2].map(i => <div key={i} className="h-14 rounded-lg bg-surface-subtle" />)}
            <span className="sr-only">Đang tải hàng chờ xử lý…</span>
          </div>
        ) : queueQ.isError ? (
          <ErrorState message={errMsg(queueQ.error, 'Không tải được danh sách việc cần xử lý.')}
            onRetry={() => void queueQ.refetch()} />
        ) : !queue || queueItems.length === 0 ? (
          <EmptyState illustration="tasks" title="Không có việc cần bạn xử lý."
            body="Khi có công việc chờ duyệt, quá hạn hoặc chưa giao, chúng sẽ xuất hiện tại đây." />
        ) : (
          <>
            <ul className="mt-3 divide-y divide-line">
              {shownQueueItems.map((item, i) => {
                const meta = KIND_META[item.kind];
                const action = queueAction(item);
                const parts = [item.projectName, item.groupName, item.kind === 'Review' ? null : item.assigneeName].filter(Boolean);
                return (
                  <li key={`${item.kind}-${item.taskId ?? item.requestId ?? i}`}
                    className="relative grid min-h-11 gap-y-1 py-3.5 sm:grid-cols-[8.5rem_minmax(0,1fr)_auto] sm:items-center sm:gap-x-3 sm:gap-y-0">
                    <Badge variant={meta.variant} className="justify-self-start">{meta.label}</Badge>
                    <span className="min-w-0">
                      {item.taskId ? (
                        <Link to={`/tasks/${item.taskId}`} state={NAV_STATE} title={item.title}
                          className="line-clamp-2 text-small font-medium text-ink hover:text-primary-700 [overflow-wrap:anywhere] after:absolute after:inset-0 after:content-['']">
                          {item.title}
                        </Link>
                      ) : (
                        <span className="line-clamp-2 text-small font-medium text-ink [overflow-wrap:anywhere]">{item.title}</span>
                      )}
                      <span className="mt-0.5 block text-caption text-ink-muted">{parts.join(' · ')}</span>
                      <span className="mt-0.5 block text-caption text-ink-secondary">{queueReason(item)}</span>
                    </span>
                    {action && (
                      <Link to={action.href} state={NAV_STATE}
                        className="relative z-10 inline-flex items-center max-sm:min-h-11 max-sm:-my-3 text-small font-medium text-primary-700 hover:underline sm:justify-self-end">
                        {action.label}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
            {queueItems.length > 6 && (
              <button type="button" onClick={() => setQueueExpanded(e => !e)}
                className={`${buttonClasses({ variant: 'ghost', size: 'sm' })} mt-2`}>
                {queueExpanded ? 'Thu gọn' : `Hiện thêm ${queueItems.length - 6} việc`}
              </button>
            )}
            {kindFilter === 'all' && queueTotal > queue.items.length && (
              <p className="mt-2 text-caption text-ink-muted">Đang hiển thị {queue.items.length} việc ưu tiên nhất.</p>
            )}
          </>
        )}
      </Card>
    </section>
  );

  const myTasksCard = (
    <section aria-labelledby="dash-tasks-title">
      <Card className="p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id="dash-tasks-title" className="text-lg font-semibold text-ink">Việc của bạn</h3>
          <div role="group" aria-label="Lọc theo hạn" className="-mx-1 flex flex-nowrap gap-1 overflow-x-auto whitespace-nowrap px-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            {TABS.map(tb => {
              const count = tb.key === 'all' ? openTasks.length : (tabCounts.get(tb.key) ?? 0);
              return (
                <button key={tb.key} type="button" aria-pressed={tab === tb.key} onClick={() => setTab(tb.key)}
                  className={`min-h-9 max-sm:min-h-11 shrink-0 rounded-lg px-3 text-small font-medium ${tab === tb.key ? 'bg-primary-50 text-primary-700' : 'text-ink-secondary hover:bg-surface-subtle'}`}>
                  {tb.label} <span className="tabular-nums">({count})</span>
                </button>
              );
            })}
          </div>
        </div>
        {calDate && (
          <p className="mt-3 flex flex-wrap items-center gap-2 text-small text-ink-secondary">
            Đang lọc công việc đến hạn ngày {formatDate(`${calDate}T00:00:00+07:00`)}.
            <button type="button" className="inline-flex items-center max-sm:min-h-11 max-sm:-my-3 font-medium text-primary-700 hover:underline" onClick={() => setCalDate(null)}>Bỏ lọc ngày</button>
          </p>
        )}
        {tabTasks.length === 0 ? (
          <EmptyState illustration="tasks"
            title={openTasks.length === 0 ? 'Bạn chưa có công việc đang mở.' : 'Không có công việc trong mục này.'}
            body={openTasks.length === 0
              ? 'Các công việc được giao cho bạn sẽ xuất hiện tại đây theo hạn hoàn thành.'
              : 'Thử chọn mục khác hoặc xem toàn bộ trong Việc của tôi.'}
            action={<Link to="/my-tasks" className="inline-flex min-h-11 items-center text-small font-medium text-primary-700 hover:underline">Mở Việc của tôi</Link>} />
        ) : (
          <>
            <ul className="mt-2 divide-y divide-line">
              {tabTasks.slice(0, 8).map(t => <MyTaskRow key={t.id} task={t} navState={NAV_STATE} />)}
            </ul>
            {tabTasks.length > 8 && (
              <Link to="/my-tasks" className="mt-3 inline-flex min-h-9 max-sm:min-h-11 max-sm:-my-1 items-center text-small font-medium text-primary-700 hover:underline">
                Xem tất cả trong Việc của tôi ({tabTasks.length})
              </Link>
            )}
          </>
        )}
      </Card>
    </section>
  );

  const side = (
    <div className="space-y-6 max-xl:contents">
      {incoming.length > 0 && (
        <section aria-labelledby="dash-inc-title" className="max-xl:-order-1">
          <Card className="p-4 sm:p-6">
            <h3 id="dash-inc-title" className="text-lg font-semibold text-ink">
              Yêu cầu gửi tới bạn <span className="tabular-nums font-normal text-ink-muted">({incoming.length})</span>
            </h3>
            <ul className="mt-3 divide-y divide-line">
              {incoming.slice(0, 5).map(r => (
                <li key={r.id} className="relative py-3 min-w-0">
                  <Badge variant="accent">{REQUEST_TYPE_LABEL[r.requestType] ?? r.requestType}</Badge>
                  <Link to={`/tasks/${r.taskId}`} state={NAV_STATE} title={r.taskTitle}
                    className="mt-1.5 line-clamp-2 text-small font-medium text-ink hover:text-primary-700 [overflow-wrap:anywhere] after:absolute after:inset-0 after:content-['']">{r.taskTitle}</Link>
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-caption text-ink-muted">{r.requestedByName} · {r.groupName}</span>
                    <Link to={`/groups/${r.groupId}/marketplace?tab=${r.status === 'AwaitingRecipient' ? 'action' : 'open'}`}
                      state={NAV_STATE}
                      className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'relative z-10 max-sm:-my-1 shrink-0 whitespace-nowrap' })}>
                      {r.status === 'AwaitingRecipient' ? 'Phản hồi' : 'Xem và nhận'}
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}
      <section aria-label="Lịch hạn công việc">
        <Card className="p-4 sm:p-6">
          <h3 className="text-lg font-semibold text-ink">Lịch hạn</h3>
          <div className="mt-3">
            <MiniCalendar tasks={calTasks} selectedDate={calDate} onSelect={pickCalDate} />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-small">
            <span className="flex items-center gap-2 text-ink-secondary whitespace-nowrap">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-primary-600" />Có công việc đến hạn
            </span>
            <Link to="/calendar" className="min-h-9 max-sm:min-h-11 max-sm:-my-1 inline-flex items-center font-medium text-primary-700 hover:underline whitespace-nowrap">Mở lịch đầy đủ</Link>
          </div>
        </Card>
      </section>

      {isLeader && queue && (
        <section aria-labelledby="dash-led-title">
          <Card className="p-4 sm:p-6">
            <h3 id="dash-led-title" className="text-lg font-semibold text-ink">Nhóm bạn quản lý</h3>
            <ul className="mt-3 space-y-4">
              {queue.groups.map(g => (
                <li key={g.groupId} className="min-w-0">
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <Link to={`/groups/${g.groupId}`} state={NAV_STATE}
                      className="inline-flex items-center max-sm:min-h-11 max-sm:-my-3 truncate text-small font-medium text-ink hover:text-primary-700">{g.groupName}</Link>
                  </div>
                  <StatusBar size="sm" showLegend={false} counts={{
                    ToDo: g.counts.toDo, InProgress: g.counts.inProgress, Submitted: g.counts.submitted,
                    ChangesRequested: g.counts.changesRequested, Completed: g.counts.completed,
                  }} />
                  <p className="mt-1 text-caption text-ink-muted">
                    {g.overdue > 0 ? <span className="font-medium text-danger-700">{g.overdue} quá hạn</span> : '0 quá hạn'}
                    {' · '}{g.unassigned} chưa giao
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      {memberGroups.length > 0 && (
        <section aria-labelledby="dash-mygroups-title">
          <Card className="p-4 sm:p-6">
            <h3 id="dash-mygroups-title" className="text-lg font-semibold text-ink">Nhóm của tôi</h3>
            <ul className="mt-3 space-y-2">
              {memberGroups.map(g => (
                <li key={g.id} className="flex items-center justify-between gap-2 min-w-0">
                  <Link to={`/groups/${g.id}`} state={NAV_STATE}
                    className="inline-flex items-center max-sm:min-h-11 max-sm:-my-3 truncate text-small font-medium text-ink hover:text-primary-700">{g.name}</Link>
                  <Badge value="Member">Thành viên</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}
    </div>
  );

  return (
    <MainLayout>
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-display font-semibold text-ink break-words">Chào {user?.displayName || 'bạn'},</h2>
            <p className="mt-2 text-body text-ink-secondary">
              {groups.length === 0 && !loading && !error
                ? 'Bắt đầu bằng cách tạo nhóm cho dự án hoặc tham gia nhóm có sẵn.'
                : `${openTasks.length} việc đang mở · ${inProgress} đang làm · ${completed30} hoàn thành trong 30 ngày`}
            </p>
          </div>
          {(groups.length > 0 || loading) && (
            <Link to="/join-group" className={buttonClasses({ variant: 'secondary' })}>
              <Icon name="plus" size={18} />Tạo / tham gia nhóm
            </Link>
          )}
        </header>

        {loading ? (
          <>
            <p role="status" className="sr-only">Đang tải bảng điều khiển…</p>
            {skeleton}
          </>
        ) : error ? (
          <ErrorState message={errMsg(error, 'Không tải được bảng điều khiển.')}
            onRetry={() => { void tasksQ.refetch(); void groupsQ.refetch(); void queueQ.refetch(); }} />
        ) : groups.length === 0 ? (
          <Card className="p-6 sm:p-10">
            <EmptyState illustration="groups" title="Tạo nhóm hoặc tham gia bằng mã mời."
              body="GMind làm việc theo nhóm: tạo một nhóm mới cho dự án của bạn hoặc nhập mã mời mà Trưởng nhóm đã gửi."
              action={<Link to="/join-group" className={buttonClasses({ variant: 'primary' })}>
                <Icon name="plus" size={18} />Tạo / tham gia nhóm</Link>} />
          </Card>
        ) : (
          <>
            {queueCard}
            <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_336px]">
              {myTasksCard}
              {side}
            </div>
          </>
        )}
      </div>
    </MainLayout>
  );
}
