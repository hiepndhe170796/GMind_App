import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { notificationsService } from '../../services/notifications';
import { NotificationCountContext } from './notification-count-context';
const FAIL = (e: unknown) => (e as { status?: number; message?: string });

export function NotificationCountProvider({ userId, children }: { userId: string; children: ReactNode }) {
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

  useEffect(() => {
    mounted.current = true;
    const v = version;
    void Promise.resolve().then(() => refresh());
    const onFocus = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    const tick = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 60_000);
    return () => {
      mounted.current = false; v.current++; inflight.current = null;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      clearInterval(tick);
    };
  }, [userId, refresh]);

  return <NotificationCountContext.Provider value={{ count, loading, error, refresh, clear }}>{children}</NotificationCountContext.Provider>;
}
