// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ProjectDetail from './ProjectDetail';
import { projectsService, type ProjectDto } from '../services/projects';
import { tasksService, type TaskSummaryDto } from '../services/tasks';
import { groupsService, type GroupDetailDto } from '../services/groups';
import { clearSession } from '../services/session';

vi.mock('../layouts/MainLayout', () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('../services/auth', () => ({
  authService: { isLoggedIn: () => true, currentUser: () => ({ id: 'u-l', displayName: 'Leader', email: 'l@x.dev' }) },
}));

const project: ProjectDto = {
  id: 'p1', groupId: 'g1', name: 'Web App', description: 'desc', subject: 'SE',
  deadlineAt: '2030-01-01T00:00:00Z', status: 'InProgress', taskCount: 3, completedCount: 1, createdAt: '2026-01-01T00:00:00Z',
};
const task = (id: string, over: Partial<TaskSummaryDto> = {}): TaskSummaryDto => ({
  id, projectId: 'p1', parentTaskId: null, title: `Task ${id}`, assigneeUserId: 'u-m', assigneeName: 'Member',
  status: 'ToDo', priority: 'Medium', deadlineAt: null, canViewDetails: false, ...over,
});
const group = (role = 'Leader'): GroupDetailDto => ({
  id: 'g1', name: 'Nhóm A', memberCount: 2, myRole: role, createdAt: '',
  members: [{ userId: 'u-l', displayName: 'Leader', role: 'Leader', joinedAt: '' }, { userId: 'u-m', displayName: 'Member', role: 'Member', joinedAt: '' }],
});
const setup = (role = 'Leader', tasks = [task('a'), task('b', { status: 'InProgress' })]) => {
  vi.spyOn(projectsService, 'get').mockResolvedValue(project);
  vi.spyOn(tasksService, 'list').mockResolvedValue(tasks);
  vi.spyOn(groupsService, 'get').mockResolvedValue(group(role));
  const act = vi.spyOn(groupsService, 'activity').mockResolvedValue([]);
  return { act };
};
const renderAt = (entry = '/projects/p1') => render(
  <MemoryRouter initialEntries={[entry]}><Routes><Route path="/projects/:id" element={<ProjectDetail />} /></Routes></MemoryRouter>);

// jsdom lacks dialog.showModal/close
if (typeof HTMLDialogElement !== 'undefined') {
  (HTMLDialogElement.prototype).showModal ??= function () { this.setAttribute('open', ''); };
  (HTMLDialogElement.prototype).close ??= function () { this.removeAttribute('open'); };
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); clearSession(); });

describe('ProjectDetail', () => {
  it('member: no private activity fetch, no leader actions', async () => {
    const { act } = setup('Member');
    renderAt();
    expect(await screen.findByRole('heading',{name:'Web App'})).toBeTruthy();
    expect(act).not.toHaveBeenCalled();
    expect(screen.queryByText('Thêm công việc')).toBeNull();
    expect(screen.queryByText('Sửa dự án')).toBeNull();
    expect(screen.queryByText('Lưu trữ')).toBeNull();
  });

  it('leader: filter status via URL param, board toggle persists view', async () => {
    setup('Leader');
    renderAt('/projects/p1?status=InProgress');
    expect(await screen.findByText('Task b')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Task a')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Bảng' }));
    await waitFor(() => expect(screen.getByRole('region', { name: 'Bảng công việc' })).toBeTruthy());
  });

  it('child task matching filter shows under its parent', async () => {
    setup('Leader', [task('p'), task('c', { parentTaskId: 'p', status: 'InProgress', title: 'Child work' })]);
    renderAt('/projects/p1?status=InProgress');
    expect(await screen.findByText('Child work')).toBeTruthy();
    expect(screen.getByText('Task p')).toBeTruthy(); // parent shown as shell
  });

  it('assignee can start own task; POST+GET500 keeps success + GET-only retry', async () => {
    vi.spyOn(projectsService, 'get').mockResolvedValue(project);
    vi.spyOn(tasksService, 'list').mockResolvedValue([task('a', { assigneeUserId: 'u-l' })]);
    vi.spyOn(groupsService, 'get').mockResolvedValue(group('Member'));
    const change = vi.spyOn(tasksService, 'changeStatus')
      .mockResolvedValueOnce({ ...task('a'), status: 'InProgress' } as never)
      .mockResolvedValue({ ...task('a'), status: 'InProgress' } as never);
    // second reload (quiet after POST) fails
    let calls = 0;
    vi.spyOn(projectsService, 'get').mockImplementation(() => { calls++; return calls > 1 ? Promise.reject({ status: 500, message: 'get x' }) : Promise.resolve(project); });
    renderAt();
    fireEvent.click(await screen.findByRole('button', { name: 'Bắt đầu' }));
    await waitFor(() => expect(change).toHaveBeenCalledWith('a', 2));
    expect(await screen.findByRole('button', { name: 'Tải lại' })).toBeTruthy();
    expect(screen.getByText('Đã chuyển sang đang làm.')).toBeTruthy();
  });

  it('403 on mutation wipes workspace', async () => {
    setup('Leader');
    vi.spyOn(tasksService, 'changeStatus').mockRejectedValue({ status: 403, message: 'out' });
    renderAt();
    await screen.findByRole('heading',{name:'Web App'});
    vi.spyOn(tasksService, 'list').mockResolvedValue([task('a', { assigneeUserId: 'u-l' })]);
    // trigger a status write via a task owned by u-l — refetch not needed; directly test create
    vi.spyOn(tasksService, 'create').mockRejectedValue({ status: 403, message: 'out' });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm công việc' }));
    fireEvent.change(screen.getByLabelText('Tên công việc'), { target: { value: 'New' } });
    fireEvent.submit(screen.getByLabelText('Tên công việc').closest('form')!);
    await screen.findByRole('alert');
    expect(screen.queryByRole('heading',{name:'Web App'})).toBeNull();
  });

  it('unmount before scheduled fetch issues no request', async () => {
    const get = vi.spyOn(projectsService, 'get').mockClear();
    const { unmount } = renderAt();
    unmount();
    await act(async () => { await Promise.resolve(); });
    expect(get).not.toHaveBeenCalled();
  });
});

describe('Round2 regressions', () => {
  it('name-only update preserves exact deadlineAt timestamp', async () => {
    const proj = { ...project, deadlineAt: '2026-11-08T18:00:00Z' }; // -> VN day 11/09
    vi.spyOn(projectsService, 'get').mockResolvedValue(proj);
    vi.spyOn(tasksService, 'list').mockResolvedValue([]);
    vi.spyOn(groupsService, 'get').mockResolvedValue(group('Leader'));
    vi.spyOn(groupsService, 'activity').mockResolvedValue([]);
    const { projectsManage } = await import('../services/projects');
    const upd = vi.spyOn(projectsManage, 'update').mockResolvedValue(proj as never);
    renderAt();
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa dự án' }));
    fireEvent.change(screen.getByLabelText('Tên dự án'), { target: { value: 'Renamed' } });
    fireEvent.submit(screen.getByLabelText('Tên dự án').closest('form')!);
    await waitFor(() => expect(upd).toHaveBeenCalled());
    expect((upd.mock.calls[0][1] as { deadlineAt?: string }).deadlineAt).toBe('2026-11-08T18:00:00Z');
  });

  it('create sends priority+estimate ISO payload and locks double submit', async () => {
    setup('Leader', []);
    const create = vi.spyOn(tasksService, 'create').mockImplementation(() => new Promise(() => { }));
    renderAt();
    fireEvent.click(await screen.findByRole('button', { name: 'Thêm công việc' }));
    fireEvent.change(screen.getByLabelText('Tên công việc'), { target: { value: 'T1' } });
    fireEvent.change(screen.getByLabelText('Ưu tiên'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText(/Ước lượng/), { target: { value: '2.5' } });
    fireEvent.change(screen.getByLabelText(/Hạn/), { target: { value: '2026-11-09' } });
    const btn = screen.getByRole('button', { name: 'Thêm công việc' });
    fireEvent.click(btn); fireEvent.click(btn);
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0][1]).toEqual(expect.objectContaining({ title: 'T1', priority: 4, estimateHours: 2.5 }));
    expect((create.mock.calls[0][1].deadlineAt as string)).toBe(new Date('2026-11-09T23:59:00+07:00').toISOString());
  });
});
