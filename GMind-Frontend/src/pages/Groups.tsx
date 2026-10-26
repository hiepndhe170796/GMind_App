import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Icon from '../components/ui/Icon';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { groupsService, type GroupDto } from '../services/groups';

export default function Groups() {
  const [groups, setGroups] = useState<GroupDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    groupsService.myGroups()
      .then(g => { if (!cancelled) { setGroups(g); setLoading(false); } })
      .catch(e => { if (!cancelled) { setError(e?.message || 'Không tải được danh sách nhóm'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [attempt]);

  return (
    <MainLayout>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h2 className="text-xl font-semibold text-slate-900">Nhóm của bạn</h2>
        <Link to="/join-group"><Button size="md"><Icon name="plus" size={16} />Tạo / tham gia nhóm</Button></Link>
      </div>
      {loading && <LoadingSpinner />}
      {!loading && error && (
        <Card>
          <p role="alert" className="text-sm text-danger-600 mb-3">{error}</p>
          <Button variant="secondary" size="sm" onClick={() => setAttempt(a => a + 1)}>Thử lại</Button>
        </Card>
      )}
      {!loading && !error && groups.length === 0 && (
        <Card><p className="text-sm text-slate-500">Bạn chưa thuộc nhóm nào. Tạo nhóm mới hoặc tham gia bằng mã mời.</p></Card>
      )}
      {!loading && !error && groups.length > 0 && (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {groups.map(g => (
            <Link key={g.id} to={`/groups/${g.id}`} className="block min-w-0">
              <Card className="h-full hover:border-primary-300 hover:shadow-card transition-all">
                <div className="flex items-start gap-3">
                  <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-primary-100 text-primary-700 font-semibold shrink-0">
                    {g.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-800">{g.name}</p>
                    {g.description && <p className="truncate text-xs text-slate-400 mt-0.5">{g.description}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-4 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 text-violet-700 px-2.5 py-0.5 font-medium">
                    {g.myRole === 'Leader' ? 'Trưởng nhóm' : 'Thành viên'}
                  </span>
                  <span>{g.memberCount} thành viên</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </MainLayout>
  );
}
