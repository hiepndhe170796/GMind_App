// @vitest-environment jsdom
import { useEffect, type ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MyTasks from './MyTasks';
import { ToastProvider } from '../components/ui/Toast';
import { dashboardService, type MyTaskDto } from '../services/dashboard';
import { tasksService, type TaskPermissionsDto } from '../services/tasks';

let currentUid = 'u1';

vi.mock('../layouts/MainLayout', () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('../hooks/use-current-user-id', () => ({ useCurrentUserId: () => currentUid }));

const ALL_PERMS: TaskPermissionsDto = {
  canEdit: false, canAssign: false, canDelete: false, canUpdateProgress: false, canAddSubtask: false,
  allowedTransitions: [],
};
const perms = (over: Partial<TaskPermissionsDto> = {}): TaskPermissionsDto => ({ ...ALL_PERMS, ...over });

const vnDayKey = (d: Date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(d);
const addDays = (key: string, n: number) => {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const vnNoon = (key: string) => new Date(`${key}T12:00:00+07:00`).toISOString();
const todayKey = vnDayKey(new Date());
const ISO = {
  overdue: new Date(Date.now() - 3600e3).toISOString(),
  today: vnNoon(todayKey) < new Date().toISOString() ? new Date(Date.now() + 3600e3).toISOString() : vnNoon(todayKey),
  tomorrow: vnNoon(addDays(todayKey, 1)),
  soon: vnNoon(addDays(todayKey, 4)),
  later: vnNoon(addDays(todayKey, 30)),
};

const t = (id: string, over: Partial<MyTaskDto> = {}): MyTaskDto => ({
  id, projectId: 'p1', projectName: 'Web App', title: `Task ${id}`,
  status: 'ToDo', priority: 'Medium', deadlineAt: ISO.later,
  permissions: perms({ allowedTransitions: ['InProgress'] }), ...over,
});

const allSections = () => [
  t('od', { deadlineAt: ISO.overdue, status: 'InProgress', permissions: perms({ allowedTransitions: ['Submitted'] }) }),
  t('td', { deadlineAt: ISO.today, status: 'InProgress', permissions: perms({ allowedTransitions: ['Submitted'] }) }),
  t('tm', { deadlineAt: ISO.tomorrow, permissions: perms({ allowedTransitions: [] }) }),
  t('sn', { deadlineAt: ISO.soon, permissions: perms({ allowedTransitions: [] }) }),
  t('lt', { deadlineAt: ISO.later, permissions: perms({ allowedTransitions: [] }) }),
  t('nd', { deadlineAt: null, permissions: perms({ allowedTransitions: [] }) }),
];

const locBox: { loc: ReturnType<typeof useLocation> | null } = { loc: null };
const Probe = () => { const l = useLocation(); useEffect(() => { locBox.loc = l; }, [l]); return null; };
const loc = () => locBox.loc!;
const TaskProbe = () => { const n = useNavigate(); return <button onClick={() => n(-1)}>TASK_BACK</button>; };

const renderTasks = (entry = '/my-tasks') => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[entry]}>
          <Probe />
          <Routes>
            <Route path="/my-tasks" element={<MyTasks />} />
            <Route path="/tasks/:id" element={<TaskProbe />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
};

// jsdom lacks dialog.showModal/close
if (typeof HTMLDialogElement !== 'undefined') {
  (HTMLDialogElement.prototype).showModal ??= function () { this.setAttribute('open', ''); };
  (HTMLDialogElement.prototype).close ??= function () { this.removeAttribute('open'); };
}

beforeEach(() => { currentUid = 'u1'; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('MyTasks M2 — deadline sections', () => {
  it('groups tasks into all six sections in order with counts', async () => {
    vi.spyOn(dashboardService, 'myTasks').mockResolvedValue(allSections());
    renderTasks();
    const headings = await screen.findAllByRole('heading', { level: 3 });
    const labels = headings.map(h => h.textContent);
    const order = ['Quá hạn', 'Hôm nay', 'Ngày mai', '7 ngày tới', 'Sau đó', 'Không có hạn'];
    expect(order.every(l => labels.some(x => x!.startsWith(l)))).toBe(true);
    expect(labels.findIndex(x => x!.startsWith('Quá hạn'))).toBeLessThan(labels.findIndex(x => x!.startsWith('Không có hạn')));
    for (const l of order) expect(labels.some(x => x === `${l} (1)`)).toBe(true);
  });

  it('completed tasks are excluded by default; toggle fetches includeCompleted', async () => {
    const myTasks = vi.spyOn(dashboardService, 'myTasks').mockResolvedValue(allSections());
    renderTasks();
    await screen.findByText('Task od');
    expect(myTasks).toHaveBeenCalledWith(false);
    myTasks.mockResolvedValue([...allSections(), t('done', { status: 'Completed', deadlineAt: ISO.overdue })]);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Hiện việc đã hoàn thành' }));
    await waitFor(() => expect(myTasks).toHaveBeenCalledWith(true));
    expect(await screen.findByText('Task done')).toBeTruthy();
    expect(loc().search).toContain('done=1');
  });

  it('row shows parent, project, deadline label, pills and progress bar', async () => {
    vi.spyOn(dashboardService, 'myTasks').mockResolvedValue([
      t('sub', { parentTaskId: 'pp', parentTitle: 'Big parent', progressPercent: null, deadlineAt: ISO.later }),
      t('top', { status: 'InProgress', progressPercent: 60, deadlineAt: ISO.soon }),
    ]);
    renderTasks();
    expect(await screen.findByText('thuộc Big parent')).toBeTruthy();
    expect(screen.getAllByText('Web App').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('img', { name: 'Tiến độ 60%' })).toBeTruthy();
    // top-level has bar; subtask does not
    expect(screen.queryByRole('img', { name: /Tiến độ/ })!.getAttribute('aria-label')).toBe('Tiến độ 60%');
  });
});

describe('MyTasks M2 — filters', () => {
  it('status + project + priority filters persist in URL and intersect', async () => {
    vi.spyOn(dashboardService, 'myTasks').mockResolvedValue([
      t('a', { status: 'InProgress', deadlineAt: ISO.soon }),
      t('b', { projectId: 'p2', projectName: 'Mobile', status: 'InProgress', deadlineAt: ISO.soon }),
      t('c', { priority: 'Urgent', deadlineAt: ISO.soon }),
    ]);
    renderTasks();
    await screen.findByText('Task a');
    fireEvent.change(screen.getByLabelText('Lọc trạng thái'), { target: { value: 'InProgress' } });
    await waitFor(() => expect(loc().search).toContain('status=InProgress'));
    expect(screen.getByText('Task a')).toBeTruthy();
    expect(screen.queryByText('Task c')).toBeNull();
    fireEvent.change(screen.getByLabelText('Lọc dự án'), { target: { value: 'p2' } });
    await waitFor(() => expect(loc().search).toContain('project=p2'));
    expect(screen.queryByText('Task a')).toBeNull();
    expect(screen.getByText('Task b')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Xóa lọc' }));
    await waitFor(() => expect(screen.getByText('Task a')).toBeTruthy());
    expect(loc().search).not.toContain('status=');
  });

  it('filtered-empty offers reset', async () => {
    vi.spyOn(dashboardService, 'myTasks').mockResolvedValue([t('x', { status: 'ToDo', deadlineAt: ISO.later })]);
    renderTasks('/my-tasks?status=Completed');
    expect(await screen.findByText(/Không có công việc khớp bộ lọc/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Xóa bộ lọc' }));
    expect(await screen.findByText('Task x')).toBeTruthy();
  });
});

describe('MyTasks M2 — quick actions', () => {
  it('Bắt đầu posts InProgress; Nộp opens shared submit dialog with note', async () => {
    vi.spyOn(dashboardService, 'myTasks').mockResolvedValue([
      t('start', { deadlineAt: ISO.soon }),
      t('sub', { status: 'InProgress', deadlineAt: ISO.today, permissions: perms({ allowedTransitions: ['Submitted'] }) }),
    ]);
    const change = vi.spyOn(tasksService, 'changeStatus')
      .mockResolvedValueOnce({} as never).mockResolvedValueOnce({} as never);
    renderTasks();
    await screen.findByText('Task start');
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu' }));
    await waitFor(() => expect(change).toHaveBeenCalledWith('start', 2, undefined));
    // Nộp → dialog
    fireEvent.click(screen.getByRole('button', { name: 'Nộp' }));
    const note = await screen.findByLabelText(/Ghi chú bàn giao/);
    fireEvent.change(note, { target: { value: 'ready' } });
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Nộp để duyệt' }));
    await waitFor(() => expect(change).toHaveBeenCalledWith('sub', 3, 'ready'));
    expect(await screen.findByText('Đã nộp công việc để duyệt.')).toBeTruthy();
  });

  it('Làm lại posts InProgress for ChangesRequested tasks', async () => {
    vi.spyOn(dashboardService, 'myTasks').mockResolvedValue([
      t('fix', { status: 'ChangesRequested', deadlineAt: ISO.soon, permissions: perms({ allowedTransitions: ['InProgress'] }) }),
    ]);
    const change = vi.spyOn(tasksService, 'changeStatus').mockResolvedValue({} as never);
    renderTasks();
    await screen.findByText('Task fix');
    fireEvent.click(screen.getByRole('button', { name: 'Làm lại' }));
    await waitFor(() => expect(change).toHaveBeenCalledWith('fix', 2, undefined));
  });

  it('no quick action when transitions disallow', async () => {
    vi.spyOn(dashboardService, 'myTasks').mockResolvedValue([
      t('x', { deadlineAt: ISO.soon, permissions: perms({ allowedTransitions: [] }) }),
    ]);
    renderTasks();
    await screen.findByText('Task x');
    expect(screen.queryByRole('button', { name: 'Bắt đầu' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Nộp' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Làm lại' })).toBeNull();
  });
});

describe('MyTasks M2 — states and sessions', () => {
  it('error shows retry and recovers', async () => {
    const tasks = vi.spyOn(dashboardService, 'myTasks').mockRejectedValue({ message: 'fail' });
    renderTasks();
    expect(await screen.findByText('fail')).toBeTruthy();
    tasks.mockResolvedValue([t('a', { deadlineAt: ISO.soon })]);
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Task a')).toBeTruthy();
  });

  it('empty state when no tasks', async () => {
    vi.spyOn(dashboardService, 'myTasks').mockResolvedValue([]);
    renderTasks();
    expect(await screen.findByText(/Chưa có công việc nào đang mở/)).toBeTruthy();
  });

  it('long titles clamp with full title attribute and link to task', async () => {
    const title = 'Một nhiệm vụ có tên dài '.repeat(9).slice(0, 200).trim();
    vi.spyOn(dashboardService, 'myTasks').mockResolvedValue([t('long', { title, deadlineAt: ISO.soon })]);
    renderTasks();
    const preview = await screen.findByText(title, { exact: true });
    expect(preview.closest('a')?.getAttribute('title')).toBe(title);
    expect(preview.closest('a')?.getAttribute('href')).toBe('/tasks/long');
  });

  it('user switch refetches with scoped cache', async () => {
    vi.spyOn(dashboardService, 'myTasks').mockResolvedValue([t('a', { title: 'Alice task', deadlineAt: ISO.soon })]);
    const { unmount } = renderTasks();
    expect(await screen.findByText('Alice task')).toBeTruthy();
    unmount();
    currentUid = 'u2';
    vi.spyOn(dashboardService, 'myTasks').mockResolvedValue([t('b', { title: 'Bob task', deadlineAt: ISO.soon })]);
    renderTasks();
    expect(await screen.findByText('Bob task')).toBeTruthy();
    expect(screen.queryByText('Alice task')).toBeNull();
  });
});

describe('MyTasks M4 — Bạn đang hỗ trợ', () => {
  const helpingRow = (over: Partial<import('../services/groups').HelpingTaskDto> = {}): import('../services/groups').HelpingTaskDto => ({
    helperRowId: 'h1', taskId: 't-h', title: 'Helped task', projectId: 'p1', projectName: 'Web App',
    groupId: 'g1', groupName: 'Team', assigneeName: 'User B', status: 'InProgress',
    deadlineAt: ISO.tomorrow, scope: 'write tests', createdAt: '2026-01-01T00:00:00Z', ...over,
  });

  it('renders the helping section with rows', async () => {
    vi.spyOn(dashboardService, 'myTasks').mockResolvedValue([]);
    vi.spyOn(dashboardService, 'helping').mockResolvedValue([helpingRow()]);
    renderTasks();
    await screen.findByRole('heading', { name: /Bạn đang hỗ trợ \(1\)/ });
    expect((screen.getByRole('link', { name: 'Helped task' }) as HTMLAnchorElement).href).toContain('/tasks/t-h');
    expect(screen.getByText('Web App · Team')).toBeTruthy();
    expect(screen.getByText('Phụ trách: User B')).toBeTruthy();
    expect(screen.getByText('write tests')).toBeTruthy();
  });

  it('hidden when there is nothing to help with', async () => {
    vi.spyOn(dashboardService, 'myTasks').mockResolvedValue([]);
    vi.spyOn(dashboardService, 'helping').mockResolvedValue([]);
    renderTasks();
    await screen.findByText(/Chưa có công việc/);
    expect(screen.queryByRole('heading', { name: /Bạn đang hỗ trợ/ })).toBeNull();
  });
});
