// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import api, { authApi, logoutSession, waitForLogout } from './api';
import { authService } from './auth';
import {
  SESSION_STORAGE_KEY, clearSession, getSessionSnapshot, rotateSession, saveSession,
  subscribeSession, synchronizeSession, type AuthResult, type SessionRecord,
} from './session';

const USER = { id: 'u1', displayName: 'User One', email: 'u1@test.dev' };
const USER2 = { id: 'u2', displayName: 'User Two', email: 'u2@test.dev' };
const auth = (suffix: string, user = USER): AuthResult => ({
  accessToken: `AT-${suffix}`, refreshToken: `RT-${suffix}`, expiresAt: '2100-01-01', user,
});

type Reply = { status: number; data?: unknown };
type Handler = (config: InternalAxiosRequestConfig) => Reply | Promise<Reply>;

let apiHandler: Handler = () => ({ status: 200, data: { data: {} } });
let authHandler: Handler = () => ({ status: 200, data: { data: {} } });
const apiCalls: InternalAxiosRequestConfig[] = [];
const authCalls: InternalAxiosRequestConfig[] = [];
const origApiAdapter = api.defaults.adapter;
const origAuthAdapter = authApi.defaults.adapter;

function adapter(calls: InternalAxiosRequestConfig[], handler: () => Handler) {
  return async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
    calls.push(config);
    const reply = await handler()(config);
    if (reply.status >= 400) {
      throw new AxiosError(`status ${reply.status}`, undefined, config, {}, {
        status: reply.status, statusText: '', data: reply.data ?? {}, headers: {}, config,
      } as AxiosResponse);
    }
    return { status: reply.status, statusText: '', data: reply.data ?? {}, headers: {}, config } as AxiosResponse;
  };
}

const setApi = (h: Handler) => { apiHandler = h; };
const setAuth = (h: Handler) => { authHandler = h; };
const getCount = (url: string) => authCalls.filter(c => c.url === url).length;
const tick = () => new Promise(r => setTimeout(r, 0));

beforeEach(() => {
  localStorage.clear();
  apiCalls.length = 0; authCalls.length = 0;
  apiHandler = () => ({ status: 200, data: { data: {} } });
  authHandler = () => ({ status: 200, data: { data: {} } });
  api.defaults.adapter = adapter(apiCalls, () => apiHandler);
  authApi.defaults.adapter = adapter(authCalls, () => authHandler);
});

afterEach(async () => {
  await waitForLogout();
  clearSession();
  localStorage.clear();
  api.defaults.adapter = origApiAdapter;
  authApi.defaults.adapter = origAuthAdapter;
  vi.restoreAllMocks();
});

const seedSession = (suffix = '1', user = USER) => saveSession(auth(suffix, user));
const bearers = (url: string) => apiCalls.filter(c => c.url === url).map(c => c.headers.Authorization);

describe('protected api session flow', () => {
  it('concurrent 401s share one refresh and replay with the new token', async () => {
    seedSession('old');
    let refreshCalls = 0;
    setAuth(c => {
      if (c.url === '/api/auth/refresh') { refreshCalls++; return { status: 200, data: { data: auth('new') } }; }
      return { status: 200, data: { data: {} } };
    });
    const seen = new Map<string, number>();
    setApi(c => {
      const n = (seen.get(c.url ?? '') ?? 0) + 1; seen.set(c.url ?? '', n);
      return n === 1 ? { status: 401 } : { status: 200, data: { data: 'ok' } };
    });
    const [r1, r2] = await Promise.all([api.get('/api/me'), api.get('/api/dashboard/my-tasks')]);
    expect(r1.status).toBe(200); expect(r2.status).toBe(200);
    expect(refreshCalls).toBe(1);
    const session = getSessionSnapshot()!;
    expect(session.accessToken).toBe('AT-new');
    expect(session.refreshToken).toBe('RT-new');
    for (const url of ['/api/me', '/api/dashboard/my-tasks']) {
      expect(bearers(url)).toEqual(['Bearer AT-old', 'Bearer AT-new']);
    }
  });

  it('a delayed second 401 after refresh reuses the rotated token without another refresh', async () => {
    seedSession('old');
    let refreshCalls = 0;
    setAuth(c => c.url === '/api/auth/refresh' ? (refreshCalls++, { status: 200, data: { data: auth('new') } }) : { status: 200, data: {} });
    let releaseOther!: (r: Reply) => void;
    const otherGate = new Promise<Reply>(res => { releaseOther = res; });
    let meCalls = 0, otherCalls = 0;
    setApi(c => {
      if (c.url === '/api/me') return ++meCalls === 1 ? { status: 401 } : { status: 200, data: {} };
      return ++otherCalls === 1 ? otherGate : { status: 200, data: {} };
    });
    const first = api.get('/api/me');
    const second = api.get('/api/other');
    second.catch(() => undefined);
    await tick();
    await first;
    releaseOther({ status: 401 });
    await second;
    expect(refreshCalls).toBe(1);
    expect(bearers('/api/other')).toEqual(['Bearer AT-old', 'Bearer AT-new']);
  });

  it('replay 401 does not loop and clears the session', async () => {
    seedSession('old');
    setAuth(c => c.url === '/api/auth/refresh' ? { status: 200, data: { data: auth('new') } } : { status: 200, data: {} });
    setApi(() => ({ status: 401 }));
    await expect(api.get('/api/me')).rejects.toMatchObject({ status: 401 });
    expect(getSessionSnapshot()).toBeNull();
    expect(apiCalls.filter(c => c.url === '/api/me')).toHaveLength(2);
  });

  it('replay 401 keeps credentials rotated after the replay was dispatched', async () => {
    seedSession('old');
    setAuth(c => c.url === '/api/auth/refresh' ? { status: 200, data: { data: auth('new') } } : { status: 200, data: {} });
    let releaseReplay!: (r: Reply) => void;
    const replayGate = new Promise<Reply>(res => { releaseReplay = res; });
    let calls = 0;
    setApi(() => (++calls === 1 ? { status: 401 } : replayGate));
    const request = api.get('/api/me');
    request.catch(() => undefined);
    await tick(); // original 401 in flight; refresh completes
    await tick();
    const latest = getSessionSnapshot()!;
    expect(latest.refreshToken).toBe('RT-new');
    expect(calls).toBe(2);
    expect(rotateSession(auth('newer'), latest.id, latest.refreshToken)).toBe(true);
    releaseReplay({ status: 401 });
    await expect(request).rejects.toMatchObject({ status: 401 });
    expect(getSessionSnapshot()?.id).toBe(latest.id);
    expect(getSessionSnapshot()?.accessToken).toBe('AT-newer');
    expect(getSessionSnapshot()?.refreshToken).toBe('RT-newer');
    expect(calls).toBe(2);
  });

  it('refresh 401 clears session and rejects all waiters', async () => {
    seedSession('old');
    let releaseRefresh!: (r: Reply) => void;
    const refreshGate = new Promise<Reply>(res => { releaseRefresh = res; });
    let refreshCalls = 0;
    setAuth(c => c.url === '/api/auth/refresh' ? (refreshCalls++, refreshGate) : { status: 200, data: {} });
    setApi(() => ({ status: 401 }));
    const r1 = api.get('/api/me');
    const r2 = api.get('/api/other');
    r1.catch(() => undefined); r2.catch(() => undefined);
    await tick();
    releaseRefresh({ status: 401 });
    const results = await Promise.allSettled([r1, r2]);
    expect(results.every(r => r.status === 'rejected')).toBe(true);
    expect(refreshCalls).toBe(1);
    expect(apiCalls.filter(c => c.url === '/api/me')).toHaveLength(1);
    expect(apiCalls.filter(c => c.url === '/api/other')).toHaveLength(1);
    expect(getSessionSnapshot()).toBeNull();
  });

  it('public login 401 sends no bearer and preserves existing session', async () => {
    seedSession('old');
    setAuth(c => {
      if (c.url === '/api/health/ready') return { status: 200, data: 'Healthy' };
      if (c.url === '/api/auth/login') return { status: 401, data: { message: 'Invalid' } };
      return { status: 200, data: {} };
    });
    await expect(authService.login('x@x.dev', 'bad')).rejects.toMatchObject({ status: 401 });
    expect(getSessionSnapshot()?.accessToken).toBe('AT-old');
    const loginReq = authCalls.find(c => c.url === '/api/auth/login')!;
    expect(loginReq.headers.Authorization).toBeUndefined();
    expect(getCount('/api/auth/refresh')).toBe(0);
  });

  it('protected 403/404 never refresh or clear the session', async () => {
    seedSession('old');
    setApi(c => ({ status: c.url === '/api/x' ? 403 : 404 }));
    await expect(api.get('/api/x')).rejects.toMatchObject({ status: 403 });
    await expect(api.get('/api/y')).rejects.toMatchObject({ status: 404 });
    expect(getCount('/api/auth/refresh')).toBe(0);
    expect(getSessionSnapshot()?.accessToken).toBe('AT-old');
  });

  it('transient refresh 503 keeps credentials and propagates the error', async () => {
    seedSession('old');
    setAuth(c => c.url === '/api/auth/refresh' ? { status: 503, data: { code: 'X' } } : { status: 200, data: {} });
    setApi(() => ({ status: 401 }));
    await expect(api.get('/api/me')).rejects.toMatchObject({ status: 503 });
    expect(getSessionSnapshot()?.accessToken).toBe('AT-old');
  });

  it('transient refresh network failure keeps credentials and propagates', async () => {
    seedSession('old');
    setAuth(c => c.url === '/api/auth/refresh'
      ? Promise.reject(new AxiosError('Network Error', 'ERR_NETWORK', c))
      : { status: 200, data: {} });
    setApi(() => ({ status: 401 }));
    await expect(api.get('/api/me')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(getSessionSnapshot()?.accessToken).toBe('AT-old');
  });

  it('delayed refresh success after logout cannot restore the session', async () => {
    seedSession('old');
    let releaseRefresh!: (r: Reply) => void;
    const gate = new Promise<Reply>(res => { releaseRefresh = res; });
    setAuth(c => {
      if (c.url === '/api/auth/refresh') return gate;
      if (c.url === '/api/auth/logout') return { status: 200, data: {} };
      return { status: 200, data: {} };
    });
    setApi(() => ({ status: 401 }));
    const request = api.get('/api/me');
    request.catch(() => undefined);
    await tick();
    await logoutSession();
    releaseRefresh({ status: 200, data: { data: auth('new') } });
    await expect(request).rejects.toMatchObject({ status: 401 });
    expect(getSessionSnapshot()).toBeNull();
  });

  it('delayed refresh 401 after a new login does not clear the new session', async () => {
    seedSession('old');
    let releaseRefresh!: (r: Reply) => void;
    const gate = new Promise<Reply>(res => { releaseRefresh = res; });
    setAuth(c => c.url === '/api/auth/refresh' ? gate : { status: 200, data: {} });
    setApi(() => ({ status: 401 }));
    const request = api.get('/api/me');
    request.catch(() => undefined);
    await tick();
    const first = getSessionSnapshot()!;
    saveSession(auth('user2', USER2));
    releaseRefresh({ status: 401 });
    await expect(request).rejects.toMatchObject({ status: 401 });
    const current = getSessionSnapshot()!;
    expect(current.id).not.toBe(first.id);
    expect(current.user.id).toBe('u2');
    expect(current.accessToken).toBe('AT-user2');
  });

  it('late original protected 401 after new login does not refresh or replay as new user', async () => {
    seedSession('old');
    let refreshCalls = 0;
    setAuth(c => c.url === '/api/auth/refresh' ? (refreshCalls++, { status: 200, data: { data: auth('new') } }) : { status: 200, data: {} });
    let release!: (r: Reply) => void;
    const gate = new Promise<Reply>(res => { release = res; });
    setApi(() => gate);
    const request = api.get('/api/me');
    request.catch(() => undefined);
    await tick();
    saveSession(auth('user2', USER2));
    release({ status: 401 });
    await expect(request).rejects.toMatchObject({ status: 401 });
    expect(refreshCalls).toBe(0);
    expect(apiCalls.filter(c => c.url === '/api/me')).toHaveLength(1);
    expect(getSessionSnapshot()?.accessToken).toBe('AT-user2');
  });

  it('late protected success after identity switch is discarded', async () => {
    seedSession('one');
    let release!: (r: Reply) => void;
    const gate = new Promise<Reply>(res => { release = res; });
    setApi(() => gate);
    const request = api.get('/api/me');
    request.catch(() => undefined);
    await tick();
    saveSession(auth('two', USER2));
    release({ status: 200, data: { data: USER } });
    await expect(request).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
  });
});

describe('logoutSession', () => {
  it('clears synchronously, sends bearer, survives network failure', async () => {
    seedSession('old');
    localStorage.setItem('unrelated', 'keep');
    setAuth(c => {
      if (c.url === '/api/auth/logout') return Promise.reject(new AxiosError('Network Error', 'ERR_NETWORK', c));
      return { status: 200, data: {} };
    });
    const result = await logoutSession();
    expect(result.serverRevoked).toBe(false);
    expect(getSessionSnapshot()).toBeNull();
    expect(localStorage.getItem('unrelated')).toBe('keep');
    expect(authCalls.find(c => c.url === '/api/auth/logout')!.headers.Authorization).toBe('Bearer AT-old');
  });

  it('expired-access logout refreshes raw once then revokes without restoring storage', async () => {
    seedSession('old');
    let refreshCalls = 0; const logoutBearers: unknown[] = [];
    setAuth(c => {
      if (c.url === '/api/auth/refresh') { refreshCalls++; return { status: 200, data: { data: auth('rot') } }; }
      if (c.url === '/api/auth/logout') {
        logoutBearers.push(c.headers.Authorization);
        return logoutBearers.length === 1 ? { status: 401 } : { status: 200, data: {} };
      }
      return { status: 200, data: {} };
    });
    const result = await logoutSession();
    expect(result.serverRevoked).toBe(true);
    expect(refreshCalls).toBe(1);
    expect(logoutBearers).toEqual(['Bearer AT-old', 'Bearer AT-rot']);
    expect(getSessionSnapshot()).toBeNull();
  });

  it('concurrent logout calls share one job and gate login until settled', async () => {
    seedSession('old');
    let releaseLogout!: (r: Reply) => void;
    const gate = new Promise<Reply>(res => { releaseLogout = res; });
    let logoutCalls = 0, readyCalls = 0, loginCalls = 0;
    setAuth(c => {
      if (c.url === '/api/auth/logout') { logoutCalls++; return gate; }
      if (c.url === '/api/health/ready') { readyCalls++; return { status: 200, data: 'Healthy' }; }
      if (c.url === '/api/auth/login') { loginCalls++; return { status: 200, data: { data: auth('back') } }; }
      return { status: 200, data: {} };
    });
    const p1 = logoutSession();
    const p2 = logoutSession();
    expect(getSessionSnapshot()).toBeNull();
    const loginP = authService.login('x@x.dev', 'pw');
    loginP.catch(() => undefined);
    await tick();
    expect(logoutCalls).toBe(1);
    expect(readyCalls).toBe(0);
    expect(loginCalls).toBe(0);
    releaseLogout({ status: 500 });
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.serverRevoked).toBe(false);
    expect(r2.serverRevoked).toBe(false);
    await loginP;
    expect(loginCalls).toBe(1);
  });
});

describe('session store', () => {
  it('malformed storage does not crash; storage event clears snapshot', () => {
    localStorage.setItem(SESSION_STORAGE_KEY, '{broken');
    expect(synchronizeSession()).toBeNull();
    clearSession();
    seedSession('x');
    expect(getSessionSnapshot()).not.toBeNull();
    localStorage.clear();
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(getSessionSnapshot()).toBeNull();
  });

  it('synchronizeSession adopts external writes, removals and malformed data with notify', () => {
    seedSession('one');
    const first = getSessionSnapshot()!;
    const listener = vi.fn();
    const unsub = subscribeSession(listener);
    const foreign: SessionRecord = { ...auth('foreign', USER2), id: 'foreign-id' };
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(foreign));
    expect(synchronizeSession()?.id).toBe('foreign-id');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(synchronizeSession()).toBe(getSessionSnapshot());
    expect(listener).toHaveBeenCalledTimes(1);
    localStorage.removeItem(SESSION_STORAGE_KEY);
    expect(synchronizeSession()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
    localStorage.setItem(SESSION_STORAGE_KEY, '{nope');
    expect(synchronizeSession()).toBeNull();
    clearSession();
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(foreign));
    window.dispatchEvent(new StorageEvent('storage', { key: SESSION_STORAGE_KEY }));
    expect(getSessionSnapshot()?.id).toBe('foreign-id');
    localStorage.removeItem(SESSION_STORAGE_KEY);
    window.dispatchEvent(new StorageEvent('storage', { key: SESSION_STORAGE_KEY }));
    expect(getSessionSnapshot()).toBeNull();
    unsub();
    expect(first.id).not.toBe('foreign-id');
  });

  it('rotation keeps session id, login changes it, stale CAS rejected, legacy keys removed', () => {
    localStorage.setItem('accessToken', 'legacy');
    localStorage.setItem('user', '{}');
    seedSession('one');
    const first = getSessionSnapshot()!;
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(rotateSession(auth('rot'), first.id, 'RT-one')).toBe(true);
    const rotated = getSessionSnapshot()!;
    expect(rotated.id).toBe(first.id);
    expect(rotated.accessToken).toBe('AT-rot');
    expect(rotated.refreshToken).toBe('RT-rot');
    expect(rotateSession(auth('bad'), first.id, 'RT-one')).toBe(false);
    expect(getSessionSnapshot()?.accessToken).toBe('AT-rot');
    saveSession(auth('two', USER2));
    expect(getSessionSnapshot()!.id).not.toBe(first.id);
    expect(authService.currentUser()?.id).toBe('u2');
    expect(authService.isLoggedIn()).toBe(true);
  });
});
