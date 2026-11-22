// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../../services/query-client';
import { ToastProvider } from '../ui/Toast';
import { clearSession, getSessionEndReason, getSessionSnapshot, saveSession, type AuthResult } from '../../services/session';
import type { RealtimeNotification } from '../../services/realtime';

// Controllable fake hub connection.
const subs: Record<string, Set<(p: never) => void>> = { notification: new Set(), changed: new Set(), 'session-revoked': new Set() };
let reconnectedCb: (() => void) | null = null;
const fake = {
  status: 'connecting',
  onStatusChange: vi.fn((_cb: (s: string) => void) => () => {}),
  on: vi.fn((event: string, cb: (p: never) => void) => { subs[event]!.add(cb); return () => subs[event]!.delete(cb); }),
  onReconnected: vi.fn((cb: () => void) => { reconnectedCb = cb; return () => { reconnectedCb = null; }; }),
  start: vi.fn(async () => undefined),
  stop: vi.fn(async () => undefined),
};
vi.mock('../../services/realtime', () => ({
  createRealtimeConnection: () => fake,
}));

const { RealtimeProvider } = await import('./RealtimeProvider');

const jwt = (sid: string) => `a.${btoa(JSON.stringify({ sid })).replace(/=/g, '')}.c`;
const USER = { id: 'u-1', displayName: 'A', email: 'a@x' };
const session = (sid = 'sid-1'): AuthResult => ({ accessToken: jwt(sid), refreshToken: 'rt', expiresAt: '2100-01-01', user: USER });

function mount(path = '/dashboard') {
  const client = createQueryClient();
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <RealtimeProvider><div>CHILD</div></RealtimeProvider>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { client, invalidate };
}
const emit = (event: string, payload: unknown) => {
  for (const cb of [...(subs[event] ?? [])]) (cb as (p: unknown) => void)(payload);
};
const notice = (overrides: Partial<RealtimeNotification> = {}): RealtimeNotification => ({
  id: 'n1', type: 'TaskSubmitted', title: 'Có nộp bài mới', body: 'Bạn vừa nhận được một bài nộp.',
  createdAt: '2026-11-20T10:00:00Z', unreadCount: 3,
  relatedEntityType: 'Task', relatedEntityId: '11111111-1111-1111-1111-111111111111', ...overrides,
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  clearSession(); saveSession(session());
  fake.start.mockClear(); fake.stop.mockClear();
  fake.start.mockImplementation(async () => undefined);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); clearSession(); localStorage.clear(); for (const s of Object.values(subs)) s.clear(); });

describe('RealtimeProvider', () => {
  it('notification invalidates inbox and shows a toast with Xem action', async () => {
    const { invalidate } = mount();
    act(() => { emit('notification', notice()); });
    expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ predicate: expect.any(Function) }));
    const pred = vi.mocked(invalidate).mock.calls.at(-1)![0]!.predicate!;
    expect(pred({ queryKey: ['u', 'u-1', 'notifications', { unreadOnly: false }] } as never)).toBe(true);
    expect(pred({ queryKey: ['u', 'u-1', 'my-tasks'] } as never)).toBe(false);
    expect(await screen.findByText('Có nộp bài mới')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Xem' })).toBeTruthy();
  });

  it('suppresses the toast on /notifications but still invalidates', async () => {
    const { invalidate } = mount('/notifications');
    act(() => { emit('notification', notice()); });
    expect(invalidate).toHaveBeenCalled();
    expect(screen.queryByText('Có nộp bài mới')).toBeNull();
  });

  it('suppresses the toast while the document is hidden', async () => {
    const spy = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    mount();
    act(() => { emit('notification', notice()); });
    expect(screen.queryByText('Có nộp bài mới')).toBeNull();
    spy.mockRestore();
  });

  it('changed coalesces 300 ms then invalidates by id plus the global lists', async () => {
    const { invalidate } = mount();
    act(() => {
      emit('changed', { taskIds: ['t-1'], projectIds: ['p-1'] });
      emit('changed', { taskIds: ['t-2'] });
    });
    expect(invalidate).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(400); });
    const calls = vi.mocked(invalidate).mock.calls.map(c => c[0]!.predicate!);
    const hit = calls.find(p => p({ queryKey: ['u', 'u-1', 'task', 't-1'] } as never)
      && p({ queryKey: ['u', 'u-1', 'project', 'p-1', 'tasks'] } as never)
      && p({ queryKey: ['u', 'u-1', 'task', 't-2', 'comments'] } as never));
    expect(hit).toBeTruthy();
    for (const list of ['my-tasks', 'leader-queue', 'marketplace-incoming', 'helping', 'my-groups']) {
      expect(calls.some(p => p({ queryKey: ['u', 'u-1', list] } as never))).toBe(true);
    }
  });

  it('session-revoked for our sid clears the session with the revoked reason', () => {
    mount();
    act(() => { emit('session-revoked', { sessionId: 'other-sid' }); });
    expect(getSessionSnapshot()).toBeTruthy();
    act(() => { emit('session-revoked', { sessionId: 'sid-1' }); });
    expect(getSessionSnapshot()).toBeNull();
    expect(getSessionEndReason()).toBe('revoked');
  });

  it('reconnect invalidates every user-scoped query once', async () => {
    const { invalidate } = mount();
    act(() => { reconnectedCb?.(); });
    const pred = vi.mocked(invalidate).mock.calls.at(-1)![0]!.predicate!;
    expect(pred({ queryKey: ['u', 'u-1', 'my-tasks'] } as never)).toBe(true);
    expect(pred({ queryKey: ['u', 'other-user', 'my-tasks'] } as never)).toBe(false);
    expect(pred({ queryKey: ['dev-mailbox'] } as never)).toBe(false);
  });

  it('a start that succeeds after a failed attempt invalidates all user queries once', async () => {
    fake.start.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(undefined);
    const { invalidate } = mount();
    await act(async () => { vi.advanceTimersByTime(10); }); // deferred first attempt
    expect(fake.start).toHaveBeenCalledTimes(1);
    expect(invalidate).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(30_000); }); // retry succeeds
    expect(fake.start).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(invalidate).mock.calls;
    expect(calls.length).toBe(1);
    const pred = calls[0]![0]!.predicate!;
    expect(pred({ queryKey: ['u', 'u-1', 'my-tasks'] } as never)).toBe(true);
    expect(pred({ queryKey: ['u', 'other', 'my-tasks'] } as never)).toBe(false);
  });

  it('StrictMode: the deferred start runs once and stop is not called before unmount', async () => {
    const { StrictMode } = await import('react');
    const client = createQueryClient();
    const { unmount } = render(
      <StrictMode>
        <QueryClientProvider client={client}>
          <ToastProvider>
            <MemoryRouter initialEntries={['/dashboard']}>
              <RealtimeProvider><div>CHILD</div></RealtimeProvider>
            </MemoryRouter>
          </ToastProvider>
        </QueryClientProvider>
      </StrictMode>,
    );
    await act(async () => { vi.advanceTimersByTime(10); });
    expect(fake.start).toHaveBeenCalledTimes(1);
    expect(fake.stop).not.toHaveBeenCalled();
    unmount();
    expect(fake.stop).toHaveBeenCalledTimes(1);
  });
});
