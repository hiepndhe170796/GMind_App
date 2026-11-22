// @vitest-environment jsdom
// Integration: real RealtimeProvider + NotificationCountProvider inside
// ProtectedRoute — navigation and the per-path check must never restart them.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ProtectedRoute from './ProtectedRoute';
import { ToastProvider } from './ui/Toast';
import { authService } from '../services/auth';
import { notificationsService } from '../services/notifications';
import { createQueryClient } from '../services/query-client';
import { clearSession, saveSession, type AuthResult } from '../services/session';

const hub = {
  status: 'connecting' as const,
  onStatusChange: vi.fn((_cb: (s: string) => void) => () => {}),
  on: vi.fn((_e: string, _cb: (p: never) => void) => () => {}),
  onReconnected: vi.fn((_cb: () => void) => () => {}),
  start: vi.fn(async () => undefined),
  stop: vi.fn(async () => undefined),
};
const createConnection = vi.fn(() => hub);
vi.mock('../services/realtime', () => ({
  createRealtimeConnection: () => createConnection(),
}));

const USER = { id: 'u-1', displayName: 'A', email: 'a@x' };
const session = (): AuthResult => ({ accessToken: 'at.x.y', refreshToken: 'rt', expiresAt: '2100-01-01', user: USER });

afterEach(() => { cleanup(); vi.restoreAllMocks(); clearSession(); localStorage.clear(); });

describe('ProtectedRoute provider lifetime', () => {
  it('one hub connection and one unread-count GET across three paths', async () => {
    saveSession(session());
    vi.spyOn(authService, 'validateSession').mockResolvedValue(USER);
    const unread = vi.spyOn(notificationsService, 'unreadCount').mockResolvedValue(0);
    render(
      <QueryClientProvider client={createQueryClient()}>
        <ToastProvider>
          <MemoryRouter initialEntries={['/dashboard']}>
            <Routes>
              <Route element={<ProtectedRoute />}>
                <Route path="/dashboard" element={<div>DASH</div>} />
                <Route path="/my-tasks" element={<div>MYTASKS</div>} />
                <Route path="/settings" element={<div>SETTINGS</div>} />
              </Route>
            </Routes>
            <Link to="/my-tasks">go-my-tasks</Link>
            <Link to="/settings">go-settings</Link>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('DASH')).toBeTruthy();
    await waitFor(() => expect(hub.start).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(unread).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('go-my-tasks'));
    expect(await screen.findByText('MYTASKS')).toBeTruthy();
    fireEvent.click(screen.getByText('go-settings'));
    expect(await screen.findByText('SETTINGS')).toBeTruthy();
    await act(async () => {});

    expect(createConnection).toHaveBeenCalledTimes(1);
    expect(hub.start).toHaveBeenCalledTimes(1);
    expect(hub.stop).not.toHaveBeenCalled();
    expect(unread).toHaveBeenCalledTimes(1);
  });
});
