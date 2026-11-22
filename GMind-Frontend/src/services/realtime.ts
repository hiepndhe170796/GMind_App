import { HubConnectionBuilder, LogLevel, type HubConnection, type IRetryPolicy } from '@microsoft/signalr';
import { getFreshAccessToken } from './api';

export type RealtimeStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface RealtimeNotification {
  id: string; type: string; title: string; body: string;
  relatedEntityType?: string | null; relatedEntityId?: string | null;
  groupId?: string | null; createdAt: string; unreadCount: number;
}
export interface RealtimeChanged {
  taskIds?: string[] | null; projectIds?: string[] | null; groupIds?: string[] | null;
}
export interface RealtimeSessionRevoked { sessionId?: string | null }

/** [0, 2000, 5000, 10000] then 30 s forever — spec-mandated reconnect policy. */
export const REALTIME_RETRY_DELAYS = [0, 2000, 5000, 10_000];
const RETRY_FOREVER_MS = 30_000;

export const realtimeRetryDelay = (previousRetryCount: number): number =>
  previousRetryCount < REALTIME_RETRY_DELAYS.length
    ? REALTIME_RETRY_DELAYS[previousRetryCount]
    : RETRY_FOREVER_MS;

export const realtimeRetryPolicy: IRetryPolicy = {
  nextRetryDelayInMilliseconds: retryContext => realtimeRetryDelay(retryContext.previousRetryCount),
};

export const realtimeHubUrl = (): string =>
  `${(import.meta.env.VITE_API_URL ?? '').trim().replace(/\/+$/, '')}/hubs/realtime`;

type Listener = (payload: never) => void;
type EventName = 'notification' | 'changed' | 'session-revoked';

export interface RealtimeConnection {
  readonly status: RealtimeStatus;
  onStatusChange(cb: (status: RealtimeStatus) => void): () => void;
  on(event: 'notification', cb: (payload: RealtimeNotification) => void): () => void;
  on(event: 'changed', cb: (payload: RealtimeChanged) => void): () => void;
  on(event: 'session-revoked', cb: (payload: RealtimeSessionRevoked) => void): () => void;
  onReconnected(cb: () => void): () => void;
  start(): Promise<void>;
  stop(): Promise<void>;
}

/** Creates (but does not start) the per-session hub connection. */
export function createRealtimeConnection(): RealtimeConnection {
  const connection: HubConnection = new HubConnectionBuilder()
    .withUrl(realtimeHubUrl(), { accessTokenFactory: async () => (await getFreshAccessToken()) ?? '' })
    .withAutomaticReconnect(realtimeRetryPolicy)
    .configureLogging(LogLevel.Warning)
    .build();

  let status: RealtimeStatus = 'connecting';
  const statusListeners = new Set<(s: RealtimeStatus) => void>();
  const listeners: Record<EventName, Set<Listener>> = {
    notification: new Set(), changed: new Set(), 'session-revoked': new Set(),
  };
  const reconnectedListeners = new Set<() => void>();

  const setStatus = (next: RealtimeStatus) => {
    if (status === next) return;
    status = next;
    for (const cb of [...statusListeners]) cb(next);
  };
  const emit = (event: EventName, payload: unknown) => {
    for (const cb of [...listeners[event]]) (cb as (p: unknown) => void)(payload);
  };

  connection.on('notification', (p: RealtimeNotification) => emit('notification', p));
  connection.on('changed', (p: RealtimeChanged) => emit('changed', p));
  connection.on('session-revoked', (p: RealtimeSessionRevoked) => emit('session-revoked', p));
  connection.onreconnecting(() => setStatus('reconnecting'));
  connection.onreconnected(() => {
    setStatus('connected');
    for (const cb of [...reconnectedListeners]) cb();
  });
  connection.onclose(() => setStatus('disconnected'));

  const on = (event: EventName, cb: Listener) => {
    listeners[event].add(cb);
    return () => listeners[event].delete(cb);
  };

  return {
    get status() { return status; },
    onStatusChange(cb) { statusListeners.add(cb); return () => statusListeners.delete(cb); },
    on,
    onReconnected(cb) { reconnectedListeners.add(cb); return () => reconnectedListeners.delete(cb); },
    async start() {
      setStatus('connecting');
      try {
        await connection.start();
        setStatus('connected');
      } catch (err) {
        // onclose is not invoked when the initial start() fails — mark down so
        // the pill shows and the count provider falls back to polling.
        setStatus('disconnected');
        throw err;
      }
    },
    async stop() {
      await connection.stop();
    },
  };
}
