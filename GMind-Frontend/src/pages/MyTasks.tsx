import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { dashboardService, type MyTaskDto } from '../services/dashboard';
import { authService } from '../services/auth';

const STATUS_BADGE: Record<string, 'neutral' | 'primary' | 'warning' | 'success' | 'danger'> = {
  ToDo: 'neutral', InProgress: 'primary', Submitted: 'warning', ChangesRequested: 'danger', Completed: 'success',
};

export default function MyTasks() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<MyTaskDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authService.isLoggedIn()) { navigate('/login'); return; }
    dashboardService.myTasks()
      .then(setTasks)
      .catch(e => setError(e?.message || 'Không tải được tasks'))
      .finally(() => setLoading(false));
  }, [navigate]);

  return (
    <MainLayout>
      <h1 className="text-3xl font-bold mb-6">Task của tôi</h1>
      {loading && <LoadingSpinner />}
      {error && <p className="text-danger-600">{error}</p>}
      {!loading && tasks.length === 0 && (
        <Card><p className="text-neutral-600 dark:text-neutral-400">Không có task nào đang mở.</p></Card>
      )}
      <div className="space-y-3">
        {tasks.map(t => (
          <Link key={t.id} to={`/projects/${t.projectId}`}>
            <Card variant="outlined" className="hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{t.title}</p>
                  <p className="text-sm text-neutral-500">{t.projectName}</p>
                </div>
                <div className="flex items-center gap-3">
                  {t.deadlineAt && (
                    <span className={`text-sm ${new Date(t.deadlineAt) < new Date() ? 'text-danger-600' : 'text-neutral-500'}`}>
                      {new Date(t.deadlineAt).toLocaleDateString('vi-VN')}
                    </span>
                  )}
                  <Badge variant={STATUS_BADGE[t.status] ?? 'neutral'}>{t.status}</Badge>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </MainLayout>
  );
}
