import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Icon from '../components/ui/Icon';
import '../components/calendar/calendar.css';
import { Skeleton, ErrorState, EmptyState } from '../components/workspace/WorkspaceUI';
import { errMsg, status } from '../components/workspace/utils';
import CalendarMonth from '../components/calendar/CalendarMonth';
import { readCalendarFilters, buildCalendarModel, shiftMonth, clampDateToMonth, isMonth, vnToday, type CalTask } from '../components/calendar/calendar-model';
import { dashboardService, type MyTaskDto } from '../services/dashboard';
import { authService } from '../services/auth';
import { formatDateTime, STATUS_LABEL, PRIORITY_LABEL } from '../utils/presentation';

const VN_DAY = (date: string) =>
  new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${date}T00:00:00Z`));
const VN_MONTH = (month: string) => `Tháng ${+month.slice(5)}, ${month.slice(0, 4)}`;
const OPEN_STATUSES = ['ToDo', 'InProgress', 'Submitted', 'ChangesRequested'] as const;

export default function Calendar() {
  const me = authService.currentUser();
  return <MainLayout contentWidth="fluid"><CalendarWorkspace key={me?.id ?? ''} /></MainLayout>;
}

function CalendarWorkspace() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [today, setToday] = useState(vnToday);
  const filters = useMemo(() => readCalendarFilters(params, today), [params, today]);
  const [tasks, setTasks] = useState<MyTaskDto[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fatalError, setFatalError] = useState('');
  const [refreshError, setRefreshError] = useState('');
  const [now, setNow] = useState(Date.now);
  const [q, setQ] = useState(filters.search);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const loadVersion = useRef(0);
  const refreshingRef = useRef(false);
  const busy = refreshing;

  const appliedQ = params.get('q') ?? '';
  const [lastAppliedQ, setLastAppliedQ] = useState(appliedQ);
  if (lastAppliedQ !== appliedQ) { setLastAppliedQ(appliedQ); setQ(appliedQ); }

  const update = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (v === null || v === '') next.delete(k); else next.set(k, v); }
    setParams(next, { replace: true });
  }, [params, setParams]);

  const fetchTasks = useCallback(async (quiet = false) => {
    const version = ++loadVersion.current;
    try {
      const data = await dashboardService.myTasks();
      if (version !== loadVersion.current) return;
      setTasks(data); setFatalError(''); setRefreshError('');
    } catch (e: unknown) {
      if (version !== loadVersion.current) return;
      const s = status(e);
      if (s === 403 || s === 404 || !quiet) {
        if (s === 403 || s === 404) { setTasks(null); setQ(''); setRefreshError(''); } else setTasks(null);
        setFatalError(errMsg(e, 'Không tải được lịch công việc'));
      } else setRefreshError('Chưa làm mới được lịch. Đang hiển thị dữ liệu lần tải trước. ' + errMsg(e, ''));
    } finally {
      if (version === loadVersion.current) { setLoading(false); setRefreshing(false); refreshingRef.current = false; }
    }
  }, []);
  const reload = useCallback((quiet = false) => {
    if (!quiet) { setLoading(true); setTasks(null); setFatalError(''); }
    setRefreshError('');
    refreshingRef.current = true; setRefreshing(true);
    return fetchTasks(quiet);
  }, [fetchTasks]);

  const navigateRef = useRef(navigate);
  useEffect(() => { navigateRef.current = navigate; }, [navigate]);
  useEffect(() => {
    if (!authService.isLoggedIn()) { navigateRef.current('/login'); return; }
    let cancelled = false;
    void Promise.resolve().then(() => { if (!cancelled && !refreshingRef.current) { refreshingRef.current = true; setRefreshing(true); return fetchTasks(false); } });
    const lv = loadVersion, br = refreshingRef;
    return () => { cancelled = true; lv.current++; br.current = false; };
  }, [fetchTasks]);
  useEffect(() => {
    const tick = () => { setNow(Date.now()); setToday(vnToday()); };
    const t = setInterval(tick, 60_000);
    const onFocus = () => { tick(); if (!refreshingRef.current) void reload(true); };
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); };
  }, [reload]);

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
        <span className="line-clamp-2 text-sm font-semibold text-slate-900">{t.title}</span>
        <span className="mt-0.5 block truncate text-xs text-slate-600">{t.projectName}</span>
        <span className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
          <Badge value={t.priority}>{PRIORITY_LABEL[t.priority] ?? t.priority}</Badge>
          <Badge value={t.status}>{STATUS_LABEL[t.status] ?? t.status}</Badge>
          <span className={`ml-auto tabular-nums ${t.overdue ? 'text-danger-700 font-medium' : 'text-slate-600'}`}>{t.overdue ? 'Quá hạn · ' : ''}{formatDateTime(t.deadlineAt)}</span>
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
    <div id="cal-filter-panel" className="grid grid-cols-2 gap-3 border-t border-slate-200 bg-slate-50/40 p-3 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] lg:items-end">
      <div className="min-w-0 col-span-2 lg:col-span-1">
        <label htmlFor="cal-proj" className="block text-sm font-medium text-slate-700 mb-1">Dự án</label>
        <select id="cal-proj" value={filters.project} onChange={e => update({ project: e.target.value || null })}
          className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2">
          <option value="">Tất cả dự án</option>
          {model.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          {filters.project && !model.projects.some(p => p.id === filters.project) && (
            <option value={filters.project}>Dự án không còn trong danh sách</option>
          )}
        </select>
      </div>
      <div className="min-w-0">
        <label htmlFor="cal-status" className="block text-sm font-medium text-slate-700 mb-1">Trạng thái</label>
        <select id="cal-status" value={filters.status} onChange={e => update({ status: e.target.value || null })}
          className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2">
          <option value="">Tất cả</option>
          {OPEN_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </div>
      <div className="min-w-0">
        <label htmlFor="cal-prio" className="block text-sm font-medium text-slate-700 mb-1">Ưu tiên</label>
        <select id="cal-prio" value={filters.priority} onChange={e => update({ priority: e.target.value || null })}
          className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2">
          <option value="">Tất cả</option>
          {(['Low', 'Medium', 'High', 'Urgent'] as const).map(p => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
        </select>
      </div>
      <label className="min-h-11 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
        <input type="checkbox" checked={filters.overdue} onChange={e => update({ overdue: e.target.checked ? '1' : null })}
          className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-600" />
        Chỉ quá hạn
      </label>
      {hasFilters && <button type="button" className="min-h-11 text-sm font-medium text-primary-700 hover:underline text-left" onClick={clearFilters}>Xóa bộ lọc</button>}
    </div>
  );

  return (
    <div className="calendar-surface space-y-4">
      <header className="gcal-page-header">
        <h2 className="text-2xl font-bold text-slate-900">Lịch công việc</h2>
        <Button variant="secondary" className="min-h-11 whitespace-nowrap" disabled={busy} isLoading={refreshing}
          onClick={() => { if (!refreshingRef.current) void reload(true); }}>Làm mới</Button>
        <p className="gcal-page-description">Hạn công việc được giao cho bạn. Giờ Việt Nam (UTC+7).</p>
      </header>

      {loading ? <Skeleton label="Đang tải lịch công việc…" />
        : fatalError ? <ErrorState message={fatalError} onRetry={() => void reload(false)} />
        : (
          <>
            {refreshing && <p role="status" className="sr-only">Đang tải lại…</p>}
            {refreshError && (
              <div><p role="alert" className="text-sm text-danger-700 [overflow-wrap:anywhere]">{refreshError}</p>
                <Button variant="secondary" className="mt-1 min-h-11" disabled={busy} isLoading={refreshing}
                  onClick={() => { if (!refreshingRef.current) void reload(true); }}>Tải lại</Button></div>
            )}

            <div className="gcal-workspace">
              {/* integrated header: month + navigation + view */}
              <div className="gcal-section gcal-header">
                <div className="gcal-period-navigation">
                  <label className="relative inline-flex min-h-11 items-center gap-1 rounded-xl px-2 focus-within:ring-2 focus-within:ring-primary-600">
                    <h3 role="status" aria-live="polite" className="text-lg font-semibold text-slate-900 whitespace-nowrap">{VN_MONTH(filters.month)}</h3>
                    <Icon name="chevron-down" size={14} />
                    <input id="cal-month" type="month" value={filters.month} onChange={e => goMonthInput(e.target.value)}
                      aria-label="Chọn tháng"
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                  </label>
                  <div className="flex shrink-0 items-center">
                    <button type="button" onClick={() => goMonth(-1)} aria-label="Tháng trước"
                      disabled={shiftMonth(filters.month, -1) === filters.month}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 disabled:opacity-40">
                      <Icon name="chevron-left" size={16} />
                    </button>
                    <button type="button" onClick={() => goMonth(1)} aria-label="Tháng sau"
                      disabled={shiftMonth(filters.month, 1) === filters.month}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 disabled:opacity-40">
                      <Icon name="chevron-right" size={16} />
                    </button>
                  </div>
                </div>
                <Button variant="secondary" className="min-h-11 justify-self-start whitespace-nowrap" onClick={goToday}>Hôm nay</Button>
                <div role="group" aria-label="Chế độ xem" className="gcal-view flex shrink-0 gap-0 rounded-xl border border-slate-200 overflow-hidden">
                  {(['month', 'list'] as const).map(v => (
                    <button key={v} type="button" aria-pressed={filters.view === v} onClick={() => update({ view: v === 'month' ? null : v })}
                      className={`min-h-11 px-3 text-sm font-medium ${filters.view === v ? 'bg-primary-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
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
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-2" />
                    </div>
                    <Button type="submit" variant="secondary" className="min-h-11">Tìm</Button>
                  </form>
                  <button type="button" aria-expanded={filtersOpen} aria-controls="cal-filter-panel"
                    onClick={() => setFiltersOpen(o => !o)}
                    className="min-h-11 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
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
                    <div className="p-6"><EmptyState title="Chưa có công việc nào" body="Khi được giao công việc có hạn, nó sẽ xuất hiện ở đây."
                      action={<Link to="/my-tasks" className="min-h-11 inline-flex items-center text-primary-700 font-medium hover:underline">Về Việc của tôi</Link>} /></div>
                  ) : filters.view === 'month' ? (
                    <CalendarMonth month={filters.month} selected={selectedDay} today={today} byDate={model.byDate}
                      onSelect={selectDate} navState={navState} />
                  ) : (
                    agendaByDay.length === 0 ? (
                      <p className="px-4 py-10 text-center text-sm text-slate-600">
                        {model.open.every(t => !t.day) ? 'Chưa có công việc nào có hạn.' : 'Không có công việc khớp bộ lọc trong tháng này.'}
                        {hasFilters && <> <button className="text-primary-700 font-medium hover:underline" onClick={clearFilters}>Xóa bộ lọc</button></>}
                      </p>
                    ) : agendaByDay.map(([day, ts]) => (
                      <section key={day} aria-label={`Ngày ${day}`}>
                        <h3 className="border-b border-slate-200 bg-slate-50/60 px-4 py-2 text-sm font-semibold text-slate-700">{VN_DAY(day)} ({ts.length})</h3>
                        <ul className="divide-y divide-slate-100">{ts.map(taskRow)}</ul>
                      </section>
                    ))
                  )}
                </div>
                {showMonthAgenda && (
                <aside className="min-w-0 border-t border-slate-200 xl:border-l xl:border-t-0" data-selected-agenda={selectedDay}
                  aria-label={`Công việc ngày ${VN_DAY(selectedDay)}`}>
                  <h3 className="border-b border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-900">
                    {VN_DAY(selectedDay)} <span className="cal-count font-normal text-slate-600">({model.selectedTasks.length})</span>
                  </h3>
                  {model.selectedTasks.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-slate-600">
                      {model.monthCount === 0 ? 'Tháng này chưa có công việc có hạn.' : 'Ngày này không có công việc.'}
                      {hasFilters && <> <button className="text-primary-700 font-medium hover:underline" onClick={clearFilters}>Xóa bộ lọc</button></>}
                    </p>
                  ) : (
                    <ul className="divide-y divide-slate-100 xl:max-h-[640px] xl:overflow-y-auto">{model.selectedTasks.map(taskRow)}</ul>
                  )}
                </aside>
                )}
              </div>

              {/* undated footer disclosure */}
              {model.undated.length > 0 && (
                <details className="gcal-section">
                  <summary className="min-h-11 inline-flex cursor-pointer items-center gap-1.5 px-4 py-2.5 font-medium text-slate-900">
                    <Icon name="chevron-right" size={14} className="transition-transform [details[open]>&]:rotate-90" />
                    Chưa đặt hạn ({model.undated.length}) — không hiển thị trên lưới
                  </summary>
                  <ul className="divide-y divide-slate-100 border-t border-slate-200">{model.undated.map(taskRow)}</ul>
                </details>
              )}
            </div>
          </>
        )}
    </div>
  );
}
