// @vitest-environment jsdom
import { useEffect, type ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MyTasks from './MyTasks';
import { dashboardService, type MyTaskDto } from '../services/dashboard';
import { clearSession } from '../services/session';
import type { UserInfo } from '../services/session';

vi.mock('../layouts/MainLayout', () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('../services/auth', () => ({
  authService: { isLoggedIn: () => true, currentUser: () => ({ id: 'u1', displayName: 'U', email: 'u@x.dev' } as UserInfo) },
}));

const t = (id: string, over: Partial<MyTaskDto> = {}): MyTaskDto => ({
  id, projectId: 'p1', projectName: 'Web App', title: `Task ${id}`,
  status: 'ToDo', priority: 'Medium', deadlineAt: '2030-01-05T10:00:00Z', ...over,
});
const fixture9 = () => [
  t('1'), t('2', { status: 'InProgress' }), t('3', { status: 'Submitted' }), t('4'), t('5'), t('6'),
  t('7'), t('8', { projectId: 'p2', projectName: 'Mobile', status: 'InProgress' }), t('9', { status: 'InProgress', deadlineAt: '2000-01-01T00:00:00Z' }),
];

const locBox: { loc: ReturnType<typeof useLocation> | null } = { loc: null };
const Probe = () => { const l = useLocation(); useEffect(() => { locBox.loc = l; }, [l]); return null; };
const loc = () => locBox.loc!;
const TaskProbe = () => { const n = useNavigate(); return <button onClick={() => n(-1)}>TASK_BACK</button>; };
const listSection = () => within(document.querySelector('.task-surface ul')!);

const renderTasks = (entry = '/my-tasks') => render(
  <MemoryRouter initialEntries={[entry]}>
    <Probe />
    <Routes>
      <Route path="/my-tasks" element={<MyTasks />} />
      <Route path="/tasks/:id" element={<TaskProbe />} />
    </Routes>
  </MemoryRouter>
);

afterEach(() => { cleanup(); vi.restoreAllMocks(); clearSession(); localStorage.clear(); });

describe('MyTasks', () => {
  it('error shows retry and no empty state; retry recovers', async () => {
    const tasks = vi.spyOn(dashboardService, 'myTasks').mockRejectedValue({ message: 'fail' });
    renderTasks();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Bạn chưa có công việc đang mở')).toBeNull();
    tasks.mockResolvedValue(fixture9());
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(tasks).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('Task 9')).toBeTruthy();
  });

  it('deferred load shows skeleton not zero-count; real [] shows onboarding + group link', async () => {
    let res!: (v: MyTaskDto[]) => void;
    const tasks = vi.spyOn(dashboardService, 'myTasks').mockImplementation(() => new Promise(r => { res = r; }));
    renderTasks();
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.queryByText('0 công việc phù hợp')).toBeNull();
    res([]);
    expect(await screen.findByText('Bạn chưa có công việc đang mở')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Mở nhóm của tôi' }).getAttribute('href')).toBe('/groups');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(tasks).toHaveBeenCalledTimes(1);
  });

  it('filtered-empty offers reset; restoring shows task', async () => {
    vi.spyOn(dashboardService, 'myTasks').mockResolvedValue([t('x', { deadlineAt: undefined })]);
    renderTasks();
    expect(await screen.findByText('Chưa đặt hạn')).toBeTruthy();
    const search = screen.getByLabelText('Tìm công việc');
    fireEvent.change(search, { target: { value: 'zzz' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(await screen.findByText('Không có công việc khớp bộ lọc')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Xóa bộ lọc' })[0]);
    await waitFor(() => expect(screen.queryByText('Không có công việc khớp bộ lọc')).toBeNull());
  });

  it('filters intersect via controls, page resets, next->task->Back preserves q/page', async () => {
    const tasks = vi.spyOn(dashboardService, 'myTasks').mockResolvedValue(fixture9());
    renderTasks('/my-tasks?q=Task');
    await screen.findByText('Task 9');
    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'InProgress' } });
    await waitFor(() => expect(loc().search).toContain('status=InProgress'));
    expect(loc().search).not.toContain('page=');
    // actual row assertions: InProgress tasks only
    expect(listSection().getByText('Task 2')).toBeTruthy();
    expect(listSection().getByText('Task 9')).toBeTruthy();
    expect(listSection().queryByText('Task 1')).toBeNull();
    fireEvent.change(screen.getByLabelText('Dự án'), { target: { value: 'p2' } });
    await waitFor(() => expect(loc().search).toContain('project=p2'));
    expect(listSection().getByText('Task 8').previousSibling).toBeNull();
    expect(listSection().queryByText('Task 2')).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Xóa bộ lọc' })[0]);
    await waitFor(() => expect(loc().search).toBe(''));
    expect(tasks).toHaveBeenCalledTimes(1);
    // keep q through pagination + Back
    const searchInput = screen.getByLabelText('Tìm công việc');
    fireEvent.change(searchInput, { target: { value: 'Task' } });
    fireEvent.keyDown(searchInput, { key: 'Enter' });
    await waitFor(() => expect(loc().search).toContain('q=Task'));
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await waitFor(() => expect(loc().search).toContain('page=2'));
    fireEvent.click(screen.getByText('Task 8'));
    await screen.findByRole('button', { name: 'TASK_BACK' });
    expect(loc().state).toEqual({ navigationSection: '/my-tasks', returnTo: expect.stringContaining('page=2') });
    fireEvent.click(screen.getByRole('button', { name: 'TASK_BACK' }));
    await waitFor(() => expect(loc().search).toContain('page=2'));
    expect(loc().search).toContain('q=Task');
    expect(listSection().getByText('Task 8')).toBeTruthy();
    expect(listSection().queryByText('Task 9')).toBeNull();
  });

  it('date selection clears period; long title renders; no Completed option', async () => {
    vi.spyOn(dashboardService, 'myTasks').mockResolvedValue([t('a', { title: 'X'.repeat(200), deadlineAt: '2000-01-01T00:00:00Z' })]);
    renderTasks('/my-tasks?period=overdue');
    await screen.findByText('X'.repeat(200));
    fireEvent.change(screen.getByLabelText('Ngày đến hạn'), { target: { value: '2030-01-05' } });
    await waitFor(() => expect(loc().search).toContain('date=2030-01-05'));
    expect(loc().search).not.toContain('period=');
    const statusSel = screen.getByLabelText('Trạng thái') as HTMLSelectElement;
    expect([...statusSel.options].map(o => o.value)).not.toContain('Completed');
  });
});
