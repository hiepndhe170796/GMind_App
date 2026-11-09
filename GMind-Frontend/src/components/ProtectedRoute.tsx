import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from '../layouts/AuthLayout';
import Card from './ui/Card';
import Button from './ui/Button';
import { authService } from '../services/auth';
import { getSessionEndReason, getSessionSnapshot, subscribeSession } from '../services/session';

type Check = { key: ValidationScope; status: 'ready' } | { key: ValidationScope; status: 'error'; message: string };

type ValidationScope = { sessionId: string; path: string; attempt: number };

export default function ProtectedRoute() {
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot);
  const location = useLocation();
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState(0);
  const [check, setCheck] = useState<Check | null>(null);
  const sessionId = session?.id;
  // Query/hash are filter state, not a new protected resource — the object identity is
  // stable for query-only changes but new on path/session/retry, so a stale ready-check
  // can never be reused across a genuine navigation.
  const key = useMemo<ValidationScope | null>(
    () => (sessionId ? { sessionId, path: location.pathname, attempt } : null),
    [sessionId, location.pathname, attempt],
  );

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const scope = key;
    authService.validateSession().then(
      () => { if (!cancelled) setCheck({ key: scope, status: 'ready' }); },
      (e: unknown) => { if (!cancelled) setCheck({ key: scope, status: 'error', message: (e as { message?: string })?.message || 'Không kiểm tra được phiên đăng nhập' }); },
    );
    return () => { cancelled = true; };
  }, [key]);

  const currentCheck = check?.key === key ? check : null;

  if (!session) {
    const state = getSessionEndReason() === 'passwordChanged'
      ? { passwordChanged: true }
      : { from: location.pathname + location.search + location.hash, sessionExpired: true };
    return <Navigate to="/login" replace state={state} />;
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
