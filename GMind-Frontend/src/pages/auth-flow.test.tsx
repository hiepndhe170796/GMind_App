// @vitest-environment jsdom
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Login from './Login';
import Register from './Register';
import ForgotPassword from './ForgotPassword';
import ResetPassword from './ResetPassword';
import Input from '../components/ui/Input';
import { authService } from '../services/auth';
import { clearSession } from '../services/session';
import type { AuthResult, UserInfo } from '../services/session';

const USER: UserInfo = { id: 'u1', displayName: 'U', email: 'u@x.dev' };
const result = (): AuthResult => ({ accessToken: 'AT', refreshToken: 'RT', expiresAt: '2100-01-01', user: USER });

function renderAt(entry: string | object, extra?: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[entry as never]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/join-group" element={<div>JOIN_GROUP</div>} />
        <Route path="/dashboard" element={<div>DASH</div>} />
        <Route path="/tasks/1" element={<div>TASK</div>} />
        {extra}
      </Routes>
    </MemoryRouter>
  );
}

const emailInput = () => screen.getByLabelText(/Email/i) as HTMLInputElement;
const pwInput = () => screen.getByLabelText(/^Mật khẩu/i) as HTMLInputElement;
const confirmInput = () => screen.getByLabelText(/Xác nhận/i) as HTMLInputElement;
const type = (el: HTMLElement, v: string) => fireEvent.change(el, { target: { value: v } });
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));

afterEach(() => { cleanup(); vi.restoreAllMocks(); clearSession(); localStorage.clear(); });

describe('Login', () => {
  it('validates inline, marks aria-invalid, focuses first error, never calls API', async () => {
    const login = vi.spyOn(authService, 'login');
    renderAt('/login');
    type(emailInput(), 'not-an-email');
    click('Đăng nhập');
    expect(login).not.toHaveBeenCalled();
    expect(emailInput().getAttribute('aria-invalid')).toBe('true');
    expect(emailInput().getAttribute('aria-describedby')).toContain('email-error');
    expect(document.activeElement).toBe(emailInput());
  });

  it('401 shows alert, fields retained; valid login respects safe return path', async () => {
    const login = vi.spyOn(authService, 'login').mockRejectedValue({ status: 401 });
    renderAt({ pathname: '/login', state: { from: '/tasks/1' } });
    type(emailInput(), 'a@b.c'); type(pwInput(), 'pw');
    await click('Đăng nhập');
    expect((await screen.findByRole('alert')).textContent).toContain('Email hoặc mật khẩu không đúng.');
    expect(emailInput().value).toBe('a@b.c');
    login.mockResolvedValue(result());
    const save = vi.spyOn(authService, 'saveSession').mockImplementation(() => undefined);
    await click('Đăng nhập');
    expect(save).toHaveBeenCalled();
    expect(await screen.findByText('TASK')).toBeTruthy();
  });
});

describe('Register', () => {
  it('mismatch blocks request and focuses confirm', async () => {
    const reg = vi.spyOn(authService, 'register');
    renderAt('/register');
    type(screen.getByLabelText(/Tên hiển thị/i), 'A');
    type(emailInput(), 'a@b.c'); type(pwInput(), 'Password1!'); type(confirmInput(), 'Other123!');
    click('Tạo tài khoản');
    expect(reg).not.toHaveBeenCalled();
    expect(confirmInput().getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Mật khẩu xác nhận không khớp.')).toBeTruthy();
    expect(document.activeElement).toBe(confirmInput());
  });

  it('valid register calls register then login, saves session, goes join-group; autocomplete set', async () => {
    const reg = vi.spyOn(authService, 'register').mockResolvedValue(USER);
    const login = vi.spyOn(authService, 'login').mockResolvedValue(result());
    vi.spyOn(authService, 'saveSession').mockImplementation(() => undefined);
    renderAt('/register');
    expect(emailInput().autocomplete).toBe('email');
    expect(pwInput().autocomplete).toBe('new-password');
    type(screen.getByLabelText(/Tên hiển thị/i), 'User A');
    type(emailInput(), 'a@b.c'); type(pwInput(), 'Password1!'); type(confirmInput(), 'Password1!');
    await click('Tạo tài khoản');
    expect(reg).toHaveBeenCalledWith('User A', 'a@b.c', 'Password1!', 'Password1!');
    expect(login).toHaveBeenCalledWith('a@b.c', 'Password1!');
    expect(await screen.findByText('JOIN_GROUP')).toBeTruthy();
  });

  it('409 shows email inline error, no login; retry path retries only login', async () => {
    const reg = vi.spyOn(authService, 'register')
      .mockRejectedValueOnce({ status: 409 })
      .mockResolvedValueOnce(USER);
    const login = vi.spyOn(authService, 'login')
      .mockRejectedValueOnce({ status: 500, message: 'x' })
      .mockResolvedValue(result());
    vi.spyOn(authService, 'saveSession').mockImplementation(() => undefined);
    renderAt('/register');
    type(screen.getByLabelText(/Tên hiển thị/i), 'U');
    type(emailInput(), 'dup@b.c'); type(pwInput(), 'Password1!'); type(confirmInput(), 'Password1!');
    await click('Tạo tài khoản');
    expect(await screen.findByText('Email này đã được đăng ký. Hãy đăng nhập hoặc dùng email khác.')).toBeTruthy();
    expect(emailInput().getAttribute('aria-invalid')).toBe('true');
    expect(emailInput().disabled).toBe(false);
    await waitFor(() => expect(document.activeElement).toBe(emailInput()));
    expect(login).not.toHaveBeenCalled();
    reg.mockResolvedValueOnce(USER);
    await click('Tạo tài khoản');
    expect(reg).toHaveBeenCalledTimes(2);
    expect(login).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Thử đăng nhập lại' })).toBeTruthy();
    await click('Thử đăng nhập lại');
    expect(reg).toHaveBeenCalledTimes(2);
    expect(login).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('JOIN_GROUP')).toBeTruthy();
  });
});

describe('ForgotPassword', () => {
  it('disables input while pending, re-enables and retains it after rejection', async () => {
    let reject!: (e: unknown) => void;
    const gate = new Promise<never>((_, r) => { reject = r; });
    const forgot = vi.spyOn(authService, 'forgotPassword').mockReturnValue(gate);
    renderAt('/forgot-password');
    type(emailInput(), 'a@b.c');
    fireEvent.click(screen.getByRole('button', { name: 'Gửi hướng dẫn đặt lại' }));
    await waitFor(() => expect(emailInput().disabled).toBe(true));
    reject({ code: 'NETWORK_ERROR', message: 'x' });
    expect(await screen.findByRole('alert')).toBeTruthy();
    await waitFor(() => expect(emailInput().disabled).toBe(false));
    expect(emailInput().value).toBe('a@b.c');
    forgot.mockReset();
  });

  it('shows generic confirmation on success; network error keeps input', async () => {
    const forgot = vi.spyOn(authService, 'forgotPassword').mockResolvedValue();
    renderAt('/forgot-password');
    type(emailInput(), 'a@b.c');
    await click('Gửi hướng dẫn đặt lại');
    expect((await screen.findByRole('status')).textContent).toContain('Nếu địa chỉ này có tài khoản');
    expect(forgot).toHaveBeenCalledWith('a@b.c');
    forgot.mockReset().mockRejectedValue({ code: 'NETWORK_ERROR', message: 'x' });
    fireEvent.click(screen.getByRole('button', { name: 'Dùng email khác' }));
    type(emailInput(), 'b@c.d');
    await click('Gửi hướng dẫn đặt lại');
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
    expect(emailInput().value).toBe('b@c.d');
  });
});

describe('ResetPassword', () => {
  it('missing token shows invalid-link state, no form, login footer', () => {
    renderAt('/reset-password');
    expect(screen.getByText('Liên kết không hợp lệ')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Yêu cầu liên kết mới' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Về đăng nhập' }).getAttribute('href')).toBe('/login');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('mismatch blocks request; encoded token decoded exactly; success links to login', async () => {
    const reset = vi.spyOn(authService, 'resetPassword').mockResolvedValue();
    renderAt('/reset-password#token=tok%2B%2F%3D');
    type(pwInput(), 'NewPass123!'); type(confirmInput(), 'Different!');
    await click('Lưu mật khẩu mới');
    expect(reset).not.toHaveBeenCalled();
    type(confirmInput(), 'NewPass123!');
    await click('Lưu mật khẩu mới');
    expect(reset).toHaveBeenCalledWith('tok+/=', 'NewPass123!', 'NewPass123!');
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Đăng nhập bằng mật khẩu mới' })).toBeTruthy();
    expect(screen.queryByText('Liên kết không hợp lệ')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Về đăng nhập' })).toBeNull();
  });

  it('expired token offers new-link request', async () => {
    vi.spyOn(authService, 'resetPassword').mockRejectedValue({ status: 400, message: 'Invalid or expired reset token' });
    renderAt('/reset-password#token=old');
    type(pwInput(), 'NewPass123!'); type(confirmInput(), 'NewPass123!');
    await click('Lưu mật khẩu mới');
    expect((await screen.findByRole('alert')).textContent).toContain('hết hạn');
    expect(screen.getByRole('link', { name: 'Yêu cầu liên kết mới' })).toBeTruthy();
  });
});

describe('Input a11y composition', () => {
  it('preserves caller aria-describedby alongside hint/error ids', () => {
    render(<Input id="t1" label="L" hint="help" error="bad" aria-describedby="custom-id" />);
    const el = document.getElementById('t1')!;
    const desc = el.getAttribute('aria-describedby')!;
    expect(desc).toContain('custom-id');
    expect(desc).toContain('t1-hint');
    expect(desc).toContain('t1-error');
    expect(el.getAttribute('aria-invalid')).toBe('true');
  });
});
