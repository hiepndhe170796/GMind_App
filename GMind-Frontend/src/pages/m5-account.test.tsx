// @vitest-environment jsdom
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import Settings from './Settings';
import Profile from './Profile';
import { authService, type SessionInfoDto } from '../services/auth';
import { clearSession, saveSession, type AuthResult } from '../services/session';
import { createQueryClient } from '../services/query-client';
import { ToastProvider } from '../components/ui/Toast';
import type { ReactNode } from 'react';

vi.mock('../components/notifications/NotificationCountProvider', () => ({
  NotificationCountProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../components/notifications/useNotificationCount', () => ({
  useNotificationCount: () => ({ count: 0, error: null }),
}));
vi.mock('../components/realtime/RealtimeProvider', () => ({
  RealtimeProvider: ({ children }: { children: ReactNode }) => children,
}));

const RESULT: AuthResult = {
  accessToken: 'at', refreshToken: 'rt', expiresAt: '2100-01-01',
  user: { id: 'account-a', displayName: 'Account A', email: 'a@test.dev', avatarUrl: null },
};
const SESSIONS: SessionInfoDto[] = [
  { id: 's-current', createdAt: '2026-11-18T08:00:00Z', lastSeenAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
    userAgent: null, browser: 'Edge', os: 'Windows', deviceLabel: 'Edge trên Windows', ipAddress: '203.0.113.0', isCurrent: true },
  { id: 's-phone', createdAt: '2026-11-19T09:00:00Z', lastSeenAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    userAgent: null, browser: 'Safari', os: 'iOS', deviceLabel: 'Safari trên iOS', ipAddress: '0:0:0::', isCurrent: false },
];
const PREFS = { reminder3Days: true, reminder1Day: true, reminder3Hours: false, overdueAlert: true };

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}<span data-testid="loc-state">{JSON.stringify(loc.state)}</span></div>;
}
function mount(path: string) {
  render(<QueryClientProvider client={createQueryClient()}><ToastProvider>
    <MemoryRouter initialEntries={[path]}><Routes>
      <Route path="/settings" element={<Settings />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/login" element={<LocationProbe />} />
    </Routes><LocationProbe /></MemoryRouter>
  </ToastProvider></QueryClientProvider>);
}
const click = async (name: string | RegExp) => fireEvent.click(await screen.findByRole('button', { name }));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
beforeEach(() => {
  clearSession(); saveSession(RESULT);
  vi.spyOn(authService, 'validateSession').mockResolvedValue(RESULT.user);
  vi.spyOn(authService, 'listSessions').mockResolvedValue(SESSIONS);
  vi.spyOn(authService, 'revokeSession').mockResolvedValue(undefined);
  vi.spyOn(authService, 'revokeOtherSessions').mockResolvedValue(1);
  vi.spyOn(authService, 'getNotificationPreferences').mockResolvedValue(PREFS);
  vi.spyOn(authService, 'updateNotificationPreferences').mockImplementation(async p => p);
  vi.spyOn(authService, 'getPendingEmailChange').mockResolvedValue(null);
  vi.spyOn(authService, 'requestEmailChange').mockResolvedValue({ pendingEmail: 'b@test.dev', expiresAt: '2026-11-20T11:00:00Z' });
  vi.spyOn(authService, 'cancelEmailChange').mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); clearSession(); localStorage.clear(); });

describe('Settings — Phiên đăng nhập', () => {
  it('lists both devices, marks the current one and masks/relativises meta', async () => {
    mount('/settings');
    expect(await screen.findByText('Edge trên Windows')).toBeTruthy();
    expect(screen.getByText('Safari trên iOS')).toBeTruthy();
    expect(screen.getByText('Thiết bị này')).toBeTruthy();
    expect(screen.getByText(/IP 203\.0\.113\.0/)).toBeTruthy();
    expect(screen.getAllByText(/giờ trước|phút trước|vừa xong/).length).toBeGreaterThan(0);
    for (const label of ['Edge trên Windows', 'Safari trên iOS']) {
      const row = screen.getByText(label).closest('li')!;
      expect(within(row).getByRole('button', { name: 'Đăng xuất' })).toBeTruthy();
    }
  });

  it('revokes another session after confirm with a named toast', async () => {
    mount('/settings');
    const row = (await screen.findByText('Safari trên iOS')).closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Đăng xuất' }));
    fireEvent.click(await within(await screen.findByRole('dialog')).findByRole('button', { name: 'Đăng xuất' }));
    await waitFor(() => expect(authService.revokeSession).toHaveBeenCalledWith('s-phone'));
    expect(await screen.findByText('Đã đăng xuất phiên trên Safari trên iOS.')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('revoke-others confirm reports the affected count', async () => {
    mount('/settings');
    await screen.findByText('Edge trên Windows');
    fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất khỏi các thiết bị khác' }));
    fireEvent.click(await within(await screen.findByRole('dialog')).findByRole('button', { name: 'Đăng xuất tất cả' }));
    await waitFor(() => expect(authService.revokeOtherSessions).toHaveBeenCalled());
    expect(await screen.findByText('Đã đăng xuất 1 thiết bị khác.')).toBeTruthy();
  });

  it('the current row runs only the normal logout flow to /login', async () => {
    vi.spyOn(authService, 'logout').mockImplementation(async () => { clearSession(); return { serverRevoked: true }; });
    mount('/settings');
    const row = (await screen.findByText('Edge trên Windows')).closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Đăng xuất' }));
    fireEvent.click(await within(await screen.findByRole('dialog')).findByRole('button', { name: 'Đăng xuất' }));
    await waitFor(() => expect(screen.getAllByTestId('loc').at(-1)!.textContent).toContain('/login'));
    expect(authService.logout).toHaveBeenCalled();
    expect(authService.revokeSession).not.toHaveBeenCalled(); // no 401 logout round-trip
    expect(screen.getAllByTestId('loc-state').at(-1)!.textContent).not.toContain('logoutWarning');
  });

  it('a failed revoke shows the alert inside the open dialog, not behind it', async () => {
    vi.mocked(authService.revokeSession).mockRejectedValueOnce({ status: 500, message: 'server down' });
    mount('/settings');
    const row = (await screen.findByText('Safari trên iOS')).closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Đăng xuất' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Đăng xuất' }));
    expect(await within(dialog).findByRole('alert')).toBeTruthy(); // inside the dialog
    expect(screen.queryByRole('dialog')).toBe(dialog); // stays open
  });

  it('a failed revoke-others shows the alert inside its dialog and clears on close', async () => {
    vi.mocked(authService.revokeOtherSessions).mockRejectedValueOnce({ status: 500 });
    mount('/settings');
    await screen.findByText('Edge trên Windows');
    fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất khỏi các thiết bị khác' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Đăng xuất tất cả' }));
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hủy' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất khỏi các thiết bị khác' }));
    const reopened = await screen.findByRole('dialog');
    expect(within(reopened).queryByRole('alert')).toBeNull(); // error cleared on reopen
  });
});

describe('Settings — Thông báo nhắc hạn', () => {
  const prefsCard = async () => within((await screen.findByText('Thông báo nhắc hạn')).parentElement as HTMLElement);
  it('accessible switches: save only when dirty, Hủy resets, error stays inline', async () => {
    mount('/settings');
    const prefs = await prefsCard();
    const threeHours = await screen.findByRole('switch', { name: '3 giờ trước hạn' });
    expect(threeHours.getAttribute('aria-checked')).toBe('false');
    const save = prefs.getByRole('button', { name: 'Lưu' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(threeHours);
    expect(threeHours.getAttribute('aria-checked')).toBe('true');
    expect(save.disabled).toBe(false);
    fireEvent.click(prefs.getByRole('button', { name: 'Hủy' }));
    expect((await screen.findByRole('switch', { name: '3 giờ trước hạn' })).getAttribute('aria-checked')).toBe('false');
    fireEvent.click(await screen.findByRole('switch', { name: 'Khi quá hạn' }));
    fireEvent.click(prefs.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(authService.updateNotificationPreferences).toHaveBeenCalledWith({ ...PREFS, overdueAlert: false }));
    expect(await screen.findByText('Đã lưu tùy chọn thông báo.')).toBeTruthy();
  });

  it('a failed save shows an inline error and keeps the draft', async () => {
    vi.mocked(authService.updateNotificationPreferences).mockRejectedValue({ status: 500 });
    mount('/settings');
    fireEvent.click(await screen.findByRole('switch', { name: '1 ngày trước hạn' }));
    fireEvent.click((await prefsCard()).getByRole('button', { name: 'Lưu' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Chưa lưu được tùy chọn');
    expect((await screen.findByRole('switch', { name: '1 ngày trước hạn' })).getAttribute('aria-checked')).toBe('false');
  });
});

describe('Profile — đổi email', () => {
  const openDialog = async () => { await click('Đổi email'); return screen.findByRole('dialog'); };

  it('validates format and same-as-current client-side without a POST', async () => {
    mount('/profile');
    const dialog = await openDialog();
    fireEvent.change(within(dialog).getByLabelText('Email mới'), { target: { value: 'bad' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Gửi liên kết xác minh' }));
    expect(await within(dialog).findByText('Email chưa đúng định dạng.')).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText('Email mới'), { target: { value: 'a@test.dev' } });
    fireEvent.change(within(dialog).getByLabelText('Mật khẩu hiện tại'), { target: { value: 'pw' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Gửi liên kết xác minh' }));
    expect(await within(dialog).findByText('Email mới phải khác email hiện tại.')).toBeTruthy();
    expect(authService.requestEmailChange).not.toHaveBeenCalled();
  });

  it('maps server 409 to the email field and 400 password errors to the password field', async () => {
    vi.mocked(authService.requestEmailChange).mockRejectedValueOnce({ status: 409, message: 'Email này đã được sử dụng.' });
    mount('/profile');
    const dialog = await openDialog();
    fireEvent.change(within(dialog).getByLabelText('Email mới'), { target: { value: 'taken@x.dev' } });
    fireEvent.change(within(dialog).getByLabelText('Mật khẩu hiện tại'), { target: { value: 'pw' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Gửi liên kết xác minh' }));
    expect(await within(dialog).findByText('Email này đã được sử dụng.')).toBeTruthy();
    vi.mocked(authService.requestEmailChange).mockRejectedValueOnce({ status: 400, message: 'Mật khẩu hiện tại không đúng.' });
    fireEvent.change(within(dialog).getByLabelText('Email mới'), { target: { value: 'free@x.dev' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Gửi liên kết xác minh' }));
    expect(await within(dialog).findByText('Mật khẩu hiện tại không đúng.')).toBeTruthy();
  });

  it('success shows the pending card; Gửi lại repopulates; Hủy yêu cầu confirms and clears', async () => {
    mount('/profile');
    const dialog = await openDialog();
    fireEvent.change(within(dialog).getByLabelText('Email mới'), { target: { value: 'b@test.dev' } });
    fireEvent.change(within(dialog).getByLabelText('Mật khẩu hiện tại'), { target: { value: 'pw' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Gửi liên kết xác minh' }));
    expect(await screen.findByText('Đang chờ đổi email')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText(/Đang chờ xác minh/).textContent).toContain('b@test.dev');
    // Gửi lại reopens the dialog prefilled with the pending address
    fireEvent.click(screen.getByRole('button', { name: 'Gửi lại' }));
    const reopened = await screen.findByRole('dialog');
    expect((within(reopened).getByLabelText('Email mới') as HTMLInputElement).value).toBe('b@test.dev');
    fireEvent.click(within(reopened).getByRole('button', { name: 'Hủy' }));
    // Cancel flow
    fireEvent.click(screen.getByRole('button', { name: 'Hủy yêu cầu' }));
    const confirm = await screen.findByRole('dialog');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Hủy yêu cầu' }));
    await waitFor(() => expect(authService.cancelEmailChange).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText('Đang chờ đổi email')).toBeNull());
    expect(await screen.findByText('Đã hủy yêu cầu đổi email.')).toBeTruthy();
  });

  it('renders the pending card from GET me/email-change on load', async () => {
    vi.mocked(authService.getPendingEmailChange).mockResolvedValue({ pendingEmail: 'c@test.dev', expiresAt: '2026-11-20T11:00:00Z' });
    mount('/profile');
    expect(await screen.findByText('Đang chờ đổi email')).toBeTruthy();
    expect(screen.getByText(/Đang chờ xác minh/).textContent).toContain('c@test.dev');
  });
});
