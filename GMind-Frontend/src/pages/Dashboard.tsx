import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Icon from '../components/ui/Icon';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import Button from '../components/ui/Button';
import MiniCalendar from '../components/dashboard/MiniCalendar';
import { dashboardService, type MyTaskDto } from '../services/dashboard';
import { groupsService, type GroupDto } from '../services/groups';
import { authService } from '../services/auth';
import { dayKey, formatDate, timestamp, STATUS_LABEL, PRIORITY_LABEL } from '../utils/presentation';

type Tab = 'all' | 'today' | 'overdue';

export default function Dashboard() {
  const user = authService.currentUser();
  const [groups, setGroups] = useState<GroupDto[]>([]);
  const [tasks, setTasks] = useState<MyTaskDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    Promise.all([groupsService.myGroups(), dashboardService.myTasks()])
      .then(([g, t]) => { if (!cancelled) { setGroups(g); setTasks(t); setLoading(false); } })
      .catch(e => { if (!cancelled) { setError(e?.message || 'Không tải được dữ liệu'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [attempt]);

  const openTasks = tasks;
  const today = dayKey(new Date().toISOString());
  const overdue = openTasks.filter(t => t.deadlineAt && timestamp(t.deadlineAt).getTime() < Date.now());
  const stats = [
    { label: 'Việc đang mở', value: openTasks.length },
    { label: 'Đang thực hiện', value: openTasks.filter(t => t.status === 'InProgress').length },
    { label: 'Chờ duyệt', value: openTasks.filter(t => t.status === 'Submitted').length },
    { label: 'Quá hạn', value: overdue.length },
  ];

  const filtered = useMemo(() => openTasks.filter(t => {
    if (tab === 'today' && (!t.deadlineAt || dayKey(t.deadlineAt) !== today)) return false;
    if (tab === 'overdue' && !overdue.includes(t)) return false;
    if (selectedDate && (!t.deadlineAt || dayKey(t.deadlineAt) !== selectedDate)) return false;
    const q = search.trim().toLowerCase();
    if (q && !t.title.toLowerCase().includes(q) && !(t.projectName ?? '').toLowerCase().includes(q)) return false;
    return true;
  }), [openTasks, tab, overdue, selectedDate, search, today]);

  const upcoming = useMemo(() => openTasks
    .filter(t => t.deadlineAt)
    .sort((a, b) => timestamp(a.deadlineAt!).getTime() - timestamp(b.deadlineAt!).getTime())
    .slice(0, 3), [openTasks]);

  return (
    <MainLayout>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Chào {user?.displayName},</h2>
          <p className="text-sm text-slate-500 mt-1">Cùng nhóm hoàn thành những việc quan trọng hôm nay.</p>
        </div>
        <Link to="/join-group"><Button size="md"><Icon name="plus" size={16} />Tạo / tham gia nhóm</Button></Link>
      </div>

      {loading && <LoadingSpinner />}
      {!loading && error && (
        <Card className="mb-6">
          <p role="alert" className="text-sm text-danger-600 mb-3">{error}</p>
          <Button variant="secondary" size="sm" onClick={() => setAttempt(a => a + 1)}>Thử lại</Button>
        </Card>
      )}

      {!loading && !error && (
        <>
          <section aria-label="Công việc được giao cho bạn" className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {stats.map(s => (
              <Card key={s.label} className="!p-4">
                <p className="text-xs text-slate-500">{s.label}</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{s.value}</p>
              </Card>
            ))}
          </section>
          <p className="text-xs text-slate-400 -mt-4 mb-6">Công việc được giao cho bạn</p>

          <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-6">
            <div className="space-y-6 min-w-0">
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <h3 className="font-semibold">Công việc cần chú ý</h3>
                  <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
                    {([['all', 'Tất cả'], ['today', 'Hôm nay'], ['overdue', 'Quá hạn']] as [Tab, string][]).map(([k, l]) => (
                      <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === k ? 'bg-white text-primary-600 shadow-sm' : 'text-slate-500'}`}>{l}</button>
                    ))}
                  </div>
                </div>
                <div className="relative mb-4">
                  <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input aria-label="Tìm công việc hoặc dự án" value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm theo tên công việc hoặc dự án..."
                    className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
                </div>
                {selectedDate && (
                  <div className="flex items-center gap-2 mb-3 text-sm">
                    <Badge>Lọc theo ngày {formatDate(`${selectedDate}T00:00:00+07:00`)}</Badge>
                    <button className="text-primary-600 text-xs hover:underline" onClick={() => setSelectedDate(null)}>Xóa bộ lọc</button>
                  </div>
                )}
                {filtered.length === 0 ? (
                  <p className="text-sm text-slate-500 py-6 text-center">Không có công việc phù hợp. Thử đổi bộ lọc hoặc kiểm tra lại nhóm của bạn.</p>
                ) : (
                  <ul className="divide-y divide-[#e7ecf4]">
                    {filtered.slice(0, 6).map(t => {
                      const isOver = t.deadlineAt && timestamp(t.deadlineAt).getTime() < Date.now();
                      return (
                        <li key={t.id}>
                          <Link to={`/tasks/${t.id}`} className="grid grid-cols-[24px_minmax(0,1fr)] sm:flex items-center gap-x-3 gap-y-2 py-3 group min-w-0">
                            <span className="row-span-2 sm:row-span-1 flex items-center justify-center w-6 h-6 rounded-full border-2 border-slate-200 text-slate-400 shrink-0 group-hover:border-primary-400">
                              <Icon name="check" size={12} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-slate-800 group-hover:text-primary-600">{t.title}</span>
                              <span className="block truncate text-xs text-slate-400">{t.projectName}</span>
                            </span>
                            <span className="col-start-2 flex flex-wrap items-center gap-2 sm:justify-end">
                              <Badge value={t.priority}>{PRIORITY_LABEL[t.priority] ?? t.priority}</Badge>
                              <Badge value={t.status}>{STATUS_LABEL[t.status] ?? t.status}</Badge>
                              <span className={`text-xs ${isOver ? 'text-danger-600 font-medium' : 'text-slate-400'}`}>{formatDate(t.deadlineAt)}</span>
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {filtered.length > 0 && <Link to="/my-tasks" className="block text-center text-sm text-primary-600 hover:underline mt-4">Xem tất cả</Link>}
              </Card>

              <Card>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">Nhóm của bạn</h3>
                  <Link to="/groups" className="text-sm text-primary-600 hover:underline">Xem tất cả</Link>
                </div>
                {groups.length === 0 ? (
                  <p className="text-sm text-slate-500">Bạn chưa thuộc nhóm nào. <Link to="/join-group" className="text-primary-600 hover:underline">Tạo hoặc tham gia nhóm</Link></p>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-3">
                    {groups.map(g => (
                      <Link key={g.id} to={`/groups/${g.id}`}
                        className="flex items-center gap-3 rounded-xl border border-[#e7ecf4] p-3 hover:border-primary-300 hover:bg-primary-50/40 transition-colors min-w-0">
                        <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary-100 text-primary-700 font-semibold shrink-0">
                          {g.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-slate-800">{g.name}</span>
                          <span className="block text-xs text-slate-400">{g.myRole === 'Leader' ? 'Trưởng nhóm' : 'Thành viên'} · {g.memberCount} thành viên</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            <div className="space-y-6 min-w-0">
              <Card>
                <MiniCalendar tasks={openTasks} selectedDate={selectedDate} onSelect={setSelectedDate} />
                <Link to="/calendar" className="block text-center text-sm text-primary-600 hover:underline mt-4">Xem lịch đầy đủ</Link>
              </Card>
              <Card>
                <h3 className="font-semibold mb-3">Hạn gần nhất</h3>
                {upcoming.length === 0 ? (
                  <p className="text-sm text-slate-500">Chưa có công việc nào có hạn.</p>
                ) : (
                  <ul className="space-y-3">
                    {upcoming.map(t => (
                      <li key={t.id}>
                        <Link to={`/tasks/${t.id}`} className="block group min-w-0">
                          <span className="block truncate text-sm font-medium text-slate-800 group-hover:text-primary-600">{t.title}</span>
                          <span className="block text-xs text-slate-400">{formatDate(t.deadlineAt)} · {t.projectName}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        </>
      )}
    </MainLayout>
  );
}
