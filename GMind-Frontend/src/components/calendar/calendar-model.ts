import { timestamp, dayKey } from '../../utils/presentation';
import type { MyTaskDto } from '../../services/dashboard';

export interface CalendarFilters {
  month: string; date: string; view: 'month' | 'list';
  search: string; project: string; status: string; priority: string; overdue: boolean;
}
export interface CalTask extends MyTaskDto {
  day: string; time: number; overdue: boolean;
}
export interface CalProject { id: string; name: string; }
export interface CalendarModel {
  open: CalTask[]; scoped: CalTask[]; monthTasks: CalTask[]; selectedTasks: CalTask[];
  undated: CalTask[]; byDate: Map<string, CalTask[]>; projects: CalProject[];
  monthCount: number; overdueCount: number;
}

const OPEN_STATUSES = ['ToDo', 'InProgress', 'Submitted', 'ChangesRequested'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];
const DAY_MS = 86400000;
const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export function toDay(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
// civil-UTC construction without Date.UTC's 0-99 -> 1900 quirk
export function utcDay(y: number, m: number, d: number): number {
  const dt = new Date(0); dt.setUTCFullYear(y, m - 1, d); return dt.getTime();
}
export function isDay(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  return y >= 1 && y <= 9999 && m >= 1 && m <= 12 && toDay(utcDay(y, m, d)) === s;
}
export function isMonth(s: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(s)) return false;
  const [y, m] = s.split('-').map(Number);
  return y >= 1 && y <= 9999 && m >= 1 && m <= 12;
}
export function vnToday(): string { return dayKey(new Date().toISOString()); }
export function todayFrom(ms: number): string { return dayKey(new Date(ms).toISOString()); }

export function readCalendarFilters(params: URLSearchParams, today: string): CalendarFilters {
  const q = params.get('q')?.trim() ?? '';
  const project = params.get('project') ?? '';
  const status = OPEN_STATUSES.includes(params.get('status') ?? '') ? params.get('status')! : '';
  const priority = PRIORITIES.includes(params.get('priority') ?? '') ? params.get('priority')! : '';
  const overdue = params.get('overdue') === '1';
  const view = params.get('view') === 'list' ? 'list' : 'month';
  const rawM = params.get('month'), rawD = params.get('date');
  const month = rawM && isMonth(rawM) ? rawM : (rawD && isDay(rawD) ? rawD.slice(0, 7) : today.slice(0, 7));
  const date = rawD && isDay(rawD)
    ? (rawD.slice(0, 7) === month ? rawD : rawM && isMonth(rawM) ? (today.slice(0, 7) === rawM ? today : `${rawM}-01`) : rawD)
    : today.slice(0, 7) === month ? today : `${month}-01`;
  return { month, date, view, search: q, project, status, priority, overdue };
}

export function buildMonthCells(month: string): { date: string; inMonth: boolean }[] {
  const [y, m] = month.split('-').map(Number);
  const first = utcDay(y, m, 1);
  const dow = (new Date(first).getUTCDay() + 6) % 7; // Monday first
  const start = first - dow * DAY_MS;
  return Array.from({ length: 42 }, (_, i) => {
    const date = toDay(start + i * DAY_MS);
    return { date, inMonth: date.slice(0, 7) === month };
  });
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const next = m - 1 + delta;
  const ny = y + Math.floor(next / 12);
  if (ny < 1 || ny > 9999) return month; // out-of-range: stay
  return toDay(utcDay(ny, ((next % 12) + 12) % 12 + 1, 1)).slice(0, 7);
}
export function clampDateToMonth(date: string, month: string): string {
  const [y, m] = month.split('-').map(Number);
  const days = new Date(utcDay(y, m + 1, 0)).getUTCDate();
  return `${month}-${pad(Math.min(+date.slice(8), days))}`;
}
export function moveDate(date: string, key: string): string {
  const ms = Date.parse(`${date}T00:00:00Z`);
  const day = new Date(ms).getUTCDay();
  if (key === 'ArrowLeft' || key === 'ArrowRight') return toDay(ms + (key === 'ArrowRight' ? 1 : -1) * DAY_MS);
  if (key === 'ArrowUp' || key === 'ArrowDown') return toDay(ms + (key === 'ArrowDown' ? 7 : -7) * DAY_MS);
  if (key === 'Home') return toDay(ms - ((day + 6) % 7) * DAY_MS);
  if (key === 'End') return toDay(ms + (6 - ((day + 6) % 7)) * DAY_MS);
  if (key === 'PageUp' || key === 'PageDown')
    return clampDateToMonth(date, shiftMonth(date.slice(0, 7), key === 'PageDown' ? 1 : -1));
  return date;
}

const byInstant = (a: CalTask, b: CalTask) => (a.time - b.time) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);

export function buildCalendarModel(tasks: MyTaskDto[], f: CalendarFilters, now: number): CalendarModel {
  const open: CalTask[] = [];
  for (const t of tasks) {
    if (t.status === 'Completed') continue;
    const d = t.deadlineAt ? timestamp(t.deadlineAt) : null;
    const time = d && Number.isFinite(d.getTime()) ? d.getTime() : NaN;
    open.push({ ...t, day: Number.isFinite(time) ? dayKey(t.deadlineAt!) : '', time, overdue: Number.isFinite(time) && time < now });
  }
  const seen = new Map<string, number>();
  const projects: CalProject[] = [];
  for (const t of open) {
    if (seen.has(t.projectId)) continue;
    seen.set(t.projectId, (seen.get(t.projectId) ?? 0) + 1);
    const name = t.projectName.trim() || t.projectId;
    const dup = projects.some(p => p.name === name);
    projects.push({ id: t.projectId, name: dup ? `${name} (${t.projectId.slice(0, 4)})` : name });
  }
  projects.sort((a, b) => a.name.localeCompare(b.name));
  const scoped = open.filter(t =>
    (!f.search || `${t.title} ${t.projectName}`.toLowerCase().includes(f.search.toLowerCase())) &&
    (!f.project || t.projectId === f.project) &&
    (!f.status || t.status === f.status) &&
    (!f.priority || t.priority === f.priority) &&
    (!f.overdue || t.overdue));
  const dated = scoped.filter(t => t.day).sort(byInstant);
  const monthTasks = dated.filter(t => t.day.slice(0, 7) === f.month);
  const byDate = new Map<string, CalTask[]>();
  for (const t of dated) { const a = byDate.get(t.day) ?? []; a.push(t); byDate.set(t.day, a); }
  const selectedTasks = byDate.get(f.date) ?? [];
  const undated = scoped.filter(t => !t.day);
  return {
    open, scoped, monthTasks, selectedTasks, undated, byDate, projects,
    monthCount: monthTasks.length, overdueCount: monthTasks.filter(t => t.overdue).length,
  };
}
