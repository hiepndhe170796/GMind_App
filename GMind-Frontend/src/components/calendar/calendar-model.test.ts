import { describe, expect, it } from 'vitest';
import { readCalendarFilters, buildMonthCells, shiftMonth, clampDateToMonth, isDay, isMonth, moveDate, buildCalendarModel } from './calendar-model';
import type { MyTaskDto } from '../../services/dashboard';

const NOW = Date.parse('2026-02-15T12:00:00Z');
const TODAY = '2026-02-15';
const t = (id: string, deadlineAt?: string, over: Partial<MyTaskDto> = {}): MyTaskDto =>
  ({ id, projectId: 'p1', projectName: 'Proj', title: `T${id}`, status: 'ToDo', priority: 'Medium', deadlineAt, ...over });

describe('readCalendarFilters', () => {
  const rd = (q: string) => readCalendarFilters(new URLSearchParams(q), TODAY);
  it('defaults today/month, parses valid values', () => {
    expect(rd('')).toEqual({ month: '2026-02', date: '2026-02-15', view: 'month', search: '', project: '', status: '', priority: '', overdue: false });
    expect(rd('month=2026-01&date=2026-01-31&view=list&q=x&project=P&status=InProgress&priority=Urgent&overdue=1')).toEqual(
      { month: '2026-01', date: '2026-01-31', view: 'list', search: 'x', project: 'P', status: 'InProgress', priority: 'Urgent', overdue: true });
  });
  it('falls back on invalid month/date/enums', () => {
    expect(rd('month=2026-13')).toMatchObject({ month: '2026-02' });
    expect(rd('date=2026-02-30').date).toBe('2026-02-15'); // strict real-date roundtrip
    expect(rd('status=Done&priority=X&view=weird')).toMatchObject({ status: '', priority: '', view: 'month' });
    expect(rd('month=2026-01&date=2026-02-15')).toMatchObject({ date: '2026-01-01' }); // explicit month governs
    expect(rd('date=2026-02-30&month=2026-01')).toMatchObject({ month: '2026-01' });
  });
});
describe('month arithmetic', () => {
  it('42 cells Monday-first, adjacent months included', () => {
    const feb = buildMonthCells('2024-02'); // leap, Feb 1 = Thursday
    expect(feb.length).toBe(42);
    expect(feb[0]).toEqual({ date: '2024-01-29', inMonth: false }); // Monday
    expect(feb.filter(c => c.inMonth).length).toBe(29);
    expect(feb[41]).toEqual({ date: '2024-03-10', inMonth: false });
  });
  it('shiftMonth Dec/Jan wraps; clampDateToMonth handles Jan31->Feb', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(clampDateToMonth('2026-01-31', '2026-02')).toBe('2026-02-28');
    expect(clampDateToMonth('2024-01-31', '2024-02')).toBe('2024-02-29');
  });
  it('moveDate arrows/Home/End/PageUp/Down', () => {
    expect(moveDate('2026-02-15', 'ArrowRight')).toBe('2026-02-16');
    expect(moveDate('2026-02-01', 'ArrowLeft')).toBe('2026-01-31');
    expect(moveDate('2026-02-15', 'ArrowDown')).toBe('2026-02-22');
    expect(moveDate('2026-02-15', 'Home')).toBe('2026-02-09');   // Sunday 15 -> Monday 9
    expect(moveDate('2026-02-15', 'End')).toBe('2026-02-15');    // Sunday -> Sunday
    expect(moveDate('2026-01-31', 'PageDown')).toBe('2026-02-28');
    expect(moveDate('2026-02-15', 'X')).toBe('2026-02-15');
  });
});
describe('buildCalendarModel', () => {
  const tasks = [
    t('a', '2026-02-10T00:00:00Z'),
    t('b', '2026-02-10T10:00:00Z', { title: 'A first' }),
    t('done', '2026-02-12T00:00:00Z', { status: 'Completed' }),
    t('nodate', undefined),
    t('mar', '2026-03-05T00:00:00Z'),
    t('bad', 'not-a-date'),
    t('edge', '2026-12-31T16:59:59Z'),   // VN Dec 31 23:59 -> Dec 31
    t('edge2', '2026-12-31T17:00:00Z'),  // VN Jan 1 00:00 -> Jan 2027
  ];
  const f = { month: '2026-02', date: '2026-02-10', view: 'month' as const, search: '', project: '', status: '', priority: '', overdue: false };
  it('drops Completed/undated/invalid from grid, overdue strictly before now', () => {
    const m = buildCalendarModel(tasks, f, NOW);
    expect(m.open.map(x => x.id)).not.toContain('done');
    expect(m.monthTasks.map(x => x.id)).not.toContain('nodate');
    expect(m.monthTasks.map(x => x.id)).not.toContain('bad');
    expect(m.undated.map(x => x.id)).toEqual(['nodate', 'bad']);
    const edge = m.open.find(x => x.id === 'edge')!;
    const edge2 = m.open.find(x => x.id === 'edge2')!;
    expect(edge.day).toBe('2026-12-31');
    expect(edge2.day).toBe('2027-01-01');
    expect(m.overdueCount).toBe(2); // a+b past; edge/edge2 future
    expect(m.monthCount).toBe(2);
    expect(m.monthTasks.map(x => x.id)).toEqual(['a', 'b']); // instant then title/id stable
    expect(m.selectedTasks.map(x => x.id)).toEqual(['a', 'b']);
    expect(m.projects).toEqual([{ id: 'p1', name: 'Proj' }]);
  });
  it('exact deadline == now is NOT overdue; combined filters scope results', () => {
    const eq = buildCalendarModel([t('x', '2026-02-15T12:00:00Z')], f, NOW);
    expect(eq.open[0].overdue).toBe(false);
    const m = buildCalendarModel(tasks, { ...f, search: 'first', project: 'p1', status: 'ToDo', priority: 'Medium', overdue: true }, NOW);
    expect(m.monthTasks.map(x => x.id)).toEqual(['b']);
    expect(m.projects).toEqual([{ id: 'p1', name: 'Proj' }]); // options from all open incl undated
  });
});

describe('round-2 contract', () => {
  const t2 = (id: string, deadlineAt: string | undefined, projectId: string, projectName: string): MyTaskDto =>
    ({ id, projectId, projectName, title: `T${id}`, status: 'ToDo', priority: 'Medium', deadlineAt });
  it('duplicate project names dedupe by ID, filter by projectId only', () => {
    const tasks = [t2('a', '2026-02-10T00:00:00Z', 'p1', 'Same'), t2('b', '2026-02-10T00:00:00Z', 'p2', 'Same'), t2('c', '2026-02-10T00:00:00Z', 'p3', 'Other')];
    const f = { month: '2026-02', date: '2026-02-10', view: 'month' as const, search: '', project: 'p1', status: '', priority: '', overdue: false };
    const m = buildCalendarModel(tasks, f, NOW);
    expect(m.projects.map(p => p.id).sort()).toEqual(['p1', 'p2', 'p3']);
    expect(m.projects.find(p => p.id === 'p2')!.name).toBe('Same (p2)'); // disambiguated
    expect(m.monthTasks.map(x => x.id)).toEqual(['a']); // only p1 filtered
  });
  it('byDate groups ALL scoped dated incl adjacent-month cells', () => {
    const tasks = [t2('a', '2026-02-10T00:00:00Z', 'p1', 'P'), t2('jan', '2026-01-31T00:00:00Z', 'p1', 'P'), t2('mar', '2026-03-01T00:00:00Z', 'p1', 'P')];
    const f = { month: '2026-02', date: '2026-02-10', view: 'month' as const, search: '', project: '', status: '', priority: '', overdue: false };
    const m = buildCalendarModel(tasks, f, NOW);
    expect(m.byDate.get('2026-01-31')?.length).toBe(1); // adjacent cells populated
    expect(m.byDate.get('2026-03-01')?.length).toBe(1);
    expect(m.monthCount).toBe(1); // counts stay month-only
  });
  it('strict years: 0000 rejected, 0099 roundtrips, shift/clamp bounds', () => {
    expect(isMonth('0000-01')).toBe(false);
    expect(isDay('0000-01-01')).toBe(false);
    expect(isDay('0099-02-28')).toBe(true);
    expect(shiftMonth('0099-02', 1)).toBe('0099-03');
    expect(shiftMonth('9999-12', 1)).toBe('9999-12'); // out-of-range stays put (nav disabled)
    expect(readCalendarFilters(new URLSearchParams('month=0000-13'), TODAY).month).toBe('2026-02');
    expect(clampDateToMonth('0099-01-31', '0099-02')).toBe('0099-02-28');
  });
  it('offsetless deadline treated as UTC (VN boundary)', () => {
    const m = buildCalendarModel([t2('x', '2026-12-31T17:00:00', 'p1', 'P')],
      { month: '2027-01', date: '2027-01-01', view: 'month' as const, search: '', project: '', status: '', priority: '', overdue: false }, NOW);
    expect(m.byDate.get('2027-01-01')?.length).toBe(1); // offsetless = UTC -> VN Jan 1
  });
});
