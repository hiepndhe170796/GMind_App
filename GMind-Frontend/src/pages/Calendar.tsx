import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import MainLayout from '../layouts/MainLayout';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Icon from '../components/ui/Icon';
import '../components/calendar/calendar.css';
import { ErrorState, EmptyState } from '../components/workspace/WorkspaceUI';
import { errMsg, status } from '../components/workspace/utils';
import CalendarMonth from '../components/calendar/CalendarMonth';
import { readCalendarFilters, buildCalendarModel, shiftMonth, clampDateToMonth, isMonth, vnToday, type CalTask } from '../components/calendar/calendar-model';
import { dashboardService } from '../services/dashboard';
import { useCurrentUserId } from '../hooks/use-current-user-id';
import { qk } from '../services/query-keys';
import { formatDateTime, STATUS_LABEL, PRIORITY_LABEL } from '../utils/presentation';

const VN_DAY = (date: string) =>
  new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${date}T00:00:00Z`));
const VN_MONTH = (month: string) => `Tháng ${+month.slice(5)}, ${month.slice(0, 4)}`;
const OPEN_STATUSES = ['ToDo', 'InProgress', 'Submitted', 'ChangesRequested'] as const;

export default function Calendar() {
  const me = useCurrentUserId();
  return <MainLayout contentWidth="fluid"><CalendarWorkspace key={me ?? ''} /></MainLayout>;
}

function CalendarWorkspace() {
  const me = useCurrentUserId() ?? '';
  const [params, setParams] = useSearchParams();
  const [today, setToday] = useState(vnToday);
  const filters = useMemo(() => readCalendarFilters(params, today), [params, today]);
  const [now, setNow] = useState(Date.now);
  const [q, setQ] = useState(filters.search);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Shares the MyTasks cache entry; RealtimeProvider invalidates qk.myTasks.
  const tasksQ = useQuery({
    queryKey: [...qk.myTasks(me), false] as const,
    queryFn: () => dashboardService.myTasks(false),
    enabled: !!me,
  });
  const tasks = tasksQ.data;

  const appliedQ = params.get('q') ?? '';
  const [lastAppliedQ, setLastAppliedQ] = useState(appliedQ);
  if (lastAppliedQ !== appliedQ) { setLastAppliedQ(appliedQ); setQ(appliedQ); }

  const update = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (v === null || v === '') next.delete(k); else next.set(k, v); }
    setParams(next, { replace: true });
  }, [params, setParams]);

  useEffect(() => {
    const tick = () => { setNow(Date.now()); setToday(vnToday()); };
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, []);

  const model = useMemo(() => buildCalendarModel(tasks ?? [], filters, now), [tasks, filters, now]);
  const navState = { navigationSection: '/calendar', returnTo: `/calendar${params.toString() ? `?${params}` : ''}` };
  const selectDate = (date: string) => update({ date, month: date.slice(0, 7) });
  const goMonth = (delta: number) => {
    const m = shiftMonth(filters.month, delta);
    if (m === filters.month) return;
    update({ month: m, date: clampDateToMonth(filters.date, m) });
  };
  const goToday = () => update({ month: today.slice(0, 7), date: today });
  const goMonthInput = (v: string) => {
    if (!isMonth(v)) return;
    update({ month: v, date: clampDateToMonth(filters.date, v) });
  };
  const hasFilters = Boolean(filters.search || filters.project || filters.status || filters.priority || filters.overdue);
  const activeCount = [filters.search, filters.project, filters.status, filters.priority, filters.overdue].filter(Boolean).length;
  const clearFilters = () => { setQ(''); update({ q: null, project: null, status: null, priority: null, overdue: null }); };

  const taskRow = (t: CalTask) => (
    <li key={t.id}>
      <Link to={`/tasks/${t.id}`} state={navState} title={t.title}
        className="block min-h-11 px-4 py-2 hover:bg-primary-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-600">
        <span className="line-clamp-2 text-sm font-semibold text-ink">{t.title}</span>
        <span className="mt-0.5 block truncate text-xs text-ink-secondary">{t.projectName}</span>
        <span className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
          <Badge value={t.priority}>{PRIORITY_LABEL[t.priority] ?? t.priority}</Badge>
          <Badge value={t.status}>{STATUS_LABEL[t.status] ?? t.status}</Badge>
          <span className={`ml-auto tabular-nums ${t.overdue ? 'text-danger-700 font-medium' : 'text-ink-muted'}`}>{t.overdue ? 'Quá hạn · ' : ''}{formatDateTime(t.deadlineAt)}</span>
        </span>
      </Link>
    </li>
  );

  const agendaByDay = useMemo(() => {
    const m = new Map<string, CalTask[]>();
    for (const t of model.monthTasks) { const a = m.get(t.day) ?? []; a.push(t); m.set(t.day, a); }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [model.monthTasks]);
  const selectedDay = filters.date;
  const showMonthAgenda = filters.view === 'month' && model.open.length > 0;

  const filterPanel = filtersOpen && (
    <div id="cal-filter-panel" className="grid grid-cols-2 gap-3 border-t border-line bg-surface-subtle/40 p-3 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] lg:items-end">
      <div className="min-w-0 col-span-2 lg:col-span-1">
        <label htmlFor="cal-proj" className="block text-sm font-medium text-ink-secondary mb-1">Dự án</label>
        <select id="cal-proj" value={filters.project} onChange={e => update({ project: e.target.value || null })}
          className="min-h-11 w-full">
          <option value="">Tất cả dự án</option>
          {model.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          {filters.project && !model.projects.some(p => p.id === filters.project) && (
            <option value={filters.project}>Dự án không còn trong danh sách</option>
          )}
        </select>
      </div>
      <div className="min-w-0">
        <label htmlFor="cal-status" className="block text-sm font-medium text-ink-secondary mb-1">Trạng thái</label>
        <select id="cal-status" value={filters.status} onChange={e => update({ status: e.target.value || null })}
          className="min-h-11 w-full">
          <option value="">Tất cả</option>
          {OPEN_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </div>
      <div className="min-w-0">
        <label htmlFor="cal-prio" className="block text-sm font-medium text-ink-secondary mb-1">Ưu tiên</label>
        <select id="cal-prio" value={filters.priority} onChange={e => update({ priority: e.target.value || null })}
          className="min-h-11 w-full">
          <option value="">Tất cả</option>
          {(['Low', 'Medium', 'High', 'Urgent'] as const).map(p => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
        </select>
      </div>
      <label className="min-h-11 inline-flex items-center gap-2 text-sm font-medium text-ink-secondary">
        <input type="checkbox" checked={filters.overdue} onChange={e => update({ overdue: e.target.checked ? '1' : null })}
          className="h-4 w-4 rounded border-line-strong text-primary-600 focus:ring-primary-600" />
        Chỉ quá hạn
      </label>
      {hasFilters && <button type="button" className="min-h-11 text-sm font-medium text-primary-700 hover:underline text-left" onClick={clearFilters}>Xóa bộ lọc</button>}
    </div>
  );

  return (
    <div className="calendar-surface space-y-4">
      <header className="gcal-page-header">
        <h2 className="text-title font-semibold text-ink">Lịch công việc</h2>
        <p className="gcal-page-description">Hạn công việc được giao cho bạn. Giờ Việt Nam (UTC+7).</p>
      </header>

      {tasksQ.isPending ? (
          <div role="status">
            <span className="sr-only">Đang tải lịch công việc…</span>
            <div aria-hidden="true" className="space-y-4 motion-safe:animate-pulse">
              <div className="h-11 rounded-xl bg-surface-subtle" />
              <div className="grid grid-cols-7 gap-1 overflow-hidden rounded-2xl">
                {Array.from({ length: 35 }, (_, i) => (
                  <div key={i} className="h-16 rounded-lg bg-surface-subtle md:h-24" />
                ))}
              </div>
            </div>
          </div>
        )
        : tasksQ.isError && (tasks === undefined || [401, 403, 404].includes(status(tasksQ.error) ?? 0)) ? <ErrorState message={errMsg(tasksQ.error, 'Không tải được lịch công việc')} onRetry={() => void tasksQ.refetch()} />
        : (
          <>
            {tasksQ.isError && (
              <div><p role="alert" className="text-sm text-warning-700 [overflow-wrap:anywhere]">Chưa làm mới được lịch. Đang hiển thị dữ liệu lần tải trước.</p>
                <Button variant="secondary" className="mt-1 min-h-11" disabled={tasksQ.isFetching}
                  onClick={() => void tasksQ.refetch()}>Thử lại</Button></div>
            )}

            <div className="gcal-workspace">
              {/* integrated header: month + navigation + view */}
              <div className="gcal-section gcal-header">
                <div className="gcal-period-navigation">
                  <label className="relative inline-flex min-h-11 items-center gap-1 rounded-xl px-2 focus-within:ring-2 focus-within:ring-primary-600">
                    <h3 role="status" aria-live="polite" className="text-lg font-semibold text-ink whitespace-nowrap">{VN_MONTH(filters.month)}</h3>
                    <Icon name="chevron-down" size={14} />
                    <input id="cal-month" type="month" value={filters.month} onChange={e => goMonthInput(e.target.value)}
                      aria-label="Chọn tháng"
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                  </label>
                  <div className="flex shrink-0 items-center">
                    <button type="button" onClick={() => goMonth(-1)} aria-label="Tháng trước"
                      disabled={shiftMonth(filters.month, -1) === filters.month}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-secondary hover:bg-surface-subtle disabled:opacity-40">
                      <Icon name="chevron-left" size={16} />
                    </button>
                    <button type="button" onClick={() => goMonth(1)} aria-label="Tháng sau"
                      disabled={shiftMonth(filters.month, 1) === filters.month}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-secondary hover:bg-surface-subtle disabled:opacity-40">
                      <Icon name="chevron-right" size={16} />
                    </button>
                  </div>
                </div>
                <Button variant="secondary" className="min-h-11 justify-self-start whitespace-nowrap" onClick={goToday}>Hôm nay</Button>
                <div role="group" aria-label="Chế độ xem" className="gcal-view flex shrink-0 gap-0 rounded-xl border border-line overflow-hidden">
                  {(['month', 'list'] as const).map(v => (
                    <button key={v} type="button" aria-pressed={filters.view === v} onClick={() => update({ view: v === 'month' ? null : v })}
                      className={`min-h-11 px-3 text-sm font-medium ${filters.view === v ? 'bg-primary-600 text-white' : 'text-ink-secondary hover:bg-surface-subtle'}`}>
                      {v === 'month' ? 'Tháng' : 'Danh sách'}
                    </button>
                  ))}
                </div>
              </div>

              {/* toolbar: search + collapsible filters */}
              <div className="gcal-section p-3">
                <div className="gcal-search-row">
                  <form role="search" className="gcal-search-form" onSubmit={e => { e.preventDefault(); update({ q: q.trim() || null }); }}>
                    <div className="min-w-0 flex-1">
                      <label htmlFor="cal-q" className="sr-only">Tìm công việc</label>
                      <input id="cal-q" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Tên hoặc dự án"
                        className="w-full" />
                    </div>
                    <Button type="submit" variant="secondary" className="min-h-11">Tìm</Button>
                  </form>
                  <button type="button" aria-expanded={filtersOpen} aria-controls="cal-filter-panel"
                    onClick={() => setFiltersOpen(o => !o)}
                    className="min-h-11 inline-flex items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-medium text-ink-secondary hover:bg-surface-subtle">
                    Bộ lọc{activeCount > 0 && <span className="cal-count rounded-full bg-primary-100 px-1.5 py-0.5 text-xs font-semibold text-primary-700">{activeCount}</span>}
                    <Icon name="chevron-down" size={14} className={filtersOpen ? 'rotate-180' : ''} />
                  </button>
                </div>
                {filterPanel}
              </div>

              {/* grid + joined agenda (month view only — list fills workspace) */}
              <div className={`gcal-section grid grid-cols-1 ${showMonthAgenda ? 'xl:grid-cols-[minmax(0,1fr)_280px]' : ''}`}>
                <div className="min-w-0">
                  {model.open.length === 0 && model.undated.length === 0 ? (
                    <div className="p-6"><EmptyState illustration="calendar" title="Chưa có công việc nào" body="Khi được giao công việc có hạn, nó sẽ xuất hiện ở đây."
                      action={<Link to="/my-tasks" className="min-h-11 inline-flex items-center text-primary-700 font-medium hover:underline">Về Việc của tôi</Link>} /></div>
                  ) : filters.view === 'month' ? (
                    <CalendarMonth month={filters.month} selected={selectedDay} today={today} byDate={model.byDate}
                      onSelect={selectDate} navState={navState} />
                  ) : (
                    agendaByDay.length === 0 ? (
                      <p className="px-4 py-10 text-center text-sm text-ink-secondary">
                        {model.open.every(t => !t.day) ? 'Chưa có công việc nào có hạn.' : 'Không có công việc khớp bộ lọc trong tháng này.'}
                        {hasFilters && <> <button className="text-primary-700 font-medium hover:underline" onClick={clearFilters}>Xóa bộ lọc</button></>}
                      </p>
                    ) : agendaByDay.map(([day, ts]) => (
                      <section key={day} aria-label={`Ngày ${day}`}>
                        <h3 className="border-b border-line bg-surface-subtle px-4 py-2 text-sm font-semibold text-ink">{VN_DAY(day)} ({ts.length})</h3>
                        <ul className="divide-y divide-line">{ts.map(taskRow)}</ul>
                      </section>
                    ))
                  )}
                </div>
                {showMonthAgenda && (
                <aside className="min-w-0 border-t border-line xl:border-l xl:border-t-0" data-selected-agenda={selectedDay}
                  aria-label={`Công việc ngày ${VN_DAY(selectedDay)}`}>
                  <h3 className="border-b border-line px-4 py-2.5 text-sm font-semibold text-ink">
                    {VN_DAY(selectedDay)} <span className="cal-count font-normal text-ink-muted">({model.selectedTasks.length})</span>
                  </h3>
                  {model.selectedTasks.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-ink-secondary">
                      {model.monthCount === 0 ? 'Tháng này chưa có công việc có hạn.' : 'Ngày này không có công việc.'}
                      {hasFilters && <> <button className="text-primary-700 font-medium hover:underline" onClick={clearFilters}>Xóa bộ lọc</button></>}
                    </p>
                  ) : (
                    <ul className="divide-y divide-line xl:max-h-[640px] xl:overflow-y-auto">{model.selectedTasks.map(taskRow)}</ul>
                  )}
                </aside>
                )}
              </div>

              {/* undated footer disclosure */}
              {model.undated.length > 0 && (
                <details className="gcal-section">
                  <summary className="min-h-11 inline-flex cursor-pointer items-center gap-1.5 px-4 py-2.5 font-medium text-ink">
                    <Icon name="chevron-right" size={14} className="transition-transform [details[open]>&]:rotate-90" />
                    Chưa đặt hạn ({model.undated.length}) — không hiển thị trên lưới
                  </summary>
                  <ul className="divide-y divide-line border-t border-line">{model.undated.map(taskRow)}</ul>
                </details>
              )}
            </div>
          </>
        )}
    </div>
  );
}
