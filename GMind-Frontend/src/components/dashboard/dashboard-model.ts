import type { MyTaskDto } from '../../services/dashboard';
import { dayKey, timestamp } from '../../utils/presentation';

export type DashboardPeriod = 'all' | 'today' | 'overdue';
export type DashboardStatus = '' | 'ToDo' | 'InProgress' | 'Submitted' | 'ChangesRequested';
export interface DashboardFilters {
  search: string;
  project: string;
  status: DashboardStatus;
  period: DashboardPeriod;
  date: string | null;
  page: number;
}

export const DASHBOARD_PAGE_SIZE = 6;
const STATUSES: DashboardStatus[] = ['ToDo', 'InProgress', 'Submitted', 'ChangesRequested'];

export function readDashboardFilters(params: URLSearchParams): DashboardFilters {
  const date = params.get('date') ?? '';
  const parsedDate = new Date(`${date}T00:00:00Z`);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date)
    && Number.isFinite(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === date;
  const status = params.get('status') as DashboardStatus;
  const period = params.get('period');
  const page = Number(params.get('page') ?? 1);
  return {
    search: params.get('q') ?? '',
    project: params.get('project') ?? '',
    status: STATUSES.includes(status) ? status : '',
    period: period === 'today' || period === 'overdue' ? period : 'all',
    date: validDate ? date : null,
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
}

export function deadlineTime(value?: string | null): number | null {
  if (!value) return null;
  const time = timestamp(value).getTime();
  return Number.isFinite(time) ? time : null;
}

export function calendarDeadlineCounts(tasks: readonly MyTaskDto[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    if (!task.deadlineAt || task.status === 'Completed') continue;
    const date = dayKey(task.deadlineAt);
    if (date) counts.set(date, (counts.get(date) ?? 0) + 1);
  }
  return counts;
}

/** Counts API task entries assigned to this user, not project progress or contribution. */
export function buildDashboardModel(tasks: readonly MyTaskDto[], filters: DashboardFilters, now: number) {
  const today = dayKey(new Date(now).toISOString());
  const openTasks = tasks.filter(task => task.status !== 'Completed').sort((a, b) => {
    const left = deadlineTime(a.deadlineAt) ?? Infinity;
    const right = deadlineTime(b.deadlineAt) ?? Infinity;
    return left === right ? 0 : left < right ? -1 : 1;
  });
  const isOverdue = (task: MyTaskDto) => {
    const time = deadlineTime(task.deadlineAt);
    return time !== null && time < now;
  };
  const summary = {
    all: openTasks.length,
    inProgress: openTasks.filter(task => task.status === 'InProgress').length,
    submitted: openTasks.filter(task => task.status === 'Submitted').length,
    overdue: openTasks.filter(isOverdue).length,
  };
  const projects = [...new Map(openTasks.map(task => [
    task.projectId, { id: task.projectId, name: task.projectName },
  ])).values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const query = filters.search.trim().toLocaleLowerCase('vi');
  const scopedTasks = openTasks.filter(task =>
    (!filters.project || task.projectId === filters.project)
    && (!filters.status || task.status === filters.status)
    && (!query || `${task.title} ${task.projectName}`.toLocaleLowerCase('vi').includes(query)));
  const filteredTasks = scopedTasks.filter(task => {
    const date = task.deadlineAt ? dayKey(task.deadlineAt) : '';
    return (filters.period !== 'today' || date === today)
      && (filters.period !== 'overdue' || isOverdue(task))
      && (!filters.date || date === filters.date);
  });
  const upcoming = scopedTasks.filter(task => {
    const time = deadlineTime(task.deadlineAt);
    return time !== null && time >= now;
  }).slice(0, 3);
  const total = filteredTasks.length;
  const pageCount = Math.max(1, Math.ceil(total / DASHBOARD_PAGE_SIZE));
  const page = Math.min(filters.page, pageCount);
  const start = (page - 1) * DASHBOARD_PAGE_SIZE;
  return {
    openTasks, summary, projects, today, upcoming,
    calendarTasks: scopedTasks,
    filteredTasks,
    pageTasks: filteredTasks.slice(start, start + DASHBOARD_PAGE_SIZE),
    total, page, pageCount,
    from: total ? start + 1 : 0,
    to: Math.min(start + DASHBOARD_PAGE_SIZE, total),
    hasFilters: !!(query || filters.project || filters.status || filters.date || filters.period !== 'all'),
  };
}
