// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Profile from './Profile';
import Settings from './Settings';
import Login from './Login';
import ProtectedRoute from '../components/ProtectedRoute';
import UserAvatar from '../components/account/UserAvatar';
import api from '../services/api';
import { authService } from '../services/auth';
import { clearSession, getSessionSnapshot, saveSession, type AuthResult } from '../services/session';

vi.mock('../components/notifications/NotificationCountProvider', () => ({
  NotificationCountProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../components/notifications/useNotificationCount', () => ({
  useNotificationCount: () => ({ count: 0, error: null }),
}));
const RESULT: AuthResult = {
  accessToken: 'test-access', refreshToken: 'test-refresh', expiresAt: '2100-01-01',
  user: { id: 'account-a', displayName: 'Account A', email: 'a@test.dev', avatarUrl: null },
};
function mount(path = '/profile') {
  render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/login" element={<Login />} />
    <Route element={<ProtectedRoute />}>
      <Route path="/profile" element={<Profile />} />
      <Route path="/settings" element={<Settings />} />
    </Route>
  </Routes></MemoryRouter>);
}
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
async function ready(path = '/profile') {
  mount(path);
  await screen.findByRole('navigation', { name: 'Tài khoản' });
}
function passwords() {
  type('Mật khẩu hiện tại', 'OldTest123!');
  type('Mật khẩu mới', 'NewTest123!');
  type('Xác nhận mật khẩu mới', 'NewTest123!');
}
beforeEach(() => {
  clearSession(); saveSession(RESULT);
  vi.spyOn(authService, 'validateSession').mockResolvedValue(RESULT.user);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); clearSession(); localStorage.clear(); });

describe('Profile', () => {
  it('shows validated account data, readonly email and real footer/secondary navigation', async () => {
    await ready();
    expect((screen.getByLabelText('Tên hiển thị') as HTMLInputElement).value).toBe('Account A');
    expect(screen.queryByRole('textbox', { name: /email/i })).toBeNull();
    const footer = within(document.querySelector('aside')!).getByRole('link', { name: 'Hồ sơ và cài đặt' });
    expect(footer.getAttribute('href')).toBe('/profile');
    expect(footer.getAttribute('aria-current')).toBe('page');
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Tài khoản' })).getByRole('link', { name: 'Cài đặt' }));
    await screen.findByLabelText('Mật khẩu hiện tại');
  });

  it('saves trimmed supported values, updates chrome/session and resets canonical draft', async () => {
    const before = getSessionSnapshot()!;
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: { data: { ...RESULT.user, displayName: 'Updated', avatarUrl: null } } });
    await ready();
    type('Tên hiển thị', '  Updated  '); click('Lưu thay đổi');
    await screen.findByText('Đã lưu hồ sơ.');
    expect(patch).toHaveBeenCalledWith('/api/me', { displayName: 'Updated', avatarUrl: null });
    expect(getSessionSnapshot()).toEqual({ ...before, user: { ...RESULT.user, displayName: 'Updated' } });
    expect(within(document.querySelector('aside')!).getByText('Updated')).toBeTruthy();
    expect((screen.getByLabelText('Tên hiển thị') as HTMLInputElement).value).toBe('Updated');
    type('Tên hiển thị', 'Unsaved');
    expect(screen.queryByText('Đã lưu hồ sơ.')).toBeNull();
    click('Hủy');
    expect((screen.getByLabelText('Tên hiển thị') as HTMLInputElement).value).toBe('Updated');
  });

  it.each(['', 'X'.repeat(101)])('validates display name and focuses without PATCH', async value => {
    const patch = vi.spyOn(api, 'patch');
    await ready(); type('Tên hiển thị', value); click('Lưu thay đổi');
    expect(patch).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Tên hiển thị').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(screen.getByLabelText('Tên hiển thị'));
    click('Hủy');
    expect(screen.getByLabelText('Tên hiển thị').getAttribute('aria-invalid')).not.toBe('true');
  });

  it.each(['ftp://example.com/a.png', 'https://u:p@example.com/a.png', 'javascript:alert(1)', `https://example.com/${'x'.repeat(500)}`])('rejects invalid avatar with associated error', async value => {
    const patch = vi.spyOn(api, 'patch');
    await ready(); type('URL ảnh đại diện (tuỳ chọn)', value); click('Lưu thay đổi');
    const input = screen.getByLabelText('URL ảnh đại diện (tuỳ chọn)');
    expect(input.getAttribute('aria-describedby')).toContain('avatarUrl-error');
    expect(document.activeElement).toBe(input); expect(patch).not.toHaveBeenCalled();
  });

  it('retains failed draft without exposing server internals', async () => {
    vi.spyOn(api, 'patch').mockRejectedValue({ status: 500, message: 'INTERNAL SQL CONNECTION SECRET' });
    await ready(); type('Tên hiển thị', 'Draft'); click('Lưu thay đổi');
    await screen.findByRole('alert');
    expect((screen.getByLabelText('Tên hiển thị') as HTMLInputElement).value).toBe('Draft');
    expect(screen.queryByText(/INTERNAL SQL/)).toBeNull();
    expect(screen.queryByText('Đã lưu hồ sơ.')).toBeNull();
  });

  it('serializes duplicate submissions while fields are disabled', async () => {
    let finish!: (value: unknown) => void;
    const patch = vi.spyOn(api, 'patch').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await ready(); type('Tên hiển thị', 'Draft');
    const form = screen.getByLabelText('Tên hiển thị').closest('form')!;
    fireEvent.submit(form); fireEvent.submit(form);
    expect(patch).toHaveBeenCalledTimes(1);
    expect(form.getAttribute('aria-busy')).toBe('true');
    await act(async () => { finish({ data: { data: { ...RESULT.user, displayName: 'Draft' } } }); });
    await screen.findByText('Đã lưu hồ sơ.');
  });

  it('recovers an image after a failed URL is replaced', () => {
    const view = render(<UserAvatar name="Account A" url="https://example.com/bad.png" />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.queryByRole('img')).toBeNull();
    view.rerender(<UserAvatar name="Account A" url="https://example.com/good@photo.png" />);
    expect(screen.getByRole('img').getAttribute('src')).toContain('good@photo');
  });
});

describe('Settings and session safety', () => {
  it('explains policy, validates required fields, focuses and resets visibility on cancel', async () => {
    const change = vi.spyOn(authService, 'changePassword');
    await ready('/settings');
    expect(screen.getByText('Ít nhất 8 ký tự.')).toBeTruthy();
    click('Đổi mật khẩu');
    expect(change).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByLabelText('Mật khẩu hiện tại'));
    passwords(); click('Hiện mật khẩu hiện tại');
    expect(screen.getByLabelText('Mật khẩu hiện tại').getAttribute('type')).toBe('text');
    expect(screen.getByRole('button', { name: 'Ẩn mật khẩu hiện tại' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText('Mật khẩu hiện tại').getAttribute('spellcheck')).toBe('false');
    click('Hủy');
    expect((screen.getByLabelText('Mật khẩu hiện tại') as HTMLInputElement).value).toBe('');
    expect(screen.getByLabelText('Mật khẩu hiện tại').getAttribute('type')).toBe('password');
  });

  it('rejects short/mismatched new passwords before calling backend', async () => {
    const change = vi.spyOn(authService, 'changePassword');
    await ready('/settings'); passwords();
    type('Mật khẩu mới', 'short'); type('Xác nhận mật khẩu mới', 'different'); click('Đổi mật khẩu');
    expect(change).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Mật khẩu mới').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText('Xác nhận mật khẩu mới').getAttribute('aria-invalid')).toBe('true');
  });

  it('wrong-current error retains the session and focuses the current field', async () => {
    const before = getSessionSnapshot();
    vi.spyOn(authService, 'changePassword').mockRejectedValue({ status: 400, message: 'Current password is incorrect' });
    await ready('/settings'); passwords(); click('Đổi mật khẩu');
    await screen.findByText(/Mật khẩu hiện tại không đúng/);
    expect(getSessionSnapshot()).toEqual(before);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Mật khẩu hiện tại')));
  });

  it('successful change clears captured session and displays an honest sign-in notice', async () => {
    vi.spyOn(authService, 'changePassword').mockResolvedValue(undefined);
    await ready('/settings'); passwords(); click('Đổi mật khẩu');
    await screen.findByText('Đã đổi mật khẩu. Đăng nhập bằng mật khẩu mới.');
    expect(getSessionSnapshot()).toBeNull();
    expect(screen.queryByText(/Phiên đăng nhập đã hết hạn/)).toBeNull();
  });

  it.each([false, true])('late success cannot clear/navigate a replacement session (same user=%s)', async sameUser => {
    let finish!: () => void;
    vi.spyOn(authService, 'changePassword').mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    await ready('/settings'); passwords(); click('Đổi mật khẩu');
    await act(async () => {
      saveSession({ ...RESULT, user: sameUser ? RESULT.user : { ...RESULT.user, id: 'b', displayName: 'Account B' } });
      finish();
    });
    const replacement = getSessionSnapshot();
    await screen.findByRole('navigation', { name: 'Tài khoản' });
    expect(getSessionSnapshot()).toEqual(replacement);
    expect(screen.queryByText('Đã đổi mật khẩu. Đăng nhập bằng mật khẩu mới.')).toBeNull();
    expect((screen.getByLabelText('Mật khẩu hiện tại') as HTMLInputElement).value).toBe('');
  });

  it('logged-out direct access does not render private fields', async () => {
    clearSession(); mount('/profile');
    await screen.findByRole('button', { name: 'Đăng nhập' });
    expect(screen.queryByLabelText('Tên hiển thị')).toBeNull();
  });
});
