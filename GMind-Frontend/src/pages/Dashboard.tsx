import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Icon from '../components/ui/Icon';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import MiniCalendar from '../components/dashboard/MiniCalendar';
import '../components/dashboard/dashboard.css';
import { dashboardService, type MyTaskDto } from '../services/dashboard';
import { groupsService, type GroupDto } from '../services/groups';
import { authService } from '../services/auth';
import { formatDate, formatDateTime, STATUS_LABEL, PRIORITY_LABEL } from '../utils/presentation';
import { buildDashboardModel, deadlineTime, readDashboardFilters, type DashboardPeriod } from '../components/dashboard/dashboard-model';

type Resource<T> = { items: T[]; loading: boolean; error: string };
const NAV_STATE = { navigationSection: '/dashboard' };
const errMsg = (e: unknown, fb: string) =>
  typeof (e as { message?: unknown })?.message === 'string' && (e as { message?: unknown }).message ? (e as { message: string }).message : fb;

export default function Dashboard() {
  const user = authService.currentUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => readDashboardFilters(searchParams), [searchParams]);
  const [tasksState, setTasksState] = useState<Resource<MyTaskDto>>({ items: [], loading: true, error: '' });
  const [groupsState, setGroupsState] = useState<Resource<GroupDto>>({ items: [], loading: true, error: '' });
  const [taskAttempt, setTaskAttempt] = useState(0);
  const [groupAttempt, setGroupAttempt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    const onFocus = () => setNow(Date.now());
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, []);

  const taskKey = `${taskAttempt}:${user?.id ?? ''}`;
  const groupKey = `${groupAttempt}:${user?.id ?? ''}`;
  const [lastTaskKey, setLastTaskKey] = useState(taskKey);
  const [lastGroupKey, setLastGroupKey] = useState(groupKey);
  if (lastTaskKey !== taskKey) {
    setLastTaskKey(taskKey);
    setTasksState({ items: [], loading: true, error: '' });
  }
  if (lastGroupKey !== groupKey) {
    setLastGroupKey(groupKey);
    setGroupsState({ items: [], loading: true, error: '' });
  }

  useEffect(() => {
    let cancelled = false;
    dashboardService.myTasks()
      .then(items => { if (!cancelled) setTasksState({ items, loading: false, error: '' }); })
      .catch(e => { if (!cancelled) setTasksState({ items: [], loading: false, error: errMsg(e, 'Không tải được công việc. Vui lòng thử lại.') }); });
    return () => { cancelled = true; };
  }, [taskKey]);

  useEffect(() => {
    let cancelled = false;
    groupsService.myGroups()
      .then(items => { if (!cancelled) setGroupsState({ items, loading: false, error: '' }); })
      .catch(e => { if (!cancelled) setGroupsState({ items: [], loading: false, error: errMsg(e, 'Không tải được nhóm. Vui lòng thử lại.') }); });
    return () => { cancelled = true; };
  }, [groupKey]);

  const refreshAll = () => { setTaskAttempt(a => a + 1); setGroupAttempt(a => a + 1); };

  const model = useMemo(() => buildDashboardModel(tasksState.items, filters, now), [tasksState.items, filters, now]);

  const [searchDraft, setSearchDraft] = useState(filters.search);
  const [lastAppliedSearch, setLastAppliedSearch] = useState(filters.search);
  if (lastAppliedSearch !== filters.search) {
    setLastAppliedSearch(filters.search);
    setSearchDraft(filters.search);
  }
  const commitSearch = () => { if (searchDraft !== filters.search) updateFilters({ q: searchDraft || null }); };

  const updateFilters = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) { if (!value) next.delete(key); else next.set(key, value); }
    next.delete('page');
    setSearchParams(next, { replace: true });
  };
  const clearFilters = () => setSearchParams(new URLSearchParams(), { replace: true });
  const setPage = (p: number) => {
    const next = new URLSearchParams(searchParams);
    if (p <= 1) next.delete('page'); else next.set('page', String(p));
    setSearchParams(next, { replace: true });
  };
  const selectPeriod = (period: DashboardPeriod) => updateFilters({ period: period === 'all' ? null : period, date: null });
  const pureSelected = (label: string) => {
    if (filters.search || filters.project || filters.date) return false;
    if (label === 'all') return filters.status === '' && filters.period === 'all';
    if (label === 'inProgress') return filters.status === 'InProgress' && filters.period === 'all';
    if (label === 'submitted') return filters.status === 'Submitted' && filters.period === 'all';
    return filters.period === 'overdue' && filters.status === '';
  };
  const statSelect = (k: string) => {
    const next = new URLSearchParams();
    if (k === 'inProgress') next.set('status', 'InProgress');
    else if (k === 'submitted') next.set('status', 'Submitted');
    else if (k === 'overdue') next.set('period', 'overdue');
    setSearchParams(next, { replace: true });
  };
  const STATS = [
    { k: 'all', label: 'Việc đang mở', value: model.summary.all, danger: false },
    { k: 'inProgress', label: 'Đang thực hiện', value: model.summary.inProgress, danger: false },
    { k: 'submitted', label: 'Chờ duyệt', value: model.summary.submitted, danger: false },
    { k: 'overdue', label: 'Quá hạn', value: model.summary.overdue, danger: model.summary.overdue > 0 },
  ];

  const projectMissing = filters.project && !model.projects.some(p => p.id === filters.project);
  const activeChips: string[] = [];
  if (filters.period === 'today') activeChips.push('Hôm nay');
  if (filters.period === 'overdue') activeChips.push('Quá hạn');
  if (filters.date) activeChips.push(`Ngày ${formatDate(`${filters.date}T00:00:00+07:00`)}`);
  if (filters.project) activeChips.push(`Dự án: ${model.projects.find(p => p.id === filters.project)?.name ?? 'Không còn trong danh sách'}`);
  if (filters.status) activeChips.push(`Trạng thái: ${STATUS_LABEL[filters.status] ?? filters.status}`);

  const taskNav = (t: MyTaskDto) => {
    const time = deadlineTime(t.deadlineAt);
    const isOverdue = time !== null && time < now;
    return (
      <li key={t.id} className="border-b border-slate-100 last:border-0">
        <Link to={`/tasks/${t.id}`} state={NAV_STATE}
          className="group grid grid-cols-[minmax(0,1fr)_20px] items-center gap-x-3 gap-y-2 rounded-lg px-2 py-4 hover:bg-slate-50">
          <span className="min-w-0">
            <span title={t.title} className="block text-base font-semibold text-slate-900 group-hover:text-primary-700 [overflow-wrap:anywhere] line-clamp-2">{t.title}</span>
            <span title={t.projectName} className="mt-0.5 block truncate text-sm text-slate-600">{t.projectName}</span>
          </span>
          <Icon name="chevron-right" size={18} className="col-start-2 row-start-1 row-span-2 text-slate-500" />
          <span className="col-start-1 flex min-w-0 flex-wrap items-center gap-2">
            <Badge value={t.priority} className={t.priority === 'Urgent' ? '!text-danger-700' : ''}>{PRIORITY_LABEL[t.priority] ?? t.priority}</Badge>
            <Badge value={t.status} className={t.status === 'ChangesRequested' ? '!text-danger-700' : ''}>{STATUS_LABEL[t.status] ?? t.status}</Badge>
            <span className={`basis-full text-sm sm:basis-auto ${isOverdue ? 'text-danger-700 font-medium' : 'text-slate-600'}`}>
              {time === null ? 'Chưa đặt hạn' : `${isOverdue ? 'Quá hạn · ' : ''}${formatDateTime(t.deadlineAt!)}`}
            </span>
          </span>
        </Link>
      </li>
    );
  };

  const filterControls = (
    <div className="mt-4 space-y-3">
      <Input id="dashboard-search" label="Tìm công việc" type="search" value={searchDraft}
        placeholder="Tên công việc hoặc dự án — nhấn Enter để lọc"
        onChange={e => setSearchDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitSearch(); } }}
        onBlur={commitSearch}
        className="rounded-xl" />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="dashboard-project" className="block text-sm font-medium text-slate-700 mb-1">Dự án</label>
          <select id="dashboard-project" value={filters.project} onChange={e => updateFilters({ project: e.target.value || null })}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-2">
            <option value="">Tất cả dự án</option>
            {model.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            {projectMissing && <option value={filters.project}>Dự án không còn trong danh sách</option>}
          </select>
        </div>
        <div>
          <label htmlFor="dashboard-status" className="block text-sm font-medium text-slate-700 mb-1">Trạng thái</label>
          <select id="dashboard-status" value={filters.status} onChange={e => updateFilters({ status: e.target.value || null })}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-2">
            <option value="">Tất cả trạng thái</option>
            {(['ToDo', 'InProgress', 'Submitted', 'ChangesRequested'] as const).map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
      </div>
      {model.hasFilters && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-600">Đang lọc</span>
          {activeChips.map(c => <Badge key={c} className="max-w-full [overflow-wrap:anywhere]">{c}</Badge>)}
          <button onClick={clearFilters} className="min-h-9 text-primary-700 font-medium hover:underline">Xóa bộ lọc</button>
        </div>
      )}
    </div>
  );

  const taskList = (
    <>
      <p role="status" aria-live="polite" className="mt-4 text-sm text-slate-600">
        {model.total ? `${model.from}–${model.to} trong ${model.total} công việc` : '0 công việc phù hợp'}
      </p>
      {model.total === 0 ? (
        model.hasFilters ? (
          <div className="py-8 text-center">
            <Icon name="tasks" size={32} className="mx-auto text-slate-500" />
            <p className="mt-3 font-medium text-slate-900">Không có công việc khớp bộ lọc</p>
            <p className="mt-1 text-sm text-slate-600">Thử đổi từ khóa, dự án hoặc ngày đến hạn.</p>
            <Button variant="secondary" className="mt-4" onClick={clearFilters}>Xóa bộ lọc</Button>
          </div>
        ) : (
          <div className="py-8 text-center">
            <Icon name="tasks" size={32} className="mx-auto text-slate-500" />
            <p className="mt-3 font-medium text-slate-900">Bạn chưa có công việc đang mở</p>
            <p className="mt-1 text-sm text-slate-600">Các công việc được giao sẽ xuất hiện tại đây.</p>
            <Link to={groupsState.loading || groupsState.error || groupsState.items.length ? '/groups' : '/join-group'}
              className="mt-4 inline-block text-primary-700 font-medium hover:underline">
              {groupsState.items.length || groupsState.loading || groupsState.error ? 'Mở nhóm của tôi' : 'Tạo hoặc tham gia nhóm'}
            </Link>
          </div>
        )
      ) : (
        <ul className="mt-2">{model.pageTasks.map(taskNav)}</ul>
      )}
      {model.pageCount > 1 && (
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <Button variant="secondary" size="sm" aria-label="Trang trước" disabled={model.page <= 1} onClick={() => setPage(model.page - 1)} className="min-h-11 gap-1">
            <Icon name="chevron-left" size={16} /><span className="hidden sm:inline">Trang trước</span>
          </Button>
          <span className="text-sm text-slate-600 whitespace-nowrap">Trang {model.page} / {model.pageCount}</span>
          <Button variant="secondary" size="sm" aria-label="Trang sau" disabled={model.page >= model.pageCount} onClick={() => setPage(model.page + 1)} className="min-h-11 gap-1">
            <span className="hidden sm:inline">Trang sau</span><Icon name="chevron-right" size={16} />
          </Button>
        </div>
      )}
    </>
  );

  const skeletonRows = (
    <div aria-hidden="true" className="mt-4 space-y-4 motion-safe:animate-pulse">
      {[0, 1, 2].map(i => <div key={i} className="h-14 rounded-lg bg-slate-100" />)}
    </div>
  );

  return (
    <MainLayout>
      <div className="dashboard-surface space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold text-slate-900 break-words">Chào {user?.displayName || 'bạn'},</h2>
            <p className="mt-2 text-base text-slate-600">Theo dõi những công việc đang mở được giao cho bạn.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={refreshAll} disabled={tasksState.loading || groupsState.loading}>Làm mới</Button>
            <Link to="/join-group" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"><Icon name="plus" size={18} />Tạo / tham gia nhóm</Link>
          </div>
        </header>

        {tasksState.loading ? (
          <section aria-label="Thống kê công việc được giao">
            <div aria-hidden="true" className="rounded-2xl border border-slate-200 bg-white grid grid-cols-2 lg:grid-cols-4 overflow-hidden motion-safe:animate-pulse">
              {[0, 1, 2, 3].map(i => <div key={i} className="min-h-24 p-4 sm:p-5"><div className="h-4 w-20 rounded bg-slate-100" /><div className="mt-3 h-8 w-12 rounded bg-slate-100" /></div>)}
            </div>
          </section>
        ) : !tasksState.error ? (
          <section aria-label="Thống kê công việc được giao">
            <div className="rounded-2xl border border-slate-200 bg-white grid grid-cols-2 lg:grid-cols-4 overflow-hidden">
              {STATS.map(s => (
                <button key={s.k} type="button" aria-pressed={pureSelected(s.k)} aria-label={`Lọc công việc: ${s.label}`}
                  aria-describedby={`dashboard-stat-count-${s.k}`}
                  onClick={() => statSelect(s.k)}
                  className={`dashboard-stat min-h-24 p-4 sm:p-5 text-left ${pureSelected(s.k) ? 'bg-primary-50' : 'bg-white hover:bg-slate-50'}`}>
                  <span className={`block text-sm font-medium ${pureSelected(s.k) ? 'text-primary-700' : 'text-slate-600'}`}>{s.label}</span>
                  <span id={`dashboard-stat-count-${s.k}`} className={`mt-1 block text-3xl font-semibold tabular-nums ${s.danger ? 'text-danger-700' : 'text-slate-900'}`}>{s.value}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_336px]">
          <section id="dashboard-tasks" className="min-w-0 scroll-mt-24" aria-labelledby="dashboard-task-title">
            <Card className="p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 id="dashboard-task-title" tabIndex={-1} className="text-lg font-semibold text-slate-900">Công việc của bạn</h3>
                <div role="group" aria-label="Lọc theo hạn" className="flex flex-wrap gap-0">
                  {([['all', 'Tất cả'], ['today', 'Hôm nay'], ['overdue', 'Quá hạn']] as [DashboardPeriod, string][]).map(([k, l]) => (
                    <button key={k} type="button" aria-pressed={filters.period === k && !filters.date} onClick={() => selectPeriod(k)}
                      className={`min-h-11 rounded-lg px-3 text-sm font-medium border ${filters.period === k && !filters.date ? 'bg-primary-50 text-primary-700 border-primary-600' : 'text-slate-600 border-transparent hover:bg-slate-100'}`}>{l}</button>
                  ))}
                </div>
              </div>
              {tasksState.loading ? (
                <>
                  <div aria-hidden="true" className="mt-4 space-y-3 motion-safe:animate-pulse">
                    <div className="h-11 rounded-xl bg-slate-100" />
                    <div className="grid gap-3 sm:grid-cols-2">
                      {[0, 1].map(i => <div key={i} className="h-11 rounded-xl bg-slate-100" />)}
                    </div>
                  </div>
                  <p role="status" className="sr-only">Đang tải công việc…</p>
                  {skeletonRows}
                </>
              ) : tasksState.error ? (
                <div className="mt-4">
                  <p role="alert" className="text-sm text-danger-700 [overflow-wrap:anywhere]">{tasksState.error}</p>
                  <Button variant="secondary" className="mt-3" onClick={() => setTaskAttempt(a => a + 1)}>Thử lại</Button>
                </div>
              ) : (
                <>{filterControls}{taskList}</>
              )}
            </Card>
          </section>

          <aside id="dashboard-calendar" className="min-w-0 scroll-mt-24" aria-label="Lịch hạn công việc">
            <Card className="p-4 sm:p-6">
              <h3 className="text-lg font-semibold text-slate-900">Lịch hạn công việc</h3>
              <p className="mt-1 text-sm text-slate-600">Chọn ngày để lọc danh sách công việc.</p>
              {tasksState.loading ? (
                <div aria-hidden="true" className="mt-4 grid grid-cols-7 gap-1 motion-safe:animate-pulse">
                  {Array.from({ length: 28 }, (_, i) => <div key={i} className="min-h-10 rounded-lg bg-slate-100" />)}
                </div>
              ) : tasksState.error ? (
                <p className="mt-4 text-sm text-slate-600">Lịch hạn chưa sẵn sàng</p>
              ) : (
                <>
                  <div className="mt-3">
                    <MiniCalendar tasks={model.calendarTasks} selectedDate={filters.date} today={model.today}
                      onSelect={k => updateFilters({ date: k, period: null })} />
                  </div>
                  {(filters.search || filters.project || filters.status) && (
                    <p className="mt-2 text-xs text-slate-600">Lịch đang theo bộ lọc tìm kiếm, dự án và trạng thái.</p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-sm">
                    <span className="flex items-center gap-2 text-slate-600 whitespace-nowrap"><span aria-hidden="true" className="w-2 h-2 rounded-full bg-primary-600" />Có công việc đến hạn</span>
                    <Link to="/calendar" className="min-h-9 inline-flex items-center text-primary-700 font-medium hover:underline whitespace-nowrap">Mở lịch đầy đủ</Link>
                  </div>
                  {filters.date && <a href="#dashboard-tasks" className="mt-2 inline-block text-sm text-primary-700 hover:underline">Xem công việc ngày đã chọn</a>}
                </>
              )}
              {!tasksState.error && <div className="mt-5 border-t border-slate-200 pt-5">
                <h4 className="font-semibold text-slate-900">Sắp đến hạn</h4>
                {tasksState.loading ? (
                  <p className="mt-2 text-sm text-slate-600">Đang tải công việc…</p>
                ) : model.upcoming.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-600">Chưa có công việc sắp đến hạn trong danh sách này.</p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {model.upcoming.map(t => (
                      <li key={t.id}>
                        <Link to={`/tasks/${t.id}`} state={NAV_STATE} className="block group min-w-0">
                          <span className="block text-base font-medium text-slate-900 group-hover:text-primary-700 [overflow-wrap:anywhere]">{t.title}</span>
                          <span className="block text-sm text-slate-600 [overflow-wrap:anywhere]">{t.projectName} · {formatDateTime(t.deadlineAt!)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>}
            </Card>
          </aside>
        </div>

        <section aria-labelledby="dashboard-groups-title" className="min-w-0">
          <Card className="p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="dashboard-groups-title" className="text-lg font-semibold text-slate-900">Nhóm của tôi</h3>
              <Link to="/groups" className="text-sm text-primary-700 font-medium hover:underline">Xem tất cả nhóm</Link>
            </div>
            {groupsState.loading ? (
              <>
                <p role="status" className="sr-only">Đang tải nhóm…</p>
                <div aria-hidden="true" className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-3 motion-safe:animate-pulse">
                  {[0, 1].map(i => <div key={i} className="h-14 rounded-lg bg-slate-100" />)}
                </div>
              </>
            ) : groupsState.error ? (
              <div className="mt-3">
                <p role="alert" className="text-sm text-danger-700 [overflow-wrap:anywhere]">{groupsState.error}</p>
                <Button variant="secondary" className="mt-3" onClick={() => setGroupAttempt(a => a + 1)}>Thử lại</Button>
              </div>
            ) : groupsState.items.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">Bạn chưa thuộc nhóm nào. <Link to="/join-group" className="min-h-11 inline-flex items-center text-primary-700 font-medium hover:underline">Tạo hoặc tham gia nhóm</Link></p>
            ) : (
              <ul className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-1">
                {groupsState.items.slice(0, 4).map(g => (
                  <li key={g.id}>
                    <Link to={`/groups/${g.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 -mx-2 hover:bg-slate-50 min-w-0">
                      <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-sm font-semibold text-primary-700">
                        {g.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                      </span>
                      <span className="min-w-0">
                        <span title={g.name} className="block truncate text-base font-medium text-slate-900">{g.name}</span>
                        <span className="block text-sm text-slate-600">{g.myRole === 'Leader' ? 'Trưởng nhóm' : 'Thành viên'} · {g.memberCount} thành viên</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      </div>
    </MainLayout>
  );
}
