import { describe, expect, it } from 'vitest';
import type { MyTaskDto } from '../../services/dashboard';
import { buildDashboardModel, calendarDeadlineCounts, readDashboardFilters } from './dashboard-model';

const now = Date.parse('2026-11-01T02:00:00Z');
const task = (id: string, rest: Partial<MyTaskDto> = {}): MyTaskDto => ({
  id, projectId: 'p1', projectName: 'GMind', title: id, status: 'ToDo', priority: 'Medium', ...rest,
});
const tasks = [
  task('past', { deadlineAt: '2026-10-31T16:59:59Z' }),
  task('today-overdue', { status: 'ChangesRequested', deadlineAt: '2026-10-31T17:00:00' }),
  task('now', { title: 'Kiểm thử Dashboard', status: 'InProgress', deadlineAt: '2026-11-01T02:00:00Z' }),
  task('later', { projectId: 'p2', projectName: 'Mobile', status: 'Submitted', deadlineAt: '2026-11-02T01:00:00+07:00' }),
  task('none', { projectId: 'p2', projectName: 'Mobile', status: 'InProgress' }),
  task('invalid', { deadlineAt: 'not-a-date' }),
  task('done', { status: 'Completed', deadlineAt: '2026-10-30T00:00:00Z' }),
];
const model = (query = '', data = tasks) => buildDashboardModel(data, readDashboardFilters(new URLSearchParams(query)), now);

describe('personal Dashboard counts and deadline boundaries', () => {
  it('counts open API entries and keeps global summary independent of filters', () => {
    expect(model().summary).toEqual({ all: 6, inProgress: 2, submitted: 1, overdue: 2 });
    expect(model('status=Submitted').summary).toEqual(model().summary);
    expect(model('status=Submitted').pageTasks.map(task => task.id)).toEqual(['later']);
    expect(tasks.map(task => task.id)).toEqual(['past', 'today-overdue', 'now', 'later', 'none', 'invalid', 'done']);
  });

  it('uses Vietnam calendar days, UTC for zone-less API values, and exact-instant overdue', () => {
    expect(model('period=today').pageTasks.map(task => task.id)).toEqual(['today-overdue', 'now']);
    expect(model('period=overdue').pageTasks.map(task => task.id)).toEqual(['past', 'today-overdue']);
    expect(model().upcoming.map(task => task.id)).toEqual(['now', 'later']);
    expect(Object.fromEntries(calendarDeadlineCounts(tasks))).toEqual({
      '2026-10-31': 1, '2026-11-01': 2, '2026-11-02': 1,
    });
  });

  it('combines project, status, search and dates without inventing group membership', () => {
    expect(model('project=p1&status=InProgress&q=%20KIỂM%20THỬ%20').pageTasks.map(task => task.id)).toEqual(['now']);
    expect(model('date=2026-11-02').pageTasks.map(task => task.id)).toEqual(['later']);
    expect(model('period=today&date=2026-11-02').total).toBe(0);
    expect(model('project=missing').total).toBe(0);
    expect(model('project=p2').calendarTasks.map(task => task.id)).toEqual(['later', 'none']);
  });

  it('paginates every filtered result and clamps stale page numbers', () => {
    const many = Array.from({ length: 9 }, (_, i) => task(`t${i}`));
    expect(model('', many).pageTasks.map(task => task.id)).toEqual(['t0', 't1', 't2', 't3', 't4', 't5']);
    const second = model('page=99', many);
    expect([second.page, second.pageCount, second.from, second.to, second.total]).toEqual([2, 2, 7, 9, 9]);
    expect(second.pageTasks.map(task => task.id)).toEqual(['t6', 't7', 't8']);
    expect(model('q=absent&page=99', many)).toMatchObject({ page: 1, pageCount: 1, from: 0, to: 0, total: 0 });
  });

  it('normalizes unsupported query values and invalid calendar dates', () => {
    expect(readDashboardFilters(new URLSearchParams('status=Admin&period=unknown&date=2026-02-30&page=-1')))
      .toMatchObject({ status: '', period: 'all', date: null, page: 1 });
    expect(readDashboardFilters(new URLSearchParams('date=2028-02-29&page=2')))
      .toMatchObject({ date: '2028-02-29', page: 2 });
    expect(readDashboardFilters(new URLSearchParams('page=Infinity'))).toMatchObject({ page: 1 });
  });
});
