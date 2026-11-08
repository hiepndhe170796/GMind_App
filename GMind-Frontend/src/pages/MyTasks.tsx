import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Icon from '../components/ui/Icon';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import '../components/tasks/tasks.css';
import { dashboardService, type MyTaskDto } from '../services/dashboard';
import { authService } from '../services/auth';
import { formatDate, formatDateTime, STATUS_LABEL, PRIORITY_LABEL } from '../utils/presentation';
import { buildDashboardModel, deadlineTime, readDashboardFilters, type DashboardPeriod } from '../components/dashboard/dashboard-model';

const NAV_STATE = (search: string) => ({ navigationSection: '/my-tasks', returnTo: `/my-tasks${search}` });
const errMsg = (e: unknown, fb: string) =>
  typeof (e as { message?: unknown })?.message === 'string' && (e as { message?: unknown }).message ? (e as { message: string }).message : fb;

export default function MyTasks() {
  const location = useLocation();
  const navigate = useNavigate();
  const userId = authService.currentUser()?.id;
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => readDashboardFilters(params), [params]);
  const [state, setState] = useState<{ items: MyTaskDto[]; loading: boolean; error: string }>({ items: [], loading: true, error: '' });
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    const onFocus = () => setNow(Date.now());
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, []);

  const fetchKey = `${attempt}:${userId ?? ''}`;
  const [lastKey, setLastKey] = useState(fetchKey);
  if (lastKey !== fetchKey) {
    setLastKey(fetchKey);
    setState({ items: [], loading: true, error: '' });
  }
  useEffect(() => {
    let cancelled = false;
    if (!authService.isLoggedIn()) { navigate('/login'); return; }
    dashboardService.myTasks()
      .then(items => { if (!cancelled) setState({ items, loading: false, error: '' }); })
      .catch(e => { if (!cancelled) setState({ items: [], loading: false, error: errMsg(e, 'Không tải được công việc. Vui lòng thử lại.') }); });
    return () => { cancelled = true; };
  }, [fetchKey, navigate]);

  const model = useMemo(() => buildDashboardModel(state.items, filters, now), [state.items, filters, now]);

  const updateFilters = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) { if (!value) next.delete(key); else next.set(key, value); }
    next.delete('page');
    setParams(next, { replace: true });
  };
  const clearFilters = () => setParams(new URLSearchParams(), { replace: true });
  const setPage = (p: number) => {
    const next = new URLSearchParams(params);
    if (p <= 1) next.delete('page'); else next.set('page', String(p));
    setParams(next, { replace: true });
  };
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const [lastAppliedSearch, setLastAppliedSearch] = useState(filters.search);
  if (lastAppliedSearch !== filters.search) {
    setLastAppliedSearch(filters.search);
    setSearchDraft(filters.search);
  }
  const commitSearch = () => { if (searchDraft !== filters.search) updateFilters({ q: searchDraft || null }); };
  const projectMissing = filters.project && !model.projects.some(p => p.id === filters.project);
  const chips: string[] = [];
  if (filters.period === 'today') chips.push('Hôm nay');
  if (filters.period === 'overdue') chips.push('Quá hạn');
  if (filters.date) chips.push(`Ngày ${formatDate(`${filters.date}T00:00:00+07:00`)}`);
  if (filters.project) chips.push(`Dự án: ${model.projects.find(p => p.id === filters.project)?.name ?? 'Không còn trong danh sách'}`);
  if (filters.status) chips.push(`Trạng thái: ${STATUS_LABEL[filters.status] ?? filters.status}`);

  const row = (t: MyTaskDto) => {
    const time = deadlineTime(t.deadlineAt);
    const isOverdue = time !== null && time < now;
    return (
      <li key={t.id} className="border-b border-slate-100 last:border-0">
        <Link to={`/tasks/${t.id}`} state={NAV_STATE(location.search)}
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

  return (
    <MainLayout>
      <div className="task-surface space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold text-slate-900">Việc của tôi</h2>
            <p className="mt-2 text-base text-slate-600">Những công việc đang mở được giao cho bạn.</p>
          </div>
          <Button variant="secondary" className="min-h-11" onClick={() => setAttempt(a => a + 1)} disabled={state.loading}>Làm mới</Button>
        </header>

        <Card className="p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-slate-900">Danh sách công việc</h3>
            <div role="group" aria-label="Lọc theo hạn" className="flex flex-wrap gap-0">
              {([['all', 'Tất cả'], ['today', 'Hôm nay'], ['overdue', 'Quá hạn']] as [DashboardPeriod, string][]).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={filters.period === k && !filters.date}
                  onClick={() => updateFilters({ period: k === 'all' ? null : k, date: null })}
                  className={`min-h-11 rounded-lg px-3 text-sm font-medium border ${filters.period === k && !filters.date ? 'bg-primary-50 text-primary-700 border-primary-600' : 'text-slate-600 border-transparent hover:bg-slate-100'}`}>{l}</button>
              ))}
            </div>
          </div>

          {state.loading ? (
            <>
              <p role="status" className="sr-only">Đang tải công việc…</p>
              <div aria-hidden="true" className="mt-4 space-y-3 motion-safe:animate-pulse">
                <div className="h-11 rounded-xl bg-slate-100" />
                <div className="grid gap-3 md:grid-cols-3">{[0, 1, 2].map(i => <div key={i} className="h-11 rounded-xl bg-slate-100" />)}</div>
                {[0, 1, 2].map(i => <div key={i} className="h-14 rounded-lg bg-slate-100" />)}
              </div>
            </>
          ) : state.error ? (
            <div className="mt-4">
              <p role="alert" className="text-sm text-danger-700 [overflow-wrap:anywhere]">{state.error}</p>
              <Button variant="secondary" className="mt-3" onClick={() => setAttempt(a => a + 1)}>Thử lại</Button>
            </div>
          ) : (
            <>
              <div className="mt-4 space-y-3">
                <Input id="mytasks-search" label="Tìm công việc" type="search" value={searchDraft}
                  placeholder="Tên công việc hoặc dự án — nhấn Enter để lọc"
                  onChange={e => setSearchDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitSearch(); } }}
                  onBlur={commitSearch}
                  className="rounded-xl" />
                <div className="grid gap-3 md:grid-cols-3 min-w-0">
                  <div className="min-w-0">
                    <label htmlFor="mytasks-project" className="block text-sm font-medium text-slate-700 mb-1">Dự án</label>
                    <select id="mytasks-project" value={filters.project} onChange={e => updateFilters({ project: e.target.value || null })}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-2">
                      <option value="">Tất cả dự án</option>
                      {model.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      {projectMissing && <option value={filters.project}>Dự án không còn trong danh sách</option>}
                    </select>
                  </div>
                  <div className="min-w-0">
                    <label htmlFor="mytasks-status" className="block text-sm font-medium text-slate-700 mb-1">Trạng thái</label>
                    <select id="mytasks-status" value={filters.status} onChange={e => updateFilters({ status: e.target.value || null })}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-2">
                      <option value="">Tất cả trạng thái</option>
                      {(['ToDo', 'InProgress', 'Submitted', 'ChangesRequested'] as const).map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>
                  </div>
                  <div className="min-w-0">
                    <Input id="mytasks-date" label="Ngày đến hạn" type="date" value={filters.date ?? ''}
                      onChange={e => updateFilters({ date: e.target.value || null, period: null })} className="rounded-xl" />
                    <p className="mt-1 text-xs text-slate-600">Theo giờ Việt Nam.</p>
                  </div>
                </div>
                {model.hasFilters && (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-slate-600">Đang lọc</span>
                    {chips.map(c => <Badge key={c} className="max-w-full [overflow-wrap:anywhere]">{c}</Badge>)}
                    <button onClick={clearFilters} className="min-h-9 text-primary-700 font-medium hover:underline">Xóa bộ lọc</button>
                  </div>
                )}
              </div>

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
                    <p className="mt-1 text-sm text-slate-600">Công việc được giao sẽ xuất hiện tại đây.</p>
                    <Link to="/groups" className="mt-4 min-h-11 inline-flex items-center text-primary-700 font-medium hover:underline">Mở nhóm của tôi</Link>
                  </div>
                )
              ) : (
                <ul className="mt-2">{model.pageTasks.map(row)}</ul>
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
          )}
        </Card>
      </div>
    </MainLayout>
  );
}
