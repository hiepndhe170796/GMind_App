// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import MainLayout from './MainLayout';
import { RealtimeContext, type RealtimeContextValue } from '../components/realtime/realtime-context';
import type { RealtimeStatus } from '../services/realtime';
import { clearSession, saveSession, type AuthResult } from '../services/session';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
vi.mock('../components/notifications/useNotificationCount', () => ({
  useNotificationCount: () => ({ count: 0, error: null, refresh: async () => {}, clear: () => {}, loading: false, setCount: () => {} }),
}));

const SESSION: AuthResult = {
  accessToken: 'at', refreshToken: 'rt', expiresAt: '2100-01-01',
  user: { id: 'u1', displayName: 'A', email: 'a@x' },
};

const events = { subscribeNotification: () => () => {}, subscribeChanged: () => () => {}, subscribeSessionRevoked: () => () => {}, subscribeDiscussion: () => () => {} };

function mount(status: RealtimeStatus) {
  const tree = (
    <RealtimeContext.Provider value={{ status, ...events } as RealtimeContextValue}>
      <MemoryRouter><MainLayout><div>content</div></MainLayout></MemoryRouter>
    </RealtimeContext.Provider>
  );
  const utils = render(tree);
  return { ...utils, setStatus: (next: RealtimeStatus) => utils.rerender(
    <RealtimeContext.Provider value={{ status: next, ...events } as RealtimeContextValue}>
      <MemoryRouter><MainLayout><div>content</div></MainLayout></MemoryRouter>
    </RealtimeContext.Provider>,
  ) };
}

const pill = () => screen.queryByText('Đang kết nối lại…');

function EntityTitle({ name }: { name: string }) {
  useDocumentTitle(name);
  return <div>content</div>;
}

beforeEach(() => { clearSession(); saveSession(SESSION); vi.useFakeTimers({ shouldAdvanceTime: true }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); clearSession(); localStorage.clear(); });

describe('header reconnect pill', () => {
  it('mounts only after the hub has been down continuously for 5000 ms', () => {
    for (const status of ['disconnected', 'reconnecting'] as const) {
      cleanup();
      mount(status);
      act(() => { vi.advanceTimersByTime(4999); });
      expect(pill()).toBeNull();
      act(() => { vi.advanceTimersByTime(1); });
      expect(pill()).toBeTruthy();
      expect(screen.getByRole('status').className).toContain('animate-pill-in');
    }
  });

  it('is removed immediately on connected', () => {
    const { setStatus } = mount('disconnected');
    act(() => { vi.advanceTimersByTime(5000); });
    expect(pill()).toBeTruthy();
    setStatus('connected');
    expect(pill()).toBeNull();
  });

  it('a flap back to connected at 3 s resets the timer', () => {
    const { setStatus } = mount('reconnecting');
    act(() => { vi.advanceTimersByTime(3000); });
    setStatus('connected');
    act(() => { vi.advanceTimersByTime(10); });
    setStatus('reconnecting');
    act(() => { vi.advanceTimersByTime(3000); }); // only 3 s into the new streak
    expect(pill()).toBeNull();
    act(() => { vi.advanceTimersByTime(2000); }); // full 5 s
    expect(pill()).toBeTruthy();
  });

  it('document.title: layout sets the route title and a page hook wins over it', () => {
    const tree = (children: ReactNode, entry = '/dashboard') => (
      <RealtimeContext.Provider value={{ status: 'connected', ...events } as RealtimeContextValue}>
        <MemoryRouter initialEntries={[entry]}><MainLayout>{children}</MainLayout></MemoryRouter>
      </RealtimeContext.Provider>
    );
    render(tree(<div>content</div>));
    expect(document.title).toBe('Tổng quan · GMind');
    cleanup();
    render(tree(<EntityTitle name="Nhóm Alpha" />));
    expect(document.title).toBe('Nhóm Alpha · GMind');
  });

  it('reduced motion still waits the full 5 s (JS timer, not CSS delay)', () => {
    const orig = window.matchMedia;
    window.matchMedia = (q: string) => ({
      matches: q === '(prefers-reduced-motion: reduce)',
      media: q, addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
    }) as MediaQueryList;
    mount('disconnected');
    act(() => { vi.advanceTimersByTime(4999); });
    expect(pill()).toBeNull();
    act(() => { vi.advanceTimersByTime(1); });
    expect(pill()).toBeTruthy();
    window.matchMedia = orig;
  });
});
