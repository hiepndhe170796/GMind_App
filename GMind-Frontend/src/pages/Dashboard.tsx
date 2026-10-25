import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { authService } from '../services/auth';
import { groupsService, type GroupDto } from '../services/groups';

export default function Dashboard() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<GroupDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authService.isLoggedIn()) { navigate('/login'); return; }
    groupsService.myGroups()
      .then(setGroups)
      .catch(e => setError(e?.message || 'Không tải được nhóm'))
      .finally(() => setLoading(false));
  }, [navigate]);

  return (
    <MainLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Nhóm của tôi</h1>
        <Link to="/join-group"><Button>Tạo / Tham gia nhóm</Button></Link>
      </div>
      {loading && <LoadingSpinner />}
      {error && <p className="text-danger-600">{error}</p>}
      {!loading && groups.length === 0 && (
        <Card><p className="text-neutral-600 dark:text-neutral-400">Bạn chưa có nhóm nào. Tạo nhóm mới hoặc tham gia bằng mã mời.</p></Card>
      )}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {groups.map(g => (
          <Link key={g.id} to={`/groups/${g.id}`}>
            <Card variant="outlined" className="hover:shadow-md transition-shadow h-full">
              <div className="flex items-start justify-between">
                <h3 className="font-semibold text-lg">{g.name}</h3>
                <Badge variant={g.myRole === 'Leader' ? 'primary' : 'neutral'}>{g.myRole}</Badge>
              </div>
              {g.description && <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-2">{g.description}</p>}
              <p className="text-xs text-neutral-500 mt-3">{g.memberCount} thành viên</p>
            </Card>
          </Link>
        ))}
      </div>
    </MainLayout>
  );
}
