// @vitest-environment jsdom
import { useEffect, useState } from 'react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dashboard from './Dashboard';
import MiniCalendar from '../components/dashboard/MiniCalendar';
import MainLayout from '../layouts/MainLayout';
import { dashboardService } from '../services/dashboard';
import { groupsService } from '../services/groups';
import { notificationsService } from '../services/notifications';
import { authService } from '../services/auth';
import { clearSession } from '../services/session';
import type { MyTaskDto } from '../services/dashboard';
import type { GroupDto } from '../services/groups';
import type { UserInfo } from '../services/session';

const U1: UserInfo = { id: 'u1', displayName: 'Leader', email: 'u1@x.dev' };
const U2: UserInfo = { id: 'u2', displayName: 'Member', email: 'u2@x.dev' };
const t = (id: string, over: Partial<MyTaskDto> = {}): MyTaskDto => ({
  id, projectId: 'p1', projectName: 'Web App', title: `Task ${id}`,
  status: 'ToDo', priority: 'Medium', deadlineAt: '2030-01-05T10:00:00Z', ...over,
});
const G: GroupDto = { id: 'g1', name: 'Nhóm Một', myRole: 'Leader', memberCount: 3 } as GroupDto;
const fixture9 = (): MyTaskDto[] => [
  t('1'), t('2', { status: 'InProgress' }), t('3', { status: 'Submitted' }),
  t('4'), t('5'), t('6'), t('7'), t('8', { projectId: 'p2', projectName: 'Mobile' }),
  t('9', { status: 'InProgress', deadlineAt: '2000-01-01T00:00:00Z' }),
];

let loc: ReturnType<typeof useLocation>;
const LocationProbe = () => {
  const l = useLocation();
  useEffect(() => { loc = l; }, [l]);
  return null;
};
const TaskProbe = () => {
  const nav = useNavigate();
  return <MainLayout><button onClick={() => nav(-1)}>PROBE_BACK</button></MainLayout>;
};
const taskSection = () => within(document.getElementById('dashboard-tasks')!);

function renderApp(entry = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <LocationProbe />
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/tasks/:id" element={<TaskProbe />} />
        <Route path="/groups" element={<MainLayout><div>GROUPS</div></MainLayout>} />
      </Routes>
    </MemoryRouter>
  );
}

const deferred = <T,>() => {
  let res!: (v: T) => void, rej!: (e: unknown) => void;
  const p = new Promise<T>((r, j) => { res = r; rej = j; });
  return { p, res, rej };
};

beforeEach(() => {
  vi.spyOn(authService, 'currentUser').mockReturnValue(U1);
  vi.spyOn(notificationsService, 'unreadCount').mockResolvedValue(0);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); clearSession(); localStorage.clear(); });

describe('Dashboard resources', () => {
  it('keeps full task names but does not override the two-line preview display', async () => {
    const title = 'Một nhiệm vụ có tên dài '.repeat(9).slice(0, 200).trim();
    vi.spyOn(dashboardService, 'myTasks').mockResolvedValue([t('long', { title, deadlineAt: undefined })]);
    vi.spyOn(groupsService, 'myGroups').mockResolvedValue([]);
    renderApp();
    const preview = await screen.findByText(title, { exact: true });
    expect(preview.getAttribute('title')).toBe(title);
    expect(preview.classList.contains('line-clamp-2')).toBe(true);
    expect(preview.classList.contains('block')).toBe(false);
    expect(preview.closest('a')?.getAttribute('href')).toBe('/tasks/long');
  });

  it('refresh rejection clears stats+rows but keeps groups; task retry alone recovers', async () => {
    const tasks = vi.spyOn(dashboardService, 'myTasks').mockResolvedValue(fixture9());
    const groups = vi.spyOn(groupsService, 'myGroups').mockResolvedValue([G]);
    renderApp();
    await screen.findByText('Task 9');
    expect(groups).toHaveBeenCalledTimes(1);
    tasks.mockRejectedValueOnce({ message: 'refresh fail' });
    fireEvent.click(screen.getByRole('button', { name: 'Làm mới' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.queryByText('Việc đang mở')).toBeNull();
    expect(screen.queryByText('Task 9')).toBeNull();
    expect(screen.getByText('Nhóm Một')).toBeTruthy();
    tasks.mockResolvedValue(fixture9());
    const groupsBeforeRetry = groups.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(tasks).toHaveBeenCalledTimes(3);
    expect(await screen.findByText('Task 9')).toBeTruthy();
    expect(groups.mock.calls.length).toBe(groupsBeforeRetry);
  });

  it('user change during pending: stale response cannot overwrite current view', async () => {
    const first = deferred<MyTaskDto[]>();
    const second = deferred<MyTaskDto[]>();
    const tasks = vi.spyOn(dashboardService, 'myTasks')
      .mockReturnValueOnce(first.p).mockReturnValue(second.p);
    vi.spyOn(groupsService, 'myGroups').mockResolvedValue([]);
    const current = vi.spyOn(authService, 'currentUser').mockReturnValue(U1);
    const { rerender } = renderApp();
    current.mockReturnValue(U2);
    rerender(
      <MemoryRouter initialEntries={['/dashboard']}>
        <LocationProbe />
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </MemoryRouter>
    );
    await act(async () => { second.res([t('current')]); });
    await taskSection().findByText('Task current');
    await act(async () => { first.res([t('stale')]); });
    await waitFor(() => expect(taskSection().getByText('Task current')).toBeTruthy());
    expect(taskSection().queryByText('Task stale')).toBeNull();
    expect(tasks).toHaveBeenCalledTimes(2);
  });
});

describe('Dashboard filters', () => {
  it('navigate task->Back restores q+page', async () => {
    vi.spyOn(dashboardService, 'myTasks').mockResolvedValue(fixture9());
    vi.spyOn(groupsService, 'myGroups').mockResolvedValue([G]);
    renderApp('/dashboard?q=Task');
    await screen.findByText('Task 9');
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await waitFor(() => expect(loc.search).toContain('page=2'));
    expect(loc.search).toContain('q=Task');
    fireEvent.click(taskSection().getByText('Task 8'));
    await screen.findByRole('button', { name: 'PROBE_BACK' });
    expect(loc.state).toEqual({ navigationSection: '/dashboard' });
    expect(document.querySelector('a[aria-current="page"]')!.getAttribute('href')).toBe('/dashboard');
    fireEvent.click(screen.getByRole('button', { name: 'PROBE_BACK' }));
    await waitFor(() => expect(loc.search).toContain('q=Task'));
    expect(loc.search).toContain('page=2');
    expect(taskSection().getByText('Task 8')).toBeTruthy();
    expect(taskSection().queryByText('Task 9')).toBeNull();
  });

  it('literal search "all" is preserved, not cleared as filter value', async () => {
    const tasks = vi.spyOn(dashboardService, 'myTasks')
      .mockResolvedValue([t('all', { title: 'Install app' }), t('other', { title: 'Write docs' })]);
    const groups = vi.spyOn(groupsService, 'myGroups').mockResolvedValue([]);
    renderApp();
    await taskSection().findByText('Install app');
    const search = screen.getByLabelText('Tìm công việc') as HTMLInputElement;
    fireEvent.change(search, { target: { value: 'all' } });
    expect(search.value).toBe('all');
    expect(loc.search).not.toContain('q=');
    fireEvent.keyDown(search, { key: 'Enter' });
    await waitFor(() => expect(loc.search).toContain('q=all'));
    expect(taskSection().getByText('Install app')).toBeTruthy();
    expect(taskSection().queryByText('Write docs')).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Xóa bộ lọc' })[0]);
    await waitFor(() => expect(search.value).toBe(''));
    expect(taskSection().getByText('Write docs')).toBeTruthy();
    expect(tasks).toHaveBeenCalledTimes(1);
    expect(groups).toHaveBeenCalledTimes(1);
  });

  it('direct task navigation marks MyTasks active', () => {
    renderApp('/tasks/8');
    expect(document.querySelector('a[aria-current="page"]')!.getAttribute('href')).toBe('/my-tasks');
  });

  it('project+status+query intersect through controls; stat click resets scope', async () => {
    vi.spyOn(dashboardService, 'myTasks').mockResolvedValue([
      t('a', { projectId: 'p1', status: 'InProgress', title: 'Build UI' }),
      t('b', { projectId: 'p2', status: 'InProgress', title: 'Build API' }),
      t('c', { projectId: 'p1', status: 'ToDo', title: 'Build Docs' }),
    ]);
    vi.spyOn(groupsService, 'myGroups').mockResolvedValue([]);
    renderApp();
    await taskSection().findByText('Build UI');
    fireEvent.change(screen.getByLabelText('Dự án'), { target: { value: 'p1' } });
    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'InProgress' } });
    fireEvent.change(screen.getByLabelText('Tìm công việc'), { target: { value: 'Build' } });
    fireEvent.keyDown(screen.getByLabelText('Tìm công việc'), { key: 'Enter' });
    await waitFor(() => expect(taskSection().queryByText('Build API')).toBeNull());
    expect(taskSection().getByText('Build UI')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Lọc công việc: Đang thực hiện' }));
    await waitFor(() => expect(taskSection().getByText('Build API')).toBeTruthy());
    expect(taskSection().queryByText('Build Docs')).toBeNull();
    // period + date interplay via calendar cell + period tab
    fireEvent.click(screen.getByRole('button', { name: 'Quá hạn' }));
    await waitFor(() => expect(loc.search).toContain('period=overdue'));
    const calCell = document.querySelector('#dashboard-calendar [data-date]')!;
    fireEvent.click(calCell);
    await waitFor(() => expect(loc.search).toContain('date='));
    expect(loc.search).not.toContain('period=');
    fireEvent.click(within(screen.getByRole('group', { name: 'Lọc theo hạn' })).getByRole('button', { name: 'Hôm nay' }));
    await waitFor(() => expect(loc.search).toContain('period=today'));
    expect(loc.search).not.toContain('date=');
    fireEvent.click(screen.getAllByRole('button', { name: 'Xóa bộ lọc' })[0]);
    await waitFor(() => expect(loc.search).toBe(''));
  });

  it('stat button aria-describedby links count; no task API refetch on filter edits', async () => {
    const tasks = vi.spyOn(dashboardService, 'myTasks').mockResolvedValue(fixture9());
    vi.spyOn(groupsService, 'myGroups').mockResolvedValue([]);
    renderApp();
    await screen.findByText('Task 9');
    const stat = screen.getByRole('button', { name: 'Lọc công việc: Quá hạn' });
    expect(stat.getAttribute('aria-describedby')).toBe('dashboard-stat-count-overdue');
    expect(document.getElementById('dashboard-stat-count-overdue')!.textContent).toBe('1');
    fireEvent.change(screen.getByLabelText('Tìm công việc'), { target: { value: 'x' } });
    expect(loc.search).not.toContain('q=');
    fireEvent.keyDown(screen.getByLabelText('Tìm công việc'), { key: 'Enter' });
    await waitFor(() => expect(loc.search).toContain('q=x'));
    expect(tasks).toHaveBeenCalledTimes(1);
  });
});

describe('MiniCalendar', () => {
  const tasks = [t('a', { deadlineAt: '2026-11-10T10:00:00Z' })];
  const Harness = () => {
    const [sel, setSel] = useState<string | null>(null);
    return <MemoryRouter><MiniCalendar tasks={tasks} selectedDate={sel} today="2026-11-01" onSelect={setSel} /></MemoryRouter>;
  };

  it('date select toggles aria-pressed on and off', () => {
    render(<Harness />);
    const cell = screen.getByRole('button', { name: /^10 tháng 11.*1 công việc/ });
    fireEvent.click(cell);
    expect(cell.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(cell);
    expect(cell.getAttribute('aria-pressed')).toBe('false');
  });

  it('off-month cell aligns view; external selectedDate aligns month across year', () => {
    const Wrap = () => {
      const [sel, setSel] = useState<string | null>(null);
      return <MemoryRouter><MiniCalendar tasks={tasks} selectedDate={sel} today="2026-11-01" onSelect={setSel} /></MemoryRouter>;
    };
    const { unmount } = render(<Wrap />);
    const offCell = screen.getByRole('button', { name: /^1 tháng 12/ });
    fireEvent.click(offCell);
    expect(screen.getByText('Tháng 12, 2026')).toBeTruthy();
    unmount();
    const calendar = (selectedDate: string) =>
      <MemoryRouter><MiniCalendar tasks={tasks} selectedDate={selectedDate} today="2026-11-01" onSelect={() => undefined} /></MemoryRouter>;
    const { rerender } = render(calendar('2026-12-01'));
    const grid = screen.getByRole('group', { name: 'Chọn ngày đến hạn' });
    rerender(calendar('2027-02-14'));
    expect(screen.getByText('Tháng 2, 2027')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Chọn ngày đến hạn' })).toBe(grid);
    expect(screen.getByRole('button', { name: /^14 tháng 2/ }).getAttribute('aria-pressed')).toBe('true');
  });

  it('Hôm nay selects today; prev/next crosses Dec->Jan', () => {
    const sel: { v: string | null } = { v: null };
    render(
      <MemoryRouter><MiniCalendar tasks={tasks} selectedDate={sel.v} today="2026-11-01" onSelect={k => { sel.v = k; }} /></MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Hôm nay' }));
    expect(sel.v).toBe('2026-11-01');
    expect(screen.getByRole('button', { name: /^1 tháng 11/ }).getAttribute('aria-current')).toBe('date');
    fireEvent.click(screen.getByRole('button', { name: 'Tháng sau' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tháng sau' }));
    expect(screen.getByText('Tháng 1, 2027')).toBeTruthy();
  });

  it('arrow/home/end move focus; PageUp clamps to last day of previous month', () => {
    render(
      <MemoryRouter><MiniCalendar tasks={tasks} selectedDate="2026-03-31" today="2026-03-01" onSelect={() => undefined} /></MemoryRouter>
    );
    const cell = screen.getByRole('button', { name: /^31 tháng 3/ });
    fireEvent.keyDown(cell, { key: 'PageUp' });
    expect(document.activeElement!.getAttribute('data-date')).toBe('2026-02-28');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(document.activeElement!.getAttribute('data-date')).toBe('2026-03-01');
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    // 2026-03-01 is a Sunday; Home goes to Monday of that week (2026-02-23)
    expect(document.activeElement!.getAttribute('data-date')).toBe('2026-02-23');
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(document.activeElement!.getAttribute('data-date')).toBe('2026-03-01');
    fireEvent.keyDown(document.activeElement!, { key: 'PageDown' });
    expect(document.activeElement!.getAttribute('data-date')).toBe('2026-04-01');
  });
});
