import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { normalizeApiError, type ApiError } from './api-errors';
import {
  clearSession, getSessionSnapshot, rotateSession, synchronizeSession,
  type AuthResult, type SessionRecord,
} from './session';

const configuredTimeout = Number(import.meta.env.VITE_API_TIMEOUT);

const sharedOptions = {
  baseURL: (import.meta.env.VITE_API_URL ?? '').trim() || '/',
  timeout: Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 30000,
};

const api = axios.create(sharedOptions);
export const authApi = axios.create(sharedOptions);
authApi.interceptors.response.use((res) => res, (err) => Promise.reject(normalizeApiError(err)));

type SessionRequest = InternalAxiosRequestConfig & {
  _gmindSessionId?: string;
  _gmindAccessToken?: string;
  _gmindRetried?: boolean;
};

const sessionChanged = (): ApiError => ({ status: 401, code: 'SESSION_CHANGED', message: 'Phiên đăng nhập đã thay đổi. Vui lòng đăng nhập lại.' });
const isApiError = (e: unknown): e is ApiError => !!e && typeof e === 'object' && 'message' in e && !(e instanceof AxiosError);
const wrap = (e: unknown): ApiError => (isApiError(e) ? e : normalizeApiError(e));

api.interceptors.request.use((config: SessionRequest) => {
  const session = synchronizeSession();
  if (!session) return Promise.reject(sessionChanged());
  if (!config._gmindRetried) config._gmindSessionId = session.id;
  if (config._gmindSessionId !== session.id) return Promise.reject(sessionChanged());
  config._gmindAccessToken = session.accessToken;
  config.headers.Authorization = `Bearer ${session.accessToken}`;
  return config;
});

interface RefreshJob { sessionId: string; refreshToken: string; promise: Promise<AuthResult> }
let refreshJob: RefreshJob | null = null;
let logoutJob: Promise<LogoutResult> | null = null;

function rawRefresh(refreshToken: string): Promise<AuthResult> {
  return authApi.post('/api/auth/refresh', { refreshToken }).then((res) => res.data.data as AuthResult);
}

function refreshSession(captured: SessionRecord): Promise<void> {
  if (refreshJob && refreshJob.sessionId === captured.id && refreshJob.refreshToken === captured.refreshToken) {
    return refreshJob.promise.then(() => undefined);
  }
  const job: RefreshJob = {
    sessionId: captured.id,
    refreshToken: captured.refreshToken,
    promise: rawRefresh(captured.refreshToken),
  };
  refreshJob = job;
  return job.promise.then((result) => {
    if (refreshJob === job) refreshJob = null;
    const current = synchronizeSession();
    if (!current || current.id !== captured.id) throw sessionChanged();
    if (current.refreshToken !== captured.refreshToken) return;
    rotateSession(result, current.id, captured.refreshToken);
  }).catch((error: unknown) => {
    if (refreshJob === job) refreshJob = null;
    const normalized = wrap(error);
    if (normalized.status === 401) {
      const current = synchronizeSession();
      if (current && current.id === captured.id && current.refreshToken === captured.refreshToken) {
        clearSession(current.id);
      } else if (current && current.id === captured.id) {
        return;
      }
    }
    throw normalized;
  });
}

api.interceptors.response.use(
  (res) => {
    const config = res.config as SessionRequest;
    const current = synchronizeSession();
    if (config._gmindSessionId && (!current || current.id !== config._gmindSessionId)) {
      return Promise.reject(sessionChanged());
    }
    return res;
  },
  async (error) => {
    const config = error?.config as SessionRequest | undefined;
    const normalized = wrap(error);
    if (!config || normalized.status !== 401 || error?.config?.url?.startsWith('/api/auth/')) {
      return Promise.reject(normalized);
    }
    const current = synchronizeSession();
    if (!current || current.id !== config._gmindSessionId) return Promise.reject(sessionChanged());
    if (config._gmindRetried) {
      if (current.accessToken === config._gmindAccessToken) clearSession(current.id);
      return Promise.reject(normalized);
    }
    config._gmindRetried = true;
    if (current.accessToken === config._gmindAccessToken) {
      try {
        await refreshSession(current);
      } catch (refreshError: unknown) {
        const latest = synchronizeSession();
        if (latest && latest.id === config._gmindSessionId && latest.refreshToken !== current.refreshToken) {
          return api.request(config);
        }
        return Promise.reject(refreshError);
      }
    }
    if (getSessionSnapshot()?.id !== config._gmindSessionId) return Promise.reject(sessionChanged());
    return api.request(config);
  },
);

export interface LogoutResult { serverRevoked: boolean }

export function waitForLogout(): Promise<void> {
  return logoutJob ? logoutJob.then(() => undefined, () => undefined) : Promise.resolve();
}

export function logoutSession(): Promise<LogoutResult> {
  if (logoutJob) return logoutJob;
  const current = synchronizeSession();
  if (!current) {
    clearSession();
    return Promise.resolve({ serverRevoked: true });
  }
  const captured = current;
  const capturedJob = refreshJob && refreshJob.sessionId === captured.id && refreshJob.refreshToken === captured.refreshToken
    ? refreshJob : null;
  if (capturedJob === refreshJob && capturedJob) refreshJob = null;
  clearSession(captured.id);

  const job = (async (): Promise<LogoutResult> => {
    try {
      await authApi.post('/api/auth/logout', null, { headers: { Authorization: `Bearer ${captured.accessToken}` } });
      return { serverRevoked: true };
    } catch (first: unknown) {
      const normalized = wrap(first);
      if (normalized.status === 401 && captured.refreshToken) {
        try {
          const rotated = capturedJob
            ? await capturedJob.promise
            : await rawRefresh(captured.refreshToken);
          await authApi.post('/api/auth/logout', null, { headers: { Authorization: `Bearer ${rotated.accessToken}` } });
          return { serverRevoked: true };
        } catch {
          return { serverRevoked: false };
        }
      }
      return { serverRevoked: false };
    }
  })();
  const tracked = job.finally(() => { if (logoutJob === tracked) logoutJob = null; });
  logoutJob = tracked;
  return tracked;
}

export default api;
