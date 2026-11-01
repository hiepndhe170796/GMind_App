export interface UserInfo { id: string; displayName: string; email: string; avatarUrl?: string }
export interface AuthResult { accessToken: string; refreshToken: string; expiresAt: string; user: UserInfo }
export interface SessionRecord extends AuthResult { id: string }

export const SESSION_STORAGE_KEY = 'gmind.session.v1';
const LEGACY_KEYS = ['accessToken', 'refreshToken', 'user'] as const;

const storage = (): Storage | null =>
  typeof localStorage === 'undefined' ? null : localStorage;

const listeners = new Set<() => void>();
let snapshot: SessionRecord | null = readSnapshot();

function isValidRecord(value: unknown): value is SessionRecord {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  const user = r.user as Record<string, unknown> | undefined;
  return typeof r.id === 'string' && r.id.length > 0
    && typeof r.accessToken === 'string' && r.accessToken.length > 0
    && typeof r.refreshToken === 'string' && r.refreshToken.length > 0
    && typeof r.expiresAt === 'string'
    && !!user && typeof user === 'object'
    && typeof user.id === 'string' && user.id.length > 0
    && typeof user.displayName === 'string'
    && typeof user.email === 'string'
    && (user.avatarUrl === undefined || user.avatarUrl === null || typeof user.avatarUrl === 'string');
}

function readSnapshot(): SessionRecord | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValidRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function notify() {
  for (const listener of [...listeners]) listener();
}

function removeLegacy() {
  const store = storage();
  for (const key of LEGACY_KEYS) store?.removeItem(key);
}

export function getSessionSnapshot(): SessionRecord | null {
  return snapshot;
}

export function synchronizeSession(): SessionRecord | null {
  const next = readSnapshot();
  if (JSON.stringify(next) !== JSON.stringify(snapshot)) {
    snapshot = next;
    notify();
  }
  return snapshot;
}

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function saveSession(result: AuthResult): void {
  const store = storage();
  if (!store) return;
  const record: SessionRecord = { ...result, id: crypto.randomUUID() };
  store.setItem(SESSION_STORAGE_KEY, JSON.stringify(record));
  removeLegacy();
  snapshot = record;
  notify();
}

export function rotateSession(result: AuthResult, expectedId: string, expectedRefreshToken: string): boolean {
  const current = synchronizeSession();
  if (!current || current.id !== expectedId || current.refreshToken !== expectedRefreshToken) return false;
  const store = storage();
  if (!store) return false;
  const record: SessionRecord = { ...result, id: current.id };
  store.setItem(SESSION_STORAGE_KEY, JSON.stringify(record));
  removeLegacy();
  snapshot = record;
  notify();
  return true;
}

export function updateSessionUser(user: UserInfo, expectedId: string): void {
  const current = synchronizeSession();
  if (!current || current.id !== expectedId) return;
  const store = storage();
  if (!store) return;
  const record: SessionRecord = { ...current, user };
  store.setItem(SESSION_STORAGE_KEY, JSON.stringify(record));
  snapshot = record;
  notify();
}

export function clearSession(expectedId?: string): void {
  const current = synchronizeSession();
  if (expectedId && current?.id !== expectedId) return;
  const store = storage();
  store?.removeItem(SESSION_STORAGE_KEY);
  removeLegacy();
  if (snapshot !== null) { snapshot = null; notify(); }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== null && event.key !== SESSION_STORAGE_KEY) return;
    synchronizeSession();
  });
}
