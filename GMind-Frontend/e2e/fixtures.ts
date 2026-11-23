import { test as base, type BrowserContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { E2ePool, E2eUser, E2eUsers } from './global-setup.ts';

const USERS_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '.auth', 'users.json');

export function loadPool(): E2ePool {
  return JSON.parse(readFileSync(USERS_FILE, 'utf8')) as E2ePool;
}

// Injects a stored AuthResult as a session record (same shape as
// isValidRecord in src/services/session.ts). Pool sessions must never be
// logged out or password-changed by any spec.
export async function signIn(context: BrowserContext, role: keyof E2eUsers | E2eUser): Promise<void> {
  const auth = typeof role === 'string' ? loadPool().users[role].auth : role.auth;
  await context.addInitScript(([key, value]) => {
    localStorage.setItem(key, value);
  }, ['gmind.session.v1', JSON.stringify({ ...auth, id: crypto.randomUUID() })]);
}

export const test = base.extend<{ users: E2eUsers }>({
  users: async ({ request: _unused }, provide) => { await provide(loadPool().users); },
});

// Unread-notification count parsed from the nav link's accessible name
// ("Thông báo, N chưa đọc"); 0 when no count is announced.
export async function unreadCount(page: Page): Promise<number> {
  const name = await page.getByRole('link', { name: /chưa đọc/ }).getAttribute('aria-label');
  const m = /(\d+)\s*chưa đọc/.exec(name ?? '');
  return m ? Number(m[1]) : 0;
}

export { expect } from '@playwright/test';
