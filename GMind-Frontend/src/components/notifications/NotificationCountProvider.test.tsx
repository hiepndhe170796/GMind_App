// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { StrictMode, useLayoutEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationCountProvider } from './NotificationCountProvider';
import { useNotificationCount } from './useNotificationCount';
import { notificationsService } from '../../services/notifications';
import { RealtimeContext, type RealtimeContextValue } from '../realtime/realtime-context';
import type { RealtimeStatus } from '../../services/realtime';
import type { ReactNode } from 'react';

const deferred = <T,>() => { let resolve!: (v: T) => void, reject!: (e?: unknown) => void; const promise = new Promise<T>((r, j) => { resolve = r; reject = j; }); return { promise, resolve, reject }; };

function Consumer({ id }: { id: string }) {
  const { count } = useNotificationCount();
  return <span data-testid={`count-${id}`}>{count === null ? 'null' : count}</span>;
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('NotificationCountProvider', () => {
  it('two consumers under one provider share ONE GET and the same value', async () => {
    const spy = vi.spyOn(notificationsService, 'unreadCount').mockResolvedValue(7);
    render(<NotificationCountProvider userId="u1"><Consumer id="a" /><Consumer id="b" /></NotificationCountProvider>);
    await waitFor(() => expect(screen.getByTestId('count-a').textContent).toBe('7'));
    expect(screen.getByTestId('count-b').textContent).toBe('7');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('focus + visibility dedupe a pending request (no permanent lock)', async () => {
    const d = deferred<number>();
    const spy = vi.spyOn(notificationsService, 'unreadCount').mockReturnValue(d.promise);
    const { unmount } = render(<NotificationCountProvider userId="u1"><Consumer id="a" /></NotificationCountProvider>);
    await act(async () => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
    await act(async () => { d.resolve(3); });
    expect(screen.getByTestId('count-a').textContent).toBe('3');
    expect(spy).toHaveBeenCalledTimes(1); // pending request deduped
    unmount();
  });

  it('forced refresh supersedes an in-flight result', async () => {
    const d1 = deferred<number>();
    const spy = vi.spyOn(notificationsService, 'unreadCount').mockReturnValueOnce(d1.promise).mockResolvedValueOnce(5);
    let ctx: ReturnType<typeof useNotificationCount> | null = null;
    function Capture() {
      const value = useNotificationCount();
      useLayoutEffect(() => { ctx = value; }, [value]);
      return null;
    }
    render(<NotificationCountProvider userId="u1"><Capture /></NotificationCountProvider>);
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    await act(async () => { void ctx!.refresh(true); }); // forced — bumps version
    await act(async () => { d1.resolve(99); }); // stale — must be ignored
    await waitFor(() => expect(ctx!.count).toBe(5));
  });

  it('StrictMode resolves a count (does not lock the inflight ref)', async () => {
    vi.spyOn(notificationsService, 'unreadCount').mockResolvedValue(4);
    render(<StrictMode><NotificationCountProvider userId="u1"><Consumer id="a" /></NotificationCountProvider></StrictMode>);
    await waitFor(() => expect(screen.getByTestId('count-a').textContent).toBe('4'));
  });

  it('ordinary failure keeps last known count + sets error (not zero)', async () => {
    vi.spyOn(notificationsService, 'unreadCount')
      .mockResolvedValueOnce(6)
      .mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 500 }));
    let ctx: ReturnType<typeof useNotificationCount> | null = null;
    function Capture() {
      const value = useNotificationCount();
      useLayoutEffect(() => { ctx = value; }, [value]);
      return null;
    }
    render(<NotificationCountProvider userId="u1"><Capture /></NotificationCountProvider>);
    await waitFor(() => expect(ctx!.count).toBe(6));
    await act(async () => { await ctx!.refresh(true); });
    expect(ctx!.count).toBe(6); // retained, not reset to 0
    expect(ctx!.error).toBe('boom');
  });

  it('403 clears the count', async () => {
    vi.spyOn(notificationsService, 'unreadCount')
      .mockResolvedValueOnce(8)
      .mockRejectedValueOnce(Object.assign(new Error('forbidden'), { status: 403 }));
    let ctx: ReturnType<typeof useNotificationCount> | null = null;
    function Capture() {
      const value = useNotificationCount();
      useLayoutEffect(() => { ctx = value; }, [value]);
      return null;
    }
    render(<NotificationCountProvider userId="u1"><Capture /></NotificationCountProvider>);
    await waitFor(() => expect(ctx!.count).toBe(8));
    await act(async () => { await ctx!.refresh(true); });
    expect(ctx!.count).toBeNull();
  });

  it('userId key change ignores the old promise (no cross-user leakage)', async () => {
    const d1 = deferred<number>();
    const spy = vi.spyOn(notificationsService, 'unreadCount').mockReturnValueOnce(d1.promise).mockResolvedValue(2);
    const { rerender } = render(<NotificationCountProvider key="u1" userId="u1"><Consumer id="a" /></NotificationCountProvider>);
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    rerender(<NotificationCountProvider key="u2" userId="u2"><Consumer id="a" /></NotificationCountProvider>);
    await act(async () => { d1.resolve(99); }); // stale u1 result
    await waitFor(() => expect(screen.getByTestId('count-a').textContent).toBe('2'));
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('empty userId performs no GET', async () => {
    const spy = vi.spyOn(notificationsService, 'unreadCount').mockResolvedValue(9);
    render(<NotificationCountProvider userId=""><Consumer id="a" /></NotificationCountProvider>);
    await act(async () => { });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('realtime integration', () => {
  const Mutable = { status: 'connected' as RealtimeStatus, subscribeNotification: null as ((cb: (p: { unreadCount: number }) => void) => () => void) | null };
  // Stable like the memoised events object in RealtimeProvider — rerenders must
  // not re-run the provider's effect.
  const stableSubscribe: RealtimeContextValue['subscribeNotification'] =
    cb => Mutable.subscribeNotification!(cb as (p: { unreadCount: number }) => void);

  function withRealtime(node: ReactNode, mutable = Mutable) {
    const value: RealtimeContextValue = {
      get status() { return mutable.status; },
      subscribeNotification: stableSubscribe,
      subscribeChanged: () => () => {},
      subscribeSessionRevoked: () => () => {},
    };
    return <RealtimeContext.Provider value={value}>{node}</RealtimeContext.Provider>;
  }

  it('applies notification unreadCount through setCount without a GET', async () => {
    let deliver: ((p: { unreadCount: number }) => void) | null = null;
    Mutable.subscribeNotification = cb => { deliver = cb; return () => { deliver = null; }; };
    vi.spyOn(notificationsService, 'unreadCount').mockResolvedValue(2);
    render(withRealtime(<NotificationCountProvider userId="u"><Consumer id="x" /></NotificationCountProvider>));
    await screen.findByText('2');
    act(() => deliver!({ unreadCount: 9 }));
    expect(screen.getByTestId('count-x').textContent).toBe('9');
    expect(notificationsService.unreadCount).toHaveBeenCalledTimes(1);
  });

  it('60 s polling only runs while realtime is not connected', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const spy = vi.spyOn(notificationsService, 'unreadCount').mockResolvedValue(3);
    Mutable.subscribeNotification = () => () => {};
    Mutable.status = 'connected';
    const node = <NotificationCountProvider userId="u"><Consumer id="x" /></NotificationCountProvider>;
    const { rerender } = render(withRealtime(node));
    await screen.findByText('3');
    await act(async () => { vi.advanceTimersByTime(120_000); });
    expect(spy).toHaveBeenCalledTimes(1);
    // a status flip re-renders — the tick then reads the ref's latest value
    Mutable.status = 'disconnected';
    rerender(withRealtime(node));
    await act(async () => { vi.advanceTimersByTime(61_000); });
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(2);
    Mutable.status = 'connected';
    rerender(withRealtime(node));
    vi.useRealTimers();
  });

  it('a status cycle refetches exactly once on recovery (mount + reconnect only)', async () => {
    const spy = vi.spyOn(notificationsService, 'unreadCount').mockResolvedValue(3);
    Mutable.subscribeNotification = () => () => {};
    Mutable.status = 'connecting';
    const node = <NotificationCountProvider userId="u"><Consumer id="x" /></NotificationCountProvider>;
    const { rerender } = render(withRealtime(node));
    await screen.findByText('3');
    expect(spy).toHaveBeenCalledTimes(1);
    // connecting → connected: initial connect is not a recovery
    Mutable.status = 'connected';
    rerender(withRealtime(node));
    expect(spy).toHaveBeenCalledTimes(1);
    // connected → reconnecting: still just the mount call
    Mutable.status = 'reconnecting';
    rerender(withRealtime(node));
    expect(spy).toHaveBeenCalledTimes(1);
    // reconnecting → connected: the hub does not replay missed events — refetch once
    Mutable.status = 'connected';
    rerender(withRealtime(node));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    // connected → disconnected: no further refetch
    Mutable.status = 'disconnected';
    rerender(withRealtime(node));
    await act(async () => {});
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe('placement (ProtectedRoute, outside per-path checks)', () => {
  it('survives route changes: count persists and no new GET is issued', async () => {
    const { MemoryRouter, Routes, Route, Link } = await import('react-router-dom');
    const spy = vi.spyOn(notificationsService, 'unreadCount').mockResolvedValue(5);
    render(
      <MemoryRouter initialEntries={['/a']}>
        <NotificationCountProvider userId="u">
          <Routes>
            <Route path="/a" element={<Consumer id="a" />} />
            <Route path="/b" element={<Consumer id="b" />} />
          </Routes>
          <Link to="/b">to-b</Link>
        </NotificationCountProvider>
      </MemoryRouter>,
    );
    await screen.findByText('5');
    fireEvent.click(screen.getByRole('link', { name: 'to-b' }));
    expect(await screen.findByTestId('count-b')).toHaveProperty('textContent', '5');
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
