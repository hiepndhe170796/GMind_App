import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { notificationsService, type NotificationDto } from '../services/notifications';
import { authService } from '../services/auth';

export default function Notifications() {
  const navigate = useNavigate();
  const [items, setItems] = useState<NotificationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const handleError = (e: unknown, fallback: string) => {
    const failure = e as { status?: number; message?: string };
    if (failure?.status === 403 || failure?.status === 404) setItems([]);
    setError(failure?.message || fallback);
  };
  const reload = () => notificationsService.list().then(setItems).catch(e => { setItems([]); handleError(e, 'Lỗi tải thông báo'); });

  useEffect(() => {
    if (!authService.isLoggedIn()) { navigate('/login'); return; }
    reload().finally(() => setLoading(false));
  }, [navigate]);

  const markRead = async (id: string) => {
    try { await notificationsService.markRead(id); await reload(); }
    catch (e: unknown) { setItems([]); handleError(e, 'Không cập nhật được thông báo'); }
  };
  const markAll = async () => {
    try { await notificationsService.markAllRead(); await reload(); }
    catch (e: unknown) { setItems([]); handleError(e, 'Không cập nhật được thông báo'); }
  };

  return (
    <MainLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Thông báo</h1>
        <Button variant="secondary" size="sm" onClick={markAll}>Đánh dấu tất cả đã đọc</Button>
      </div>
      {loading && <LoadingSpinner />}
      {error && <p role="alert" className="text-danger-600">{error}</p>}
      {!loading && items.length === 0 && <Card><p className="text-neutral-500">Không có thông báo.</p></Card>}
      <div className="space-y-2">
        {items.map(n => (
          <Card key={n.id} variant="outlined" className={n.isRead ? 'opacity-60' : ''}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium">{n.title}</p>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">{n.body}</p>
                <p className="text-xs text-neutral-400 mt-1">{new Date(n.createdAt).toLocaleString('vi-VN')}</p>
              </div>
              {!n.isRead && <Button size="sm" variant="ghost" onClick={() => markRead(n.id)}>Đã đọc</Button>}
            </div>
          </Card>
        ))}
      </div>
    </MainLayout>
  );
}
