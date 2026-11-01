// @vitest-environment jsdom
import { act, StrictMode } from 'react';
import { MemoryRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProtectedRoute from './ProtectedRoute';
import Login from '../pages/Login';
import api from '../services/api';
import { authService } from '../services/auth';
import { clearSession, getSessionSnapshot, saveSession, type AuthResult, type UserInfo } from '../services/session';

const USER: UserInfo = { id: 'u1', displayName: 'U', email: 'u@x' };
const session = (s: string): AuthResult => ({ accessToken: `AT-${s}`, refreshToken: `RT-${s}`, expiresAt: '2100-01-01', user: USER });

const apiCalls: InternalAxiosRequestConfig[] = [];
let apiReply: (c: InternalAxiosRequestConfig) => { status: number; data?: unknown } | Promise<{ status: number; data?: unknown }> =
  () => ({ status: 200, data: { data: USER } });

const originalAdapter = api.defaults.adapter;

const testAdapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
  apiCalls.push(config);
  const reply = await apiReply(config);
  if (reply.status >= 400) {
    throw new AxiosError(`status ${reply.status}`, undefined, config, {}, {
      status: reply.status, statusText: '', data: {}, headers: {}, config,
    } as AxiosResponse);
  }
  return { status: reply.status, statusText: '', data: reply.data ?? {}, headers: {}, config } as AxiosResponse;
};

beforeEach(() => {
  api.defaults.adapter = testAdapter;
});

function deferred<T>() {
  let resolve!: (v: T) => void; let reject!: (e?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="login-state">{JSON.stringify(location.state)}</div>;
}

function renderGuard(initial: string, strict = false) {
  const tree = (
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/login" element={<><LocationProbe /><div>LOGIN_PAGE</div></>} />
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<div>PRIVATE_DASH</div>} />
          <Route path="/other" element={<div>PRIVATE_OTHER</div>} />
        </Route>
      </Routes>
      <Link to="/other">go-other</Link>
    </MemoryRouter>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  clearSession();
  localStorage.clear();
  apiCalls.length = 0;
  apiReply = () => ({ status: 200, data: { data: USER } });
  api.defaults.adapter = originalAdapter;
});

describe('ProtectedRoute', () => {
  it('does not mount children before validation resolves', async () => {
    saveSession(session('a'));
    const d = deferred<UserInfo>();
    vi.spyOn(authService, 'validateSession').mockReturnValue(d.promise);
    renderGuard('/dashboard');
    expect(screen.queryByText('PRIVATE_DASH')).toBeNull();
    expect(screen.getByRole('status')).toBeTruthy();
    await act(async () => { d.resolve(USER); await d.promise; });
    expect(screen.getByText('PRIVATE_DASH')).toBeTruthy();
  });

  it('redirects unauthenticated deep link to login with original path in state', async () => {
    renderGuard('/dashboard?tab=1#top');
    expect(await screen.findByText('LOGIN_PAGE')).toBeTruthy();
    const state = JSON.parse(screen.getByTestId('login-state').textContent!);
    expect(state.from).toBe('/dashboard?tab=1#top');
    expect(state.sessionExpired).toBe(true);
  });

  it('waits again on route switch', async () => {
    saveSession(session('a'));
    const d1 = deferred<UserInfo>(); const d2 = deferred<UserInfo>();
    vi.spyOn(authService, 'validateSession')
      .mockReturnValueOnce(d1.promise).mockReturnValueOnce(d2.promise);
    renderGuard('/dashboard');
    await act(async () => { d1.resolve(USER); await d1.promise; });
    expect(screen.getByText('PRIVATE_DASH')).toBeTruthy();
    fireEvent.click(screen.getByText('go-other'));
    expect(screen.queryByText('PRIVATE_OTHER')).toBeNull();
    await act(async () => { d2.resolve(USER); await d2.promise; });
    expect(screen.getByText('PRIVATE_OTHER')).toBeTruthy();
  });

  it('revoked session unmounts private data and lands on login', async () => {
    saveSession(session('a'));
    vi.spyOn(authService, 'validateSession').mockResolvedValue(USER);
    renderGuard('/dashboard');
    expect(await screen.findByText('PRIVATE_DASH')).toBeTruthy();
    act(() => { clearSession(); });
    expect(await screen.findByText('LOGIN_PAGE')).toBeTruthy();
    expect(screen.queryByText('PRIVATE_DASH')).toBeNull();
  });

  it('transient 503 keeps tokens, shows retry and succeeds on retry', async () => {
    saveSession(session('a'));
    vi.spyOn(authService, 'validateSession')
      .mockRejectedValueOnce({ status: 503, message: 'down' })
      .mockResolvedValueOnce(USER);
    renderGuard('/dashboard');
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('PRIVATE_DASH')).toBeNull();
    expect(getSessionSnapshot()?.accessToken).toBe('AT-a');
    fireEvent.click(screen.getByText('Thử lại'));
    expect(await screen.findByText('PRIVATE_DASH')).toBeTruthy();
  });

  it('late validation resolve after navigation does not flash private content', async () => {
    saveSession(session('a'));
    const d1 = deferred<UserInfo>(); const d2 = deferred<UserInfo>();
    vi.spyOn(authService, 'validateSession')
      .mockReturnValueOnce(d1.promise).mockReturnValueOnce(d2.promise);
    renderGuard('/dashboard');
    fireEvent.click(screen.getByText('go-other'));
    await act(async () => { d1.resolve(USER); await d1.promise; });
    expect(screen.queryByText('PRIVATE_DASH')).toBeNull();
    expect(screen.queryByText('PRIVATE_OTHER')).toBeNull();
    await act(async () => { d2.resolve(USER); await d2.promise; });
    expect(screen.getByText('PRIVATE_OTHER')).toBeTruthy();
  });

  it('real validateSession performs exactly one /api/me and refreshes stored user', async () => {
    saveSession(session('a'));
    apiReply = () => ({ status: 200, data: { data: { ...USER, displayName: 'Updated profile' } } });
    renderGuard('/dashboard');
    expect(await screen.findByText('PRIVATE_DASH')).toBeTruthy();
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    const meCalls = apiCalls.filter(c => c.url === '/api/me');
    expect(meCalls.length).toBe(1);
    expect(meCalls[0].headers.Authorization).toBe('Bearer AT-a');
    expect(getSessionSnapshot()?.user.displayName).toBe('Updated profile');
  });

  it('StrictMode allows at most two mount validations, no unbounded loop', async () => {
    saveSession(session('a'));
    renderGuard('/dashboard', true);
    expect(await screen.findByText('PRIVATE_DASH')).toBeTruthy();
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    const meCalls = apiCalls.filter(c => c.url === '/api/me');
    expect(meCalls.length).toBeLessThanOrEqual(2);
    expect(meCalls.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Login return path', () => {
  function renderLogin(state: unknown) {
    return render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: state as object }]}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<div>DASH</div>} />
          <Route path="/tasks/abc" element={<div>AT_TASK</div>} />
        </Routes>
      </MemoryRouter>);
  }

  async function submit() {
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'a@b.c' } });
    fireEvent.change(screen.getByLabelText(/Mật khẩu/i), { target: { value: 'p' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
  }

  it('navigates to safe in-app return path', async () => {
    vi.spyOn(authService, 'login').mockResolvedValue(session('x'));
    vi.spyOn(authService, 'saveSession').mockImplementation(() => undefined);
    renderLogin({ from: '/tasks/abc' });
    await submit();
    expect(await screen.findByText('AT_TASK')).toBeTruthy();
  });

  it.each(['//external.example', '\\\\evil\\path', '/login', '/login?x=1', '/register#y', '/tasks/../login', '/\n/evil.example'])(
    'rejects unsafe return path %s and falls back to dashboard', async (from) => {
      vi.spyOn(authService, 'login').mockResolvedValue(session('x'));
      vi.spyOn(authService, 'saveSession').mockImplementation(() => undefined);
      renderLogin({ from });
      await submit();
      expect(await screen.findByText('DASH')).toBeTruthy();
    });
});
