import { request, type APIRequestContext } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(HERE, '.auth');
const USERS_FILE = path.join(AUTH_DIR, 'users.json');
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

export const E2E_ROLES = ['leader', 'member1', 'member2', 'outsider'] as const;
export type E2eRole = (typeof E2E_ROLES)[number];

export interface E2eAuth {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  user: { id: string; displayName: string; email: string; avatarUrl?: string | null };
}
export interface E2eUser { email: string; password: string; auth: E2eAuth }
export type E2eUsers = Record<E2eRole, E2eUser>;
export interface E2ePool { runId: string; users: E2eUsers }

const RATE_LIMIT_MSG = 'API đang giới hạn đăng nhập (10 lần/phút). Đợi 1 phút rồi chạy lại, hoặc khởi động API với RateLimiting__LoginPermitLimit=1000.';

async function registerAndLogin(ctx: APIRequestContext, role: E2eRole, runId: string): Promise<E2eUser> {
  const email = `e2e-${runId}-${role}@e2e.gmind.test`;
  const password = `E2e!${crypto.randomUUID().replaceAll('-', '').slice(0, 14)}z9`;
  const reg = await ctx.post('/api/auth/register', {
    data: { displayName: `E2E ${role} ${runId}`, email, password, confirmPassword: password },
  });
  if (reg.status() === 429) throw new Error(RATE_LIMIT_MSG);
  if (!reg.ok()) throw new Error(`register ${role}: ${reg.status()} ${await reg.text()}`);
  const login = await ctx.post('/api/auth/login', { data: { email, password } });
  if (login.status() === 429) throw new Error(RATE_LIMIT_MSG);
  if (!login.ok()) throw new Error(`login ${role}: ${login.status()} ${await login.text()}`);
  const auth = (await login.json()).data as E2eAuth;
  return { email, password, auth };
}

// Refresh is not rate-limited, so a saved pool is reused across runs without
// spending auth-login calls.
async function refreshAll(saved: E2eUsers, ctx: APIRequestContext): Promise<E2eUsers | null> {
  const users = {} as E2eUsers;
  for (const role of E2E_ROLES) {
    const res = await ctx.post('/api/auth/refresh', { data: { refreshToken: saved[role].auth.refreshToken } });
    if (!res.ok()) return null;
    users[role] = { ...saved[role], auth: (await res.json()).data as E2eAuth };
  }
  return users;
}

export default async function globalSetup() {
  const ctx = await request.newContext({ baseURL: BASE });
  mkdirSync(AUTH_DIR, { recursive: true });
  let pool: E2ePool | null = null;
  if (existsSync(USERS_FILE)) {
    try {
      const saved = JSON.parse(readFileSync(USERS_FILE, 'utf8')) as E2ePool;
      if (saved.users && E2E_ROLES.every(r => saved.users[r]?.auth?.refreshToken)) {
        const users = await refreshAll(saved.users, ctx);
        if (users) pool = { runId: saved.runId, users };
      }
    } catch { /* fall through to a fresh pool */ }
  }
  if (!pool) {
    const runId = Date.now().toString(36);
    const users = {} as E2eUsers;
    for (const role of E2E_ROLES) users[role] = await registerAndLogin(ctx, role, runId);
    pool = { runId, users };
  }
  writeFileSync(USERS_FILE, JSON.stringify(pool, null, 1));
  await ctx.dispose();
}
