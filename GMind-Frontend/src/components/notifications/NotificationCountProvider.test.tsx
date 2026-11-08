// @vitest-environment jsdom
import { act, render, screen, waitFor, cleanup } from '@testing-library/react';
import { StrictMode, useLayoutEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationCountProvider } from './NotificationCountProvider';
import { useNotificationCount } from './useNotificationCount';
import { notificationsService } from '../../services/notifications';

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
