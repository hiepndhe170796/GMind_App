// @vitest-environment jsdom
import { AxiosError, type AxiosAdapter } from 'axios';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import api, { authApi } from './api';
import { authService } from './auth';
import { clearSession, getSessionEndReason, getSessionSnapshot, saveSession, type AuthResult } from './session';
import { isSafeAvatarUrl } from '../utils/account-form';

const RESULT: AuthResult = {
  accessToken: 'test-access', refreshToken: 'test-refresh', expiresAt: '2100-01-01',
  user: { id: 'account-a', displayName: 'Account A', email: 'a@test.dev', avatarUrl: null },
};
const original = api.defaults.adapter;
const originalAuth = authApi.defaults.adapter;

beforeEach(() => { clearSession(); saveSession(RESULT); });
afterEach(() => { api.defaults.adapter = original; authApi.defaults.adapter = originalAuth; clearSession(); localStorage.clear(); });

describe('account service and session identity', () => {
  it('publishes an atomic scoped end reason and clears it for a new session', () => {
    const id = getSessionSnapshot()!.id;
    clearSession('wrong-session', 'passwordChanged');
    expect(getSessionSnapshot()?.id).toBe(id);
    expect(getSessionEndReason()).toBeNull();
    clearSession(id, 'passwordChanged');
    expect(getSessionSnapshot()).toBeNull();
    expect(getSessionEndReason()).toBe('passwordChanged');
    saveSession(RESULT);
    expect(getSessionEndReason()).toBeNull();
  });
  it('PATCHes only supported fields and replaces user without rotating credentials/session id', async () => {
    const before = getSessionSnapshot()!;
    const saved = { ...RESULT.user, displayName: 'Updated', avatarUrl: 'https://example.com/a@b.png' };
    let payload: unknown;
    api.defaults.adapter = async config => {
      expect(config.url).toBe('/api/me'); expect(config.method).toBe('patch');
      payload = JSON.parse(config.data);
      return { config, status: 200, statusText: 'OK', headers: {}, data: { data: saved } };
    };
    expect(await authService.updateProfile(saved.displayName, saved.avatarUrl)).toEqual(saved);
    expect(payload).toEqual({ displayName: saved.displayName, avatarUrl: saved.avatarUrl });
    expect(getSessionSnapshot()).toEqual({ ...before, user: saved });
  });

  it('sends null to remove avatar', async () => {
    api.defaults.adapter = async config => {
      expect(JSON.parse(config.data).avatarUrl).toBeNull();
      return { config, status: 200, statusText: 'OK', headers: {}, data: { data: RESULT.user } };
    };
    await authService.updateProfile('Account A', null);
  });

  it.each([false, true])('rejects late profile responses after another session (same user=%s)', async sameUser => {
    let release!: () => void;
    let started!: () => void;
    const entered = new Promise<void>(resolve => { started = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    api.defaults.adapter = async config => {
      started(); await gate;
      return { config, status: 200, statusText: 'OK', headers: {}, data: { data: { ...RESULT.user, displayName: 'Late' } } };
    };
    const pending = authService.updateProfile('Late', null);
    await entered;
    saveSession({ ...RESULT, user: sameUser ? RESULT.user : { ...RESULT.user, id: 'account-b', displayName: 'Account B' } });
    const replacement = getSessionSnapshot();
    release();
    await expect(pending).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
    expect(getSessionSnapshot()).toEqual(replacement);
  });

  it('wrong-current 400 traverses real Axios interceptors without refresh/replay or session loss', async () => {
    const before = getSessionSnapshot();
    let requests = 0, refreshes = 0;
    authApi.defaults.adapter = async () => { refreshes++; throw new Error('Unexpected refresh'); };
    api.defaults.adapter = async config => {
      requests++;
      expect(JSON.parse(config.data)).toEqual({ currentPassword: 'wrong', newPassword: 'NewTest123!', confirmPassword: 'NewTest123!' });
      throw new AxiosError('Validation', 'ERR_BAD_REQUEST', config, undefined, {
        config, status: 400, statusText: 'Bad Request', headers: {}, data: { message: 'Current password is incorrect' },
      });
    };
    await expect(authService.changePassword('wrong', 'NewTest123!', 'NewTest123!')).rejects.toMatchObject({ status: 400 });
    expect(requests).toBe(1); expect(refreshes).toBe(0);
    expect(getSessionSnapshot()).toEqual(before);
  });

  it('successful password service does not perform an unscoped local logout', async () => {
    const before = getSessionSnapshot();
    const adapter: AxiosAdapter = async config => ({ config, status: 200, statusText: 'OK', headers: {}, data: { data: { message: 'Password changed' } } });
    api.defaults.adapter = adapter;
    await authService.changePassword('OldTest123!', 'NewTest123!', 'NewTest123!');
    expect(getSessionSnapshot()).toEqual(before);
  });
});

describe('avatar URL boundary', () => {
  it.each(['https://example.com/a.png', 'HTTP://localhost:5173/favicon.svg', 'https://example.com/a@b?q=x@y'])('allows %s', value => {
    expect(isSafeAvatarUrl(value)).toBe(true);
  });
  it.each(['', 'ftp://example.com/a.png', 'javascript:alert(1)', 'https://u:p@example.com/a.png', 'https://',
    'http:example.com/a.png', 'https://example.com/a\nb', 'https://example.com/a\u0000b', `https://example.com/${'a'.repeat(500)}`])('rejects unsafe or invalid URL', value => {
    expect(isSafeAvatarUrl(value)).toBe(false);
  });
});
