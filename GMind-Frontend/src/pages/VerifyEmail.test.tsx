// @vitest-environment jsdom
import { StrictMode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import VerifyEmail from './VerifyEmail';
import { authService } from '../services/auth';
import { clearSession, getSessionSnapshot, saveSession, SESSION_STORAGE_KEY, type AuthResult } from '../services/session';

const SESSION: AuthResult = {
  accessToken: 'at', refreshToken: 'rt', expiresAt: '2100-01-01',
  user: { id: 'u1', displayName: 'A', email: 'old@x.dev' },
};

function at(tokenHash: string) {
  window.history.replaceState(null, '', `/verify-email${tokenHash}`);
}

beforeEach(() => { clearSession(); });
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); clearSession(); localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('/verify-email', () => {
  it('verifies once (StrictMode-safe), strips #token= and shows the new email', async () => {
    at('#token=tok-abc');
    const verify = vi.spyOn(authService, 'verifyEmailChange').mockResolvedValue({ email: 'new@x.dev' });
    render(<StrictMode><MemoryRouter initialEntries={['/verify-email']}><VerifyEmail /></MemoryRouter></StrictMode>);
    expect(window.location.hash).toBe(''); // stripped immediately
    expect(await screen.findByRole('heading', { name: 'Email đăng nhập của bạn đã đổi thành new@x.dev.' })).toBeTruthy();
    expect(verify).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledWith('tok-abc');
    expect(screen.getByRole('link', { name: 'Đăng nhập' }).getAttribute('href')).toBe('/login');
  });

  it('shows the server message on an invalid/expired token', async () => {
    at('#token=bad');
    vi.spyOn(authService, 'verifyEmailChange').mockRejectedValue({ status: 400, message: 'Liên kết đã hết hạn.' });
    render(<MemoryRouter initialEntries={['/verify-email']}><VerifyEmail /></MemoryRouter>);
    expect(await screen.findByText('Không xác minh được')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Liên kết đã hết hạn.');
  });

  it('missing token renders the invalid-link state without a POST', async () => {
    at('');
    const verify = vi.spyOn(authService, 'verifyEmailChange');
    render(<MemoryRouter initialEntries={['/verify-email']}><VerifyEmail /></MemoryRouter>);
    expect(await screen.findByText('Liên kết xác minh không hợp lệ.')).toBeTruthy();
    expect(verify).not.toHaveBeenCalled();
  });

  it('updates the stored user email and offers Về hồ sơ when signed in', async () => {
    saveSession(SESSION);
    at('#token=tok-1');
    vi.spyOn(authService, 'verifyEmailChange').mockResolvedValue({ email: 'new@x.dev' });
    vi.spyOn(authService, 'validateSession').mockResolvedValue({ ...SESSION.user, email: 'new@x.dev' });
    render(<MemoryRouter initialEntries={['/verify-email']}><VerifyEmail /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Email đăng nhập của bạn đã đổi thành new@x.dev.' })).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY)!).user.email).toBe('new@x.dev');
    expect(getSessionSnapshot()?.user.email).toBe('new@x.dev');
    expect(screen.getByRole('link', { name: 'Về hồ sơ' }).getAttribute('href')).toBe('/profile');
  });
});
