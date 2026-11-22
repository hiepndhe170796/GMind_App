// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi, getFreshAccessToken } from './api';
import { clearSession, getSessionSnapshot, saveSession, type AuthResult } from './session';

const USER = { id: 'u1', displayName: 'U', email: 'u@x' };
const session = (accessToken: string, expiresAt: string, refreshToken = 'rt-1'): AuthResult =>
  ({ accessToken, refreshToken, expiresAt, user: USER });

beforeEach(() => { clearSession(); });
afterEach(() => { vi.restoreAllMocks(); clearSession(); localStorage.clear(); });

describe('getFreshAccessToken', () => {
  it('returns null without a session', async () => {
    expect(await getFreshAccessToken()).toBeNull();
  });

  it('returns the stored token when expiry is comfortably away', async () => {
    saveSession(session('at-fresh', new Date(Date.now() + 30 * 60_000).toISOString()));
    const post = vi.spyOn(authApi, 'post');
    expect(await getFreshAccessToken()).toBe('at-fresh');
    expect(post).not.toHaveBeenCalled();
  });

  it('refreshes first when expiry is under 60 s away and dedupes concurrent calls', async () => {
    saveSession(session('at-old', new Date(Date.now() + 30_000).toISOString()));
    const post = vi.spyOn(authApi, 'post').mockImplementation(async () => ({
      data: { data: session('at-new', new Date(Date.now() + 30 * 60_000).toISOString(), 'rt-2') },
    })) as never;
    const [a, b] = await Promise.all([getFreshAccessToken(), getFreshAccessToken()]);
    expect(a).toBe('at-new');
    expect(b).toBe('at-new');
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('/api/auth/refresh', { refreshToken: 'rt-1' });
    expect(getSessionSnapshot()?.accessToken).toBe('at-new');
    expect(getSessionSnapshot()?.refreshToken).toBe('rt-2');
  });

  it('falls back to the stored token when the refresh attempt fails', async () => {
    saveSession(session('at-old', new Date(Date.now() + 30_000).toISOString()));
    vi.spyOn(authApi, 'post').mockRejectedValue({ status: 500 }) as never;
    expect(await getFreshAccessToken()).toBe('at-old');
  });
});
