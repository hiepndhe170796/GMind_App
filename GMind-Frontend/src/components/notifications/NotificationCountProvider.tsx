import { useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { notificationsService } from '../../services/notifications';
import { RealtimeContext } from '../realtime/realtime-context';
import { NotificationCountContext } from './notification-count-context';
const FAIL = (e: unknown) => (e as { status?: number; message?: string });

export function NotificationCountProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const realtime = useContext(RealtimeContext); // null outside ProtectedRoute (tests)
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const version = useRef(0);
  const inflight = useRef<Promise<void> | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async (force = false) => {
    if (!mounted.current || !userId) return;
    if (inflight.current && !force) return inflight.current; // dedupe BEFORE version change
    const v = ++version.current;
    setLoading(true);
    const req = (async () => {
      try {
        const n = await notificationsService.unreadCount();
        if (!mounted.current || v !== version.current) return;
        setCount(n); setError('');
      } catch (e) {
        if (!mounted.current || v !== version.current) return;
        const f = FAIL(e);
        if (f.status === 403 || f.status === 404) setCount(null);
        setError(f.message || 'Không tải được số thông báo');
      } finally {
        if (mounted.current && v === version.current) {
          setLoading(false); inflight.current = null;
        }
      }
    })();
    inflight.current = req;
    return req;
  }, [userId]);

  const clear = useCallback(() => {
    version.current++; inflight.current = null;
    setCount(null); setError(''); setLoading(false);
  }, []);

  // subscribeNotification is stable (memoised events object); status lives in a ref
  // so status changes never re-run this effect, bump version, or refetch.
  const subscribeNotification = realtime?.subscribeNotification;
  const statusRef = useRef(realtime?.status);
  useEffect(() => { statusRef.current = realtime?.status; });

  useEffect(() => {
    mounted.current = true;
    const v = version;
    void Promise.resolve().then(() => refresh());
    const onFocus = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    // Polling is the reconnect fallback: only while realtime is not connected.
    const tick = setInterval(() => {
      if (document.visibilityState === 'visible' && statusRef.current !== 'connected') void refresh();
    }, 60_000);
    const offNotification = subscribeNotification?.(payload => {
      if (mounted.current) setCount(payload.unreadCount);
    });
    return () => {
      mounted.current = false; v.current++; inflight.current = null;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      clearInterval(tick);
      offNotification?.();
    };
  }, [userId, refresh, subscribeNotification]);

  // The hub does not replay events missed while it was down — refetch once when it
  // recovers from reconnecting/disconnected. The initial connecting → connected
  // does not count.
  const status = realtime?.status;
  const prevStatusRef = useRef(status);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (status === 'connected' && (prev === 'reconnecting' || prev === 'disconnected')) void refresh();
  }, [status, refresh]);

  return <NotificationCountContext.Provider value={{ count, loading, error, refresh, clear, setCount }}>{children}</NotificationCountContext.Provider>;
}
