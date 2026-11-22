import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  createRealtimeConnection,
  type RealtimeChanged,
  type RealtimeConnection,
  type RealtimeNotification,
  type RealtimeStatus,
} from '../../services/realtime';
import { notificationTarget } from '../../services/notifications';
import { clearSession, getSessionSnapshot } from '../../services/session';
import { useToast } from '../ui/Toast';
import { RealtimeContext, type RealtimeEvents } from './realtime-context';

const CHANGE_COALESCE_MS = 300;
const BODY_MAX = 120;
const truncate = (text: string, max = BODY_MAX) => (text.length <= max ? text : `${text.slice(0, max - 1)}…`);

/** sid claim of the current access token, for matching session-revoked payloads. */
function currentSid(): string | null {
  const token = getSessionSnapshot()?.accessToken;
  const segment = token?.split('.')[1];
  if (!segment) return null;
  try {
    const claims = JSON.parse(atob(segment.replace(/-/g, '+').replace(/_/g, '/'))) as { sid?: string };
    return claims.sid ?? null;
  } catch {
    return null;
  }
}

const GLOBAL_LIST_NAMES = ['my-tasks', 'leader-queue', 'marketplace-incoming', 'helping', 'my-groups'] as const;

/**
 * One hub connection per app session (remount keyed by session.id in ProtectedRoute).
 * Delivers notification toasts + badge counts, identifier-only change invalidation
 * and session revocation; the browser always re-reads data through authorized APIs.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [status, setStatus] = useState<RealtimeStatus>('connecting');
  const subscribers = useRef({
    notification: new Set<(p: RealtimeNotification) => void>(),
    changed: new Set<(p: RealtimeChanged) => void>(),
    revoked: new Set<(p: { sessionId?: string | null }) => void>(),
  });
  const locationRef = useRef(location.pathname);
  locationRef.current = location.pathname;

  useEffect(() => {
    const uid = getSessionSnapshot()?.user.id;
    const connection: RealtimeConnection = createRealtimeConnection();
    const offStatus = connection.onStatusChange(setStatus);
    let changedTimer: number | null = null;
    const pendingIds = new Set<string>();

    const flushChanged = () => {
      changedTimer = null;
      if (pendingIds.size === 0) return;
      const ids = new Set(pendingIds);
      pendingIds.clear();
      // (a) every user-scoped query whose key array contains a received id
      void queryClient.invalidateQueries({
        predicate: query => query.queryKey.some(part => typeof part === 'string' && ids.has(part)),
      });
      // (b) global lists
      for (const name of GLOBAL_LIST_NAMES) {
        void queryClient.invalidateQueries({
          predicate: query => query.queryKey[0] === 'u' && query.queryKey[1] === uid && query.queryKey[2] === name,
        });
      }
    };

    const offNotification = connection.on('notification', payload => {
      for (const cb of [...subscribers.current.notification]) cb(payload);
      void queryClient.invalidateQueries({
        predicate: query => query.queryKey[0] === 'u' && query.queryKey[1] === uid && query.queryKey[2] === 'notifications',
      });
      if (document.hidden) return;
      if (locationRef.current.startsWith('/notifications')) return;
      const target = notificationTarget({ ...payload, isRead: false });
      toast.info(truncate(payload.body), {
        title: payload.title,
        action: target ? { label: 'Xem', onAction: () => navigate(target.href) } : undefined,
      });
    });

    const offChanged = connection.on('changed', payload => {
      for (const cb of [...subscribers.current.changed]) cb(payload);
      for (const id of [...(payload.taskIds ?? []), ...(payload.projectIds ?? []), ...(payload.groupIds ?? [])]) {
        pendingIds.add(id);
      }
      changedTimer ??= window.setTimeout(flushChanged, CHANGE_COALESCE_MS);
    });

    const offRevoked = connection.on('session-revoked', payload => {
      for (const cb of [...subscribers.current.revoked]) cb(payload);
      const sid = currentSid();
      if (payload.sessionId && sid && payload.sessionId !== sid) return;
      const session = getSessionSnapshot();
      if (session) clearSession(session.id, 'revoked');
    });

    const invalidateAll = () => {
      void queryClient.invalidateQueries({
        predicate: query => query.queryKey[0] === 'u' && query.queryKey[1] === uid,
      });
    };
    const offReconnected = connection.onReconnected(invalidateAll);

    let cancelled = false;
    let failedStart = false;
    let startIssued = false;
    let retryTimer: number | null = null;
    const START_RETRY_MS = 30_000;
    const attemptStart = async (): Promise<void> => {
      while (!cancelled) {
        try {
          startIssued = true;
          await connection.start();
          // A start that followed a failure is a recovery — onreconnected never
          // fires for it, so refetch missed changes the same way.
          if (failedStart) invalidateAll();
          return;
        } catch {
          failedStart = true;
        }
        await new Promise<void>(resolve => { retryTimer = window.setTimeout(resolve, START_RETRY_MS); });
        retryTimer = null;
      }
    };
    // Deferred a tick so StrictMode's mount → unmount → mount never starts a
    // negotiation that is immediately stopped.
    const firstStartTimer = window.setTimeout(() => { void attemptStart(); }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(firstStartTimer);
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      if (changedTimer !== null) window.clearTimeout(changedTimer);
      offStatus(); offNotification(); offChanged(); offRevoked(); offReconnected();
      if (startIssued) void connection.stop().catch(() => undefined);
    };
    // One connection per mount (keyed by session.id upstream); subscribers read latest refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const events = useMemo<RealtimeEvents>(() => ({
    subscribeNotification(cb) { subscribers.current.notification.add(cb); return () => subscribers.current.notification.delete(cb); },
    subscribeChanged(cb) { subscribers.current.changed.add(cb); return () => subscribers.current.changed.delete(cb); },
    subscribeSessionRevoked(cb) { subscribers.current.revoked.add(cb); return () => subscribers.current.revoked.delete(cb); },
  }), []);

  const value = useMemo(() => ({ status, ...events }), [status, events]);
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}
