import { Suspense, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from '../layouts/AuthLayout';
import MainLayout from '../layouts/MainLayout';
import RouteErrorBoundary from './RouteErrorBoundary';
import RouteSkeleton from './ui/RouteSkeleton';
import Card from './ui/Card';
import Button from './ui/Button';
import { authService } from '../services/auth';
import { getSessionEndReason, getSessionSnapshot, subscribeSession } from '../services/session';
import { prefetchProtectedPages } from '../routes/lazy-pages';
import { RealtimeProvider } from './realtime/RealtimeProvider';
import { NotificationCountProvider } from './notifications/NotificationCountProvider';

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void) => number;
  cancelIdleCallback?: (id: number) => void;
};

export default function ProtectedRoute() {
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot);
  const location = useLocation();
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState(0);
  const [validatedId, setValidatedId] = useState<string | null>(null);
  const [gateError, setGateError] = useState<{ sessionId: string; message: string } | null>(null);
  const sessionId = session?.id;
  const validated = sessionId != null && sessionId === validatedId;

  // Gate only the first validation per session — a different session id re-gates.
  useEffect(() => {
    if (!sessionId || sessionId === validatedId) return;
    let cancelled = false;
    let idle: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    authService.validateSession().then(
      () => {
        if (cancelled) return;
        setValidatedId(sessionId);
        setGateError(null);
        const w = window as IdleWindow;
        if (w.requestIdleCallback) idle = w.requestIdleCallback(() => { prefetchProtectedPages(); });
        else timer = setTimeout(() => { prefetchProtectedPages(); }, 1500);
      },
      (e: unknown) => {
        if (!cancelled) setGateError({ sessionId, message: (e as { message?: string })?.message || 'Không kiểm tra được phiên đăng nhập' });
      },
    );
    return () => {
      cancelled = true;
      if (idle !== undefined) (window as IdleWindow).cancelIdleCallback?.(idle);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [sessionId, validatedId, attempt]);

  // Once validated, revalidate in the background per pathname change (never on
  // query/hash). Failures need no guard UI: a 401 clears the session via the api
  // layer and lands on the redirect branch; other errors surface in the page's
  // own queries.
  const lastPathRef = useRef(location.pathname);
  useEffect(() => {
    if (!validated) return;
    if (lastPathRef.current === location.pathname) return;
    lastPathRef.current = location.pathname;
    void authService.validateSession().catch(() => undefined);
  }, [validated, location.pathname]);

  if (!session) {
    const reason = getSessionEndReason();
    const state = reason === 'passwordChanged'
      ? { passwordChanged: true }
      : reason === 'revoked'
        ? { sessionRevoked: true }
        : { from: location.pathname + location.search + location.hash, sessionExpired: true };
    return <Navigate to="/login" replace state={state} />;
  }

  const gateFailed = gateError?.sessionId === session.id ? gateError : null;
  const body = gateFailed ? (
    <AuthLayout>
      <Card variant="elevated">
        <p role="alert" className="text-sm text-danger-600 mb-4">{gateFailed.message}</p>
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
  ) : !validated ? (
    <MainLayout><RouteSkeleton label="Đang kiểm tra phiên đăng nhập…" /></MainLayout>
  ) : (
    <RouteErrorBoundary key={location.pathname}>
      <Suspense fallback={<MainLayout><RouteSkeleton label="Đang tải trang…" /></MainLayout>}>
        <Outlet key={session.id} />
      </Suspense>
    </RouteErrorBoundary>
  );

  // Providers wrap every post-session branch so navigation and the validation
  // gate never restart the hub connection or re-poll the unread count.
  return (
    <RealtimeProvider key={session.id}>
      <NotificationCountProvider key={session.user.id} userId={session.user.id}>
        {body}
      </NotificationCountProvider>
    </RealtimeProvider>
  );
}
