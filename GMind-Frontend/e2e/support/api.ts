import { request, type APIRequestContext } from '@playwright/test';
import type { E2eUser } from '../global-setup.ts';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

export interface GroupDto { id: string; name: string }
export interface InviteDto { id: string; code: string }
export interface ProjectDto { id: string; name: string; groupId: string }
export interface TaskDto {
  id: string; title: string; status: string;
  assigneeUserId: string | null; deadlineAt: string | null; projectId: string;
}
export interface TaskFields {
  title: string; assigneeUserId?: string; deadlineAt?: string;
  points?: number; parentTaskId?: string;
}

async function call<T>(ctx: APIRequestContext, method: string, path: string, body?: unknown): Promise<T> {
  const res = await ctx.fetch(path, { method, data: body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok()) throw new Error(`${method} ${path}: ${res.status()} ${JSON.stringify(json).slice(0, 300)}`);
  return (json.data ?? json) as T;
}

/** Request context authenticated as a pool user. Dispose it when done. */
export function apiAs(user: E2eUser): Promise<APIRequestContext> {
  return request.newContext({ baseURL: BASE, extraHTTPHeaders: { Authorization: `Bearer ${user.auth.accessToken}` } });
}

/** Raw request returning {status, json} — for asserting expected 4xx. */
export async function raw(ctx: APIRequestContext, method: string, path: string, body?: unknown) {
  const res = await ctx.fetch(path, { method, data: body });
  const json = await res.json().catch(() => ({}));
  return { status: res.status(), json };
}

export const api = {
  createGroup: (ctx: APIRequestContext, name: string) =>
    call<GroupDto>(ctx, 'POST', '/api/groups', { name }),
  createInvite: (ctx: APIRequestContext, groupId: string, maxUses = 5) =>
    call<InviteDto>(ctx, 'POST', `/api/groups/${groupId}/invites`, { maxUses }),
  joinGroup: (ctx: APIRequestContext, code: string) =>
    call<unknown>(ctx, 'POST', '/api/groups/join', { code }),
  createProject: (ctx: APIRequestContext, groupId: string, name: string, deadline?: string) =>
    call<ProjectDto>(ctx, 'POST', `/api/groups/${groupId}/projects`, { name, deadline }),
  createTask: (ctx: APIRequestContext, projectId: string, fields: TaskFields) =>
    call<TaskDto>(ctx, 'POST', `/api/projects/${projectId}/tasks`, fields),
  getTask: (ctx: APIRequestContext, taskId: string) =>
    call<TaskDto>(ctx, 'GET', `/api/tasks/${taskId}`),
  setStatus: (ctx: APIRequestContext, taskId: string, status: number, comment?: string) =>
    call<unknown>(ctx, 'POST', `/api/tasks/${taskId}/status`, { status, comment }),
};

export const isoInDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
export const runTag = () => Date.now().toString(36);
