// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock @microsoft/signalr before importing the service under test.
const handlers = new Map<string, (p: unknown) => void>();
let reconnectingCb: (() => void) | null = null;
let reconnectedCb: (() => void) | null = null;
let closeCb: (() => void) | null = null;
const hub = {
  on: vi.fn((event: string, cb: (p: unknown) => void) => handlers.set(event, cb)),
  onreconnecting(cb: () => void) { reconnectingCb = cb; },
  onreconnected(cb: () => void) { reconnectedCb = cb; },
  onclose(cb: () => void) { closeCb = cb; },
  start: vi.fn(async () => undefined),
  stop: vi.fn(async () => undefined),
};
const captured: { url?: string; options?: { accessTokenFactory: () => Promise<string> }; policy?: { nextRetryDelayInMilliseconds(c: { previousRetryCount: number }): number | null }; logLevel?: number } = {};
vi.mock('@microsoft/signalr', () => ({
  LogLevel: { Warning: 2 },
  HubConnectionBuilder: class {
    withUrl(url: string, options: typeof captured.options) { captured.url = url; captured.options = options; return this; }
    withAutomaticReconnect(policy: typeof captured.policy) { captured.policy = policy; return this; }
    configureLogging(level: number) { captured.logLevel = level; return this; }
    build() { return hub; }
  },
}));

const { createRealtimeConnection, realtimeRetryDelay, realtimeRetryPolicy, realtimeHubUrl } = await import('./realtime');
vi.mock('./api', () => ({ getFreshAccessToken: vi.fn(async () => 'at-fresh') }));

beforeEach(() => { handlers.clear(); hub.on.mockClear(); hub.start.mockClear(); });
afterEach(() => { vi.clearAllMocks(); });

describe('realtime service', () => {
  it('builds /hubs/realtime with a token factory yielding the fresh access token', async () => {
    createRealtimeConnection();
    expect(captured.url).toBe('/hubs/realtime');
    expect(realtimeHubUrl()).toBe('/hubs/realtime');
    expect(await captured.options!.accessTokenFactory()).toBe('at-fresh');
    expect(captured.policy).toBeTruthy();
    expect(captured.logLevel).toBe(2); // LogLevel.Warning — no Information chatter in production
  });

  it('retry policy is 0/2s/5s/10s then 30s forever', () => {
    expect(realtimeRetryDelay(0)).toBe(0);
    expect(realtimeRetryDelay(1)).toBe(2000);
    expect(realtimeRetryDelay(2)).toBe(5000);
    expect(realtimeRetryDelay(3)).toBe(10_000);
    expect(realtimeRetryDelay(4)).toBe(30_000);
    expect(realtimeRetryDelay(99)).toBe(30_000);
    const ctx = { previousRetryCount: 3 } as never;
    expect(realtimeRetryPolicy.nextRetryDelayInMilliseconds(ctx)).toBe(10_000);
  });

  it('maps hub lifecycle to connecting/connected/reconnecting/disconnected', async () => {
    const conn = createRealtimeConnection();
    const seen: string[] = [];
    conn.onStatusChange(s => seen.push(s));
    expect(conn.status).toBe('connecting');
    await conn.start();
    expect(seen).toEqual(['connected']);
    reconnectingCb!();
    expect(conn.status).toBe('reconnecting');
    reconnectedCb!();
    expect(seen.at(-1)).toBe('connected');
    closeCb!();
    expect(conn.status).toBe('disconnected');
  });

  it('dispatches notification/changed/session-revoked payloads to subscribers', async () => {
    const conn = createRealtimeConnection();
    const events: string[] = [];
    conn.on('notification', p => events.push(`n:${(p as { id: string }).id}`));
    conn.on('changed', p => events.push(`c:${(p as { taskIds: string[] }).taskIds[0]}`));
    conn.on('session-revoked', p => events.push(`r:${(p as { sessionId: string }).sessionId}`));
    handlers.get('notification')!({ id: 'n1' });
    handlers.get('changed')!({ taskIds: ['t1'] });
    handlers.get('session-revoked')!({ sessionId: 's1' });
    expect(events).toEqual(['n:n1', 'c:t1', 'r:s1']);
  });

  it('a failed initial start marks the connection disconnected (onclose does not fire)', async () => {
    hub.start.mockRejectedValueOnce(new Error('down'));
    const conn = createRealtimeConnection();
    await expect(conn.start()).rejects.toThrow('down');
    expect(conn.status).toBe('disconnected');
  });

  it('onReconnected fires only after status returns to connected', () => {
    const conn = createRealtimeConnection();
    let fired = 0;
    conn.onReconnected(() => { fired++; });
    reconnectingCb!();
    expect(fired).toBe(0);
    reconnectedCb!();
    expect(fired).toBe(1);
  });
});
