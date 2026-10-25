import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { dashboardService, type MyTaskDto } from '../services/dashboard';
import { authService } from '../services/auth';

export default function Calendar() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<MyTaskDto[]>([]);
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authService.isLoggedIn()) { navigate('/login'); return; }
    dashboardService.myTasks()
      .then(setTasks)
      .catch(e => setError(e?.message || 'Không tải được tasks'))
      .finally(() => setLoading(false));
  }, [navigate]);

  const year = month.getFullYear(), mon = month.getMonth();
  const firstDay = new Date(year, mon, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, mon + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const tasksOn = (day: number) =>
    tasks.filter(t => {
      if (!t.deadlineAt) return false;
      const d = new Date(t.deadlineAt);
      return d.getFullYear() === year && d.getMonth() === mon && d.getDate() === day;
    });

  const prev = () => setMonth(new Date(year, mon - 1, 1));
  const next = () => setMonth(new Date(year, mon + 1, 1));

  return (
    <MainLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Lịch deadline</h1>
        <div className="flex gap-2 items-center">
          <Button variant="ghost" size="sm" onClick={prev}>←</Button>
          <span className="font-medium w-36 text-center">{month.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' })}</span>
          <Button variant="ghost" size="sm" onClick={next}>→</Button>
        </div>
      </div>
      {loading && <LoadingSpinner />}
      {error && <p className="text-danger-600">{error}</p>}
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-neutral-500 mb-1">
        {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map(d => <div key={d} className="py-2">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => (
          <div key={i} className={`min-h-24 border rounded-lg p-1 text-sm ${day ? 'bg-white dark:bg-neutral-900' : 'border-transparent'}`}>
            {day && <div className="text-xs text-neutral-400 mb-1">{day}</div>}
            {day && tasksOn(day).map(t => (
              <Link key={t.id} to={`/tasks/${t.id}`}>
                <div className="text-xs p-1 mb-1 rounded bg-primary-100 dark:bg-primary-900/40 text-primary-800 dark:text-primary-200 truncate hover:bg-primary-200">
                  {t.title}
                </div>
              </Link>
            ))}
          </div>
        ))}
      </div>
      {!loading && tasks.every(t => !t.deadlineAt) && (
        <Card className="mt-4"><p className="text-sm text-neutral-500">Chưa có task nào có deadline.</p></Card>
      )}
    </MainLayout>
  );
}
