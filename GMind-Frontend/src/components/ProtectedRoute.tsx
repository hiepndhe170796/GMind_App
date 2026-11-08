import { useEffect, useState, useSyncExternalStore } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from '../layouts/AuthLayout';
import Card from './ui/Card';
import Button from './ui/Button';
import { authService } from '../services/auth';
import { getSessionSnapshot, subscribeSession } from '../services/session';

type Check = { key: string; status: 'ready' } | { key: string; status: 'error'; message: string };

export default function ProtectedRoute() {
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot);
  const location = useLocation();
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState(0);
  const [check, setCheck] = useState<Check | null>(null);
  // These pages store view filters in the query, not a different protected resource.
  const routeKey = (location.pathname === '/calendar' || location.pathname === '/notifications') ? location.pathname : location.key;
  const key = session ? `${session.id}:${routeKey}:${attempt}` : null;

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    authService.validateSession().then(
      () => { if (!cancelled) setCheck({ key, status: 'ready' }); },
      (e: unknown) => { if (!cancelled) setCheck({ key, status: 'error', message: (e as { message?: string })?.message || 'Không kiểm tra được phiên đăng nhập' }); },
    );
    return () => { cancelled = true; };
  }, [key]);

  const currentCheck = check?.key === key ? check : null;

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search + location.hash, sessionExpired: true }} />;
  }
  if (currentCheck?.status === 'error') {
    return (
      <AuthLayout>
        <Card variant="elevated">
          <p role="alert" className="text-sm text-danger-600 mb-4">{currentCheck.message}</p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setAttempt(a => a + 1)}>Thử lại</Button>
            <Button variant="ghost" size="sm" onClick={() => {
              void authService.logout().then((result) => {
                if (getSessionSnapshot()) return;
                navigate('/login', {
                  replace: true,
                  state: result.serverRevoked ? undefined : { logoutWarning: 'Đã đăng xuất trên trình duyệt này. Chưa thể xác nhận thu hồi phiên trên máy chủ; vui lòng kiểm tra kết nối.' },
                });
              });
            }}>Đăng xuất</Button>
          </div>
        </Card>
      </AuthLayout>
    );
  }
  if (currentCheck?.status === 'ready') return <Outlet key={session.id} />;
  return (
    <AuthLayout>
      <p role="status" className="text-sm text-neutral-500">Đang kiểm tra phiên đăng nhập…</p>
    </AuthLayout>
  );
}
