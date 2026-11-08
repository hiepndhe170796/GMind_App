import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Icon from '../components/ui/Icon';
import '../components/workspace/workspace.css';
import { Skeleton, ErrorState, EmptyState } from '../components/workspace/WorkspaceUI';
import { errMsg } from '../components/workspace/utils';
import { groupsService, type GroupDto } from '../services/groups';
import { authService } from '../services/auth';

const ROLE_LABEL: Record<string, string> = { Leader: 'Trưởng nhóm', Member: 'Thành viên' };

export default function Groups() {
  const userId = authService.currentUser()?.id;
  const [groups, setGroups] = useState<GroupDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const version = useRef(0);

  const fetchKey = attempt + ':' + (userId ?? '');
  const [lastKey, setLastKey] = useState(fetchKey);
  if (lastKey !== fetchKey) {
    setLastKey(fetchKey); setLoading(true); setError(''); setGroups([]);
    setQ(''); setSearch(''); setRole('');
  }
  useEffect(() => {
    const v = ++version.current;
    groupsService.myGroups()
      .then(g => { if (v === version.current) { setGroups(g); setLoading(false); } })
      .catch(e => { if (v === version.current) { setError(errMsg(e, 'Không tải được danh sách nhóm')); setLoading(false); } });
    const ref = version;
    return () => { ref.current++; };
  }, [attempt, userId]);

  const filtered = useMemo(() => groups.filter(g =>
    (!role || g.myRole === role) &&
    (!search || `${g.name} ${g.description ?? ''}`.toLowerCase().includes(search.toLowerCase()))),
    [groups, role, search]);
  const hasFilters = !!search || !!role;

  return (
    <MainLayout>
      <div className="workspace-surface space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold text-slate-900">Nhóm của tôi</h2>
            <p className="mt-2 text-base text-slate-600">Các nhóm bạn đang tham gia và vai trò của bạn.</p>
          </div>
          <Link to="/join-group" className="workspace-primary inline-flex min-h-11 items-center gap-1.5 rounded-xl px-4 font-medium hover:opacity-95">
            <Icon name="plus" size={16} />Tạo / tham gia nhóm
          </Link>
        </header>

        {loading ? <Skeleton label="Đang tải nhóm…" /> : error ? (
          <Card className="p-4 sm:p-6"><ErrorState message={error} onRetry={() => setAttempt(a => a + 1)} /></Card>
        ) : groups.length === 0 ? (
          <Card className="p-4 sm:p-6">
            <EmptyState title="Bạn chưa thuộc nhóm nào"
              body="Tạo nhóm mới để làm Leader, hoặc tham gia bằng mã mời để làm thành viên."
              action={<Link to="/join-group" className="min-h-11 inline-flex items-center text-primary-700 font-medium hover:underline">Tạo hoặc tham gia nhóm</Link>} />
          </Card>
        ) : (
          <>
            <form className="flex flex-wrap items-end gap-3" role="search" onSubmit={e => { e.preventDefault(); setSearch(q.trim()); }}>
              <div className="min-w-0 w-full sm:flex-1 sm:max-w-xs">
                <label htmlFor="groups-q" className="block text-sm font-medium text-slate-700 mb-1">Tìm nhóm</label>
                <input id="groups-q" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Tên hoặc mô tả nhóm"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-2" />
              </div>
              <div className="min-w-0">
                <label htmlFor="groups-role" className="block text-sm font-medium text-slate-700 mb-1">Vai trò</label>
                <select id="groups-role" value={role} onChange={e => setRole(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-2">
                  <option value="">Tất cả vai trò</option>
                  <option value="Leader">Trưởng nhóm</option>
                  <option value="Member">Thành viên</option>
                </select>
              </div>
              <Button type="submit" variant="secondary" className="min-h-11">Tìm</Button>
              {hasFilters && (
                <button type="button" className="min-h-9 text-primary-700 font-medium hover:underline"
                  onClick={() => { setQ(''); setSearch(''); setRole(''); }}>Xóa lọc</button>
              )}
            </form>
            <p role="status" aria-live="polite" className="text-sm text-slate-600">
              {filtered.length ? `${filtered.length} nhóm` : '0 nhóm phù hợp'}
            </p>
            {filtered.length === 0 ? (
              <Card className="p-4 sm:p-6">
                <EmptyState title="Không có nhóm khớp bộ lọc" body="Thử từ khóa hoặc vai trò khác."
                  action={<button className="min-h-9 text-primary-700 font-medium hover:underline" onClick={() => { setQ(''); setSearch(''); setRole(''); }}>Xóa bộ lọc</button>} />
              </Card>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.map(g => (
                  <li key={g.id} className="min-w-0">
                    <Link to={`/groups/${g.id}`} className="group block h-full min-w-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600">
                      <Card className="h-full p-4 sm:p-5 transition-colors group-hover:border-primary-300">
                        <div className="flex items-start justify-between gap-3 min-w-0">
                          <h3 title={g.name} className="min-w-0 text-base font-semibold text-slate-900 line-clamp-2 [overflow-wrap:anywhere] group-hover:text-primary-700">{g.name}</h3>
                          <Icon name="chevron-right" size={18} className="mt-0.5 shrink-0 text-slate-500" />
                        </div>
                        {g.description && <p className="mt-1.5 line-clamp-2 text-sm text-slate-600 [overflow-wrap:anywhere]">{g.description}</p>}
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          <Badge value={g.myRole}>{ROLE_LABEL[g.myRole] ?? g.myRole}</Badge>
                          <span className="text-sm text-slate-600">{g.memberCount} thành viên</span>
                        </div>
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </MainLayout>
  );
}
