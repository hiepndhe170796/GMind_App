// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProjectDetail from './ProjectDetail';
import { ToastProvider } from '../components/ui/Toast';
import { projectsService, projectsManage, projectLinks, type ProjectDto } from '../services/projects';
import { tasksService, type TaskSummaryDto, type LinkDto, type TaskPermissionsDto } from '../services/tasks';
import { groupsService, type GroupDetailDto } from '../services/groups';
import { filesService } from '../services/files';
import { discussionService } from '../services/discussion';
import { saveSession } from '../services/session';

const LocProbe = () => {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}{loc.search}</div>;
};

let currentUid = 'u-l';

vi.mock('../layouts/MainLayout', () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('../hooks/use-current-user-id', () => ({ useCurrentUserId: () => currentUid }));

const ALL_PERMS: TaskPermissionsDto = {
  canEdit: true, canAssign: true, canDelete: true, canUpdateProgress: true, canAddSubtask: true,
  allowedTransitions: [],
};
const perms = (over: Partial<TaskPermissionsDto> = {}): TaskPermissionsDto => ({ ...ALL_PERMS, ...over });

const project: ProjectDto = {
  id: 'p1', groupId: 'g1', name: 'Web App', description: 'desc', subject: 'SE',
  deadlineAt: '2030-01-01T00:00:00Z', status: 'InProgress', taskCount: 3, completedCount: 1, createdAt: '2026-01-01T00:00:00Z',
};
const task = (id: string, over: Partial<TaskSummaryDto> = {}): TaskSummaryDto => ({
  id, projectId: 'p1', parentTaskId: null, title: `Task ${id}`, assigneeUserId: 'u-m', assigneeName: 'Member',
  status: 'ToDo', priority: 'Medium', deadlineAt: null, canViewDetails: false,
  permissions: perms({ allowedTransitions: ['InProgress'] }), ...over,
});
const group = (role = 'Leader'): GroupDetailDto => ({
  id: 'g1', name: 'Nhóm A', memberCount: 2, myRole: role, createdAt: '',
  members: [
    { userId: 'u-l', displayName: 'Leader', role: 'Leader', joinedAt: '', openTaskCount: 1 },
    { userId: 'u-m', displayName: 'Member', role: 'Member', joinedAt: '', openTaskCount: 3 },
  ],
});
const link = (over: Partial<LinkDto> = {}): LinkDto => ({
  id: 'l1', projectId: 'p1', url: 'https://docs.example.com/spec', displayName: 'Spec',
  createdByName: 'Leader', createdAt: '2026-01-01T00:00:00Z', canDelete: false, ...over,
});

const setup = (role = 'Leader', tasks = [task('a'), task('b', { status: 'InProgress' })]) => {
  vi.spyOn(projectsService, 'get').mockResolvedValue(project);
  vi.spyOn(tasksService, 'list').mockResolvedValue(tasks);
  vi.spyOn(groupsService, 'get').mockResolvedValue(group(role));
  vi.spyOn(projectLinks, 'links').mockResolvedValue([]);
  vi.spyOn(filesService, 'listProjectFiles').mockResolvedValue([]);
  const contrib = vi.spyOn(projectsService, 'contributions').mockResolvedValue({
    projectId: 'p1', totalCredited: 14, totalPlanned: 20, isLeader: role === 'Leader',
    members: [
      { userId: 'u-m', displayName: 'Member', creditedPoints: 7, plannedPoints: 10, percent: 50 },
      { userId: 'u-l', displayName: 'Leader', creditedPoints: 7, plannedPoints: 10, percent: 50 },
    ],
  });
  const act = vi.spyOn(groupsService, 'activity').mockResolvedValue([]);
  return { act, contrib };
};

const renderAt = (entry = '/projects/p1') => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[entry]}>
          <LocProbe />
          <Routes>
            <Route path="/projects/:id" element={<ProjectDetail />} />
            <Route path="/groups/:id" element={<div>GROUP_PAGE</div>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
};

// jsdom lacks dialog.showModal/close and element scrolling APIs
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = function () {} as never;
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function () {};
if (typeof HTMLDialogElement !== 'undefined') {
  (HTMLDialogElement.prototype).showModal ??= function () { this.setAttribute('open', ''); };
  (HTMLDialogElement.prototype).close ??= function () { this.removeAttribute('open'); };
}

beforeEach(() => { currentUid = 'u-l'; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('ProjectDetail M2 — header and status bar', () => {
  it('renders name, status pill, deadline, description and leader actions', async () => {
    setup('Leader');
    renderAt();
    expect(await screen.findByRole('heading', { name: 'Web App' })).toBeTruthy();
    expect(screen.getAllByText('Đang làm').length).toBeGreaterThanOrEqual(1); // project status pill
    expect(screen.getByText(/Hạn 01\/01\/2030/)).toBeTruthy();  // deadline label
    expect(screen.getByText('desc')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Thêm công việc/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sửa dự án' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Lưu trữ' })).toBeTruthy();
  });

  it('status bar counts top-level tasks only and shows completion fraction', async () => {
    setup('Leader', [
      task('a'), task('b', { status: 'Completed' }),
      task('p'), task('sub', { parentTaskId: 'p', status: 'Completed' }),
    ]);
    renderAt();
    await screen.findByRole('heading', { name: 'Web App' });
    // 3 top-level: a ToDo, b Completed, p ToDo → 1/3 · 33%
    expect(await screen.findByText('1/3 hoàn thành · 33%')).toBeTruthy();
    const bar = screen.getByRole('img', { name: /Tiến độ công việc/ });
    expect(bar.getAttribute('aria-label')).toContain('2 Cần làm');
    expect(bar.getAttribute('aria-label')).toContain('1 Hoàn thành');
  });

  it('member hides leader actions and never fetches activity', async () => {
    const { act } = setup('Member');
    renderAt();
    expect(await screen.findByRole('heading', { name: 'Web App' })).toBeTruthy();
    expect(act).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Thêm công việc/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sửa dự án' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Lưu trữ' })).toBeNull();
    expect(screen.queryByText('Hoạt động dự án')).toBeNull();
  });

  it('leader sees member list and project activity', async () => {
    const { act } = setup('Leader');
    act.mockResolvedValue([{ id: 'a1', actorName: 'Leader', action: 'x', entityType: 'Task', summary: 'Tạo công việc', createdAt: '2026-01-01T00:00:00Z', projectId: 'p1' }]);
    renderAt();
    expect(await screen.findByRole('heading', { name: 'Web App' })).toBeTruthy();
    expect(await screen.findByText('Tạo công việc')).toBeTruthy();
    expect(screen.getByText('Trưởng nhóm')).toBeTruthy();
    expect(screen.getByText('Thành viên')).toBeTruthy();
    expect(screen.getByText('3 việc')).toBeTruthy();
  });
});

describe('ProjectDetail M2 — filters and view toggle', () => {
  it('filters status via URL param; board toggle persists ?view=board', async () => {
    setup('Leader');
    renderAt('/projects/p1?status=InProgress');
    expect(await screen.findByText('Task b')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Task a')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Bảng' }));
    expect(await screen.findByRole('region', { name: 'Bảng công việc' })).toBeTruthy();
    // back to list
    fireEvent.click(screen.getByRole('button', { name: 'Danh sách' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Bảng công việc' })).toBeNull());
  });

  it('board view from URL shows 5 status columns with counts', async () => {
    setup('Leader');
    renderAt('/projects/p1?view=board');
    const region = await screen.findByRole('region', { name: 'Bảng công việc' });
    for (const l of ['Cần làm', 'Đang làm', 'Chờ duyệt', 'Cần chỉnh sửa', 'Hoàn thành'])
      expect(within(region).getByText(l)).toBeTruthy();
  });

  it('child task matching filter keeps parent as shell', async () => {
    setup('Leader', [task('p'), task('c', { parentTaskId: 'p', status: 'InProgress', title: 'Child work' })]);
    renderAt('/projects/p1?status=InProgress');
    expect(await screen.findByText('Child work')).toBeTruthy();
    expect(screen.getByText('Task p')).toBeTruthy();
    expect(screen.getByText('(hiện vì công việc con khớp lọc)')).toBeTruthy();
  });

  it('subtasks collapse behind a disclosure control', async () => {
    setup('Leader', [
      task('p', { subtaskCount: 2, subtasksCompleted: 1 }),
      task('c1', { parentTaskId: 'p', title: 'Sub one' }),
      task('c2', { parentTaskId: 'p', title: 'Sub two' }),
    ]);
    renderAt();
    await screen.findByText('Task p');
    expect(screen.queryByText('Sub one')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Mở công việc con của Task p/ }));
    expect(await screen.findByText('Sub one')).toBeTruthy();
    expect(screen.getByText('Sub two')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Thu gọn công việc con của Task p/ }));
    expect(screen.queryByText('Sub one')).toBeNull();
  });

  it('search by assignee name; clear filters restores', async () => {
    setup('Leader', [task('a', { assigneeName: 'Member' }), task('b', { assigneeName: 'Other' })]);
    renderAt();
    await screen.findByText('Task a');
    fireEvent.change(screen.getByLabelText('Tìm công việc'), { target: { value: 'Other' } });
    await waitFor(() => expect(screen.queryByText('Task a')).toBeNull());
    expect(screen.getByText('Task b')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Xóa lọc' }));
    expect(await screen.findByText('Task a')).toBeTruthy();
  });
});

describe('ProjectDetail M2 — transitions, board drag and menu', () => {
  it('status menu alternative lists allowed targets and calls status API', async () => {
    setup('Leader', [task('a', { permissions: perms({ allowedTransitions: ['InProgress', 'Completed'] }) })]);
    const change = vi.spyOn(tasksService, 'changeStatus').mockResolvedValue(task('a', { status: 'InProgress' }) as never);
    renderAt();
    await screen.findByText('Task a');
    fireEvent.click(screen.getByRole('button', { name: 'Chuyển trạng thái' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Bắt đầu' })).toBeTruthy();
    expect(within(menu).getByRole('menuitem', { name: 'Hoàn thành' })).toBeTruthy();
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Bắt đầu' }));
    await waitFor(() => expect(change).toHaveBeenCalledWith('a', 2, undefined));
  });

  it('no transitions → no status menu and no drag handle', async () => {
    setup('Leader', [task('a', { permissions: perms({ allowedTransitions: [] }) })]);
    renderAt('/projects/p1?view=board');
    await screen.findByRole('region', { name: 'Bảng công việc' });
    expect(screen.queryByRole('button', { name: 'Chuyển trạng thái' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Kéo thẻ/ })).toBeNull();
  });

  it('movable card exposes a drag handle', async () => {
    setup('Leader', [task('a', { permissions: perms({ allowedTransitions: ['InProgress'] }) })]);
    renderAt('/projects/p1?view=board');
    await screen.findByRole('region', { name: 'Bảng công việc' });
    expect(screen.getByRole('button', { name: 'Kéo thẻ "Task a" để chuyển trạng thái' })).toBeTruthy();
  });

  it('optimistic move updates status instantly; failure rolls back with error toast', async () => {
    setup('Leader', [task('a', { permissions: perms({ allowedTransitions: ['InProgress'] }) })]);
    vi.spyOn(tasksService, 'changeStatus').mockRejectedValue({ status: 500, message: 'boom' });
    renderAt();
    await screen.findByText('Task a');
    // optimistic: status pill flips before server responds? server rejects immediately —
    // but rollback restores ToDo pill
    fireEvent.click(screen.getByRole('button', { name: 'Chuyển trạng thái' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Bắt đầu' }));
    expect(await screen.findByText('boom')).toBeTruthy();
    // rolled back — task is still ToDo
    const badges = screen.getAllByText('Cần làm');
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it('drop-equivalent: choosing Nộp để duyệt opens the shared submit dialog with note', async () => {
    setup('Leader', [task('a', { status: 'InProgress', permissions: perms({ allowedTransitions: ['Submitted'] }) })]);
    const change = vi.spyOn(tasksService, 'changeStatus').mockResolvedValue(task('a', { status: 'Submitted' }) as never);
    renderAt();
    await screen.findByText('Task a');
    fireEvent.click(screen.getByRole('button', { name: 'Chuyển trạng thái' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Nộp để duyệt' }));
    const note = await screen.findByLabelText(/Ghi chú bàn giao/);
    fireEvent.change(note, { target: { value: 'done part A' } });
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Nộp để duyệt' }));
    await waitFor(() => expect(change).toHaveBeenCalledWith('a', 3, 'done part A'));
    expect(await screen.findByText('Đã nộp công việc để duyệt.')).toBeTruthy();
  });

  it('submit dialog blocks when open subtasks remain', async () => {
    setup('Leader', [task('a', { status: 'InProgress', subtaskCount: 2, subtasksCompleted: 1, permissions: perms({ allowedTransitions: ['Submitted'] }) })]);
    renderAt();
    await screen.findByText('Task a');
    fireEvent.click(screen.getByRole('button', { name: 'Chuyển trạng thái' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Nộp để duyệt' }));
    expect(await screen.findByText('Hoàn thành tất cả công việc con trước khi nộp.')).toBeTruthy();
    const dialog = screen.getByRole('dialog');
    expect((within(dialog).getByRole('button', { name: 'Nộp để duyệt' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('request-changes flow via menu opens shared dialog and requires comment', async () => {
    setup('Leader', [task('a', { status: 'Submitted', permissions: perms({ allowedTransitions: ['ChangesRequested'] }) })]);
    const change = vi.spyOn(tasksService, 'changeStatus').mockResolvedValue(task('a', { status: 'ChangesRequested' }) as never);
    renderAt();
    await screen.findByText('Task a');
    fireEvent.click(screen.getByRole('button', { name: 'Chuyển trạng thái' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Yêu cầu chỉnh sửa' }));
    await screen.findByLabelText(/Nhận xét/);
    fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu' }));
    expect(await screen.findByText(/Hãy nhập nhận xét/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Nhận xét/), { target: { value: 'fix tests' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu' }));
    await waitFor(() => expect(change).toHaveBeenCalledWith('a', 4, 'fix tests'));
    expect(await screen.findByText('Đã gửi yêu cầu chỉnh sửa.')).toBeTruthy();
  });

  it('approve via menu calls Completed and shows toast', async () => {
    setup('Leader', [task('a', { status: 'Submitted', permissions: perms({ allowedTransitions: ['Completed'] }) })]);
    const change = vi.spyOn(tasksService, 'changeStatus').mockResolvedValue(task('a', { status: 'Completed' }) as never);
    renderAt();
    await screen.findByText('Task a');
    fireEvent.click(screen.getByRole('button', { name: 'Chuyển trạng thái' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duyệt' }));
    await waitFor(() => expect(change).toHaveBeenCalledWith('a', 5, undefined));
    expect(await screen.findByText('Đã duyệt công việc.')).toBeTruthy();
  });
});

describe('ProjectDetail M2 — project links', () => {
  it('lists links with hostname and creator; add posts and invalidates', async () => {
    setup('Leader');
    vi.spyOn(projectLinks, 'links').mockResolvedValue([link()]);
    const add = vi.spyOn(projectLinks, 'addLink').mockResolvedValue(link({ id: 'l2' }));
    renderAt('/projects/p1?tab=files');
    expect(await screen.findByText('Spec')).toBeTruthy();
    expect(screen.getByText(/docs\.example\.com · Leader/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Thêm liên kết' }));
    fireEvent.change(await screen.findByLabelText('Liên kết'), { target: { value: 'https://figma.example.com' } });
    fireEvent.submit(screen.getByLabelText('Liên kết').closest('form')!);
    await waitFor(() => expect(add).toHaveBeenCalledWith('p1', 'https://figma.example.com', undefined));
    expect(await screen.findByText('Đã thêm tài liệu.')).toBeTruthy();
  });

  it('rejects non-http urls without posting', async () => {
    setup('Leader');
    const add = vi.spyOn(projectLinks, 'addLink');
    renderAt('/projects/p1?tab=files');
    await screen.findByRole('heading', { name: 'Web App' });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm liên kết' }));
    fireEvent.change(await screen.findByLabelText('Liên kết'), { target: { value: 'javascript:alert(1)' } });
    fireEvent.submit(screen.getByLabelText('Liên kết').closest('form')!);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(add).not.toHaveBeenCalled();
  });

  it('delete with canDelete asks confirmation then deletes', async () => {
    setup('Leader');
    vi.spyOn(projectLinks, 'links').mockResolvedValue([link({ canDelete: true })]);
    const del = vi.spyOn(tasksService, 'deleteLink').mockResolvedValue({} as never);
    renderAt('/projects/p1?tab=files');
    await screen.findByText('Spec');
    fireEvent.click(screen.getByRole('button', { name: 'Xóa tài liệu Spec' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xóa' }));
    await waitFor(() => expect(del).toHaveBeenCalledWith('l1'));
    expect(await screen.findByText('Đã xóa tài liệu.')).toBeTruthy();
  });

  it('link without canDelete shows no delete button', async () => {
    setup('Member');
    vi.spyOn(projectLinks, 'links').mockResolvedValue([link({ canDelete: false })]);
    renderAt('/projects/p1?tab=files');
    await screen.findByText('Spec');
    expect(screen.queryByRole('button', { name: 'Xóa tài liệu Spec' })).toBeNull();
  });
});

describe('ProjectDetail M2 — create task + project dialogs', () => {
  it('create dialog sends full payload and locks double submit', async () => {
    setup('Leader', []);
    const create = vi.spyOn(tasksService, 'create').mockImplementation(() => new Promise(() => { }));
    renderAt();
    fireEvent.click(await screen.findByRole('button', { name: /Thêm công việc/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Tên công việc'), { target: { value: 'T1' } });
    fireEvent.change(within(dialog).getByLabelText('Ưu tiên'), { target: { value: '4' } });
    fireEvent.change(within(dialog).getByLabelText(/Ước lượng/), { target: { value: '2.5' } });
    fireEvent.change(within(dialog).getByLabelText('Giao cho'), { target: { value: 'u-m' } });
    fireEvent.change(within(dialog).getByLabelText(/Hạn/), { target: { value: '2026-11-09T15:30' } });
    const btn = within(dialog).getByRole('button', { name: 'Thêm công việc' });
    fireEvent.click(btn); fireEvent.click(btn);
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0][1]).toEqual(expect.objectContaining({
      title: 'T1', priority: 4, estimateHours: 2.5, assigneeUserId: 'u-m',
    }));
    expect(create.mock.calls[0][1].deadlineAt).toBe(new Date('2026-11-09T15:30:00+07:00').toISOString());
  });

  it('create with parent sends parentTaskId', async () => {
    setup('Leader', [task('p')]);
    const create = vi.spyOn(tasksService, 'create').mockResolvedValue(task('sub') as never);
    renderAt();
    fireEvent.click(await screen.findByRole('button', { name: /Thêm công việc/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Tên công việc'), { target: { value: 'Sub' } });
    fireEvent.change(within(dialog).getByLabelText(/Thuộc công việc/), { target: { value: 'p' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Thêm công việc' }));
    await waitFor(() => expect(create.mock.calls[0][1].parentTaskId).toBe('p'));
    expect(await screen.findByText('Đã tạo công việc.')).toBeTruthy();
  });

  it('create shows server error and keeps dialog open', async () => {
    setup('Leader', []);
    vi.spyOn(tasksService, 'create').mockRejectedValue({ status: 400, message: 'Không thể giao việc' });
    renderAt();
    fireEvent.click(await screen.findByRole('button', { name: /Thêm công việc/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Tên công việc'), { target: { value: 'X' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Thêm công việc' }));
    expect(await screen.findByText('Không thể giao việc')).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('edit preserves exact deadlineAt when date unchanged (Round2 port)', async () => {
    const proj = { ...project, deadlineAt: '2026-11-08T18:00:00Z' };
    vi.spyOn(projectsService, 'get').mockResolvedValue(proj);
    vi.spyOn(tasksService, 'list').mockResolvedValue([]);
    vi.spyOn(groupsService, 'get').mockResolvedValue(group('Leader'));
    vi.spyOn(projectLinks, 'links').mockResolvedValue([]);
    vi.spyOn(groupsService, 'activity').mockResolvedValue([]);
    const upd = vi.spyOn(projectsManage, 'update').mockResolvedValue(proj as never);
    renderAt();
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa dự án' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Tên dự án'), { target: { value: 'Renamed' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(upd).toHaveBeenCalled());
    expect((upd.mock.calls[0][1] as { deadlineAt?: string }).deadlineAt).toBe('2026-11-08T18:00:00Z');
  });

  it('archive asks danger confirmation then navigates to group', async () => {
    setup('Leader');
    const arch = vi.spyOn(projectsManage, 'archive').mockResolvedValue({} as never);
    renderAt();
    fireEvent.click(await screen.findByRole('button', { name: 'Lưu trữ' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu trữ' }));
    await waitFor(() => expect(arch).toHaveBeenCalledWith('p1'));
    expect(await screen.findByText('GROUP_PAGE')).toBeTruthy();
  });
});

describe('ProjectDetail M2 — error and session states', () => {
  it('404 shows not-found state', async () => {
    vi.spyOn(projectsService, 'get').mockRejectedValue({ status: 404, message: 'Không tìm thấy' });
    vi.spyOn(tasksService, 'list').mockRejectedValue({ status: 404 });
    renderAt();
    expect(await screen.findByText('Không tìm thấy dự án.')).toBeTruthy();
  });

  it('403 shows access-denied state', async () => {
    vi.spyOn(projectsService, 'get').mockRejectedValue({ status: 403, message: 'Không có quyền xem dự án này.' });
    vi.spyOn(tasksService, 'list').mockRejectedValue({ status: 403 });
    renderAt();
    expect(await screen.findByText('Không có quyền xem dự án này.')).toBeTruthy();
  });

  it('network failure shows error state; retry recovers', async () => {
    const get = vi.spyOn(projectsService, 'get').mockRejectedValue({ message: 'down' });
    vi.spyOn(tasksService, 'list').mockResolvedValue([]);
    renderAt();
    expect(await screen.findByText('down')).toBeTruthy();
    get.mockResolvedValue(project);
    vi.spyOn(groupsService, 'get').mockResolvedValue(group('Leader'));
    vi.spyOn(projectLinks, 'links').mockResolvedValue([]);
    vi.spyOn(groupsService, 'activity').mockResolvedValue([]);
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('heading', { name: 'Web App' })).toBeTruthy();
  });

  it('403 on mutation refetches tasks → fatal state (ported)', async () => {
    setup('Leader', []);
    vi.spyOn(tasksService, 'create').mockRejectedValue({ status: 403, message: 'out' });
    const list = vi.spyOn(tasksService, 'list')
      .mockResolvedValueOnce([])
      .mockRejectedValue({ status: 403, message: 'out' });
    renderAt();
    await screen.findByRole('heading', { name: 'Web App' });
    fireEvent.click(screen.getByRole('button', { name: /Thêm công việc/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Tên công việc'), { target: { value: 'N' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Thêm công việc' }));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('out')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Web App' })).toBeNull();
  });

  it('user switch refetches with user-scoped keys (no leak)', async () => {
    setup('Leader', [task('a', { title: 'Leader task' })]);
    const { unmount } = renderAt();
    expect(await screen.findByText('Leader task')).toBeTruthy();
    unmount();
    currentUid = 'u-m';
    vi.spyOn(tasksService, 'list').mockResolvedValue([task('b', { title: 'Member task' })]);
    renderAt();
    expect(await screen.findByText('Member task')).toBeTruthy();
    expect(screen.queryByText('Leader task')).toBeNull();
  });
});

describe('ProjectDetail M3 — Điểm đóng góp', () => {
  it('leader sees totals + per-member rows with bars', async () => {
    setup('Leader');
    renderAt();
    expect(await screen.findByText('Đã duyệt 14 / dự kiến 20 điểm.')).toBeTruthy();
    expect(screen.getAllByText('7 điểm')).toHaveLength(2);
    expect(screen.getAllByRole('img', { name: /% điểm đã duyệt của dự án/ })).toHaveLength(2);
    expect(screen.getByText(/tỷ lệ = điểm của thành viên \/ tổng điểm đã duyệt của dự án\./)).toBeTruthy();
  });

  it('member sees only the own line', async () => {
    setup('Member');
    vi.spyOn(projectsService, 'contributions').mockResolvedValue({
      projectId: 'p1', totalCredited: 14, totalPlanned: 20, isLeader: false,
      members: [{ userId: 'u-m', displayName: 'Member', creditedPoints: 7, plannedPoints: 10, percent: 50 }],
    });
    renderAt();
    expect(await screen.findByRole('heading', { name: 'Điểm đóng góp' })).toBeTruthy();
    expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === 'Bạn: 7 điểm · 50% điểm đã duyệt của dự án')).toBeTruthy();
    expect(screen.queryByText('Đã duyệt 14 / dự kiến 20 điểm.')).toBeNull();
  });

  it('empty state when nothing credited', async () => {
    setup('Leader');
    vi.spyOn(projectsService, 'contributions').mockResolvedValue({
      projectId: 'p1', totalCredited: 0, totalPlanned: 0, isLeader: true, members: [],
    });
    renderAt();
    expect(await screen.findByText('Chưa có công việc nào có điểm được duyệt.')).toBeTruthy();
  });

  it('error → inline message + retry', async () => {
    setup('Leader');
    const c = vi.spyOn(projectsService, 'contributions')
      .mockRejectedValue({ message: 'lỗi điểm' });
    renderAt();
    await screen.findByText('lỗi điểm', undefined, { timeout: 3000 }); // one auto-retry before the error surfaces
    c.mockResolvedValue({ projectId: 'p1', totalCredited: 5, totalPlanned: 5, isLeader: true,
        members: [{ userId: 'u-m', displayName: 'Member', creditedPoints: 5, plannedPoints: 5, percent: 100 }] });
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await screen.findByText('Đã duyệt 5 / dự kiến 5 điểm.');
    expect(c).toHaveBeenCalledTimes(3); // initial + auto-retry + manual retry
  });
});

describe('ProjectDetail M6 — tabs', () => {
  it('deep-links ?tab=discussion and selects the Thảo luận tab', async () => {
    saveSession({ accessToken: 't', refreshToken: 'r', expiresAt: '2100-01-01',
      user: { id: 'u-l', displayName: 'Leader', email: 'l@x.dev', avatarUrl: null } });
    setup('Leader');
    vi.spyOn(discussionService, 'page').mockResolvedValue({ items: [], nextCursor: null });
    renderAt('/projects/p1?tab=discussion');
    const tab = await screen.findByRole('tab', { name: 'Thảo luận' });
    expect(tab.getAttribute('aria-selected')).toBe('true');
    expect(await screen.findByText('Chưa có trao đổi nào. Gửi tin nhắn đầu tiên cho cả nhóm.')).toBeTruthy();
  });

  it('unknown tab value falls back to Công việc', async () => {
    setup('Leader');
    renderAt('/projects/p1?tab=bogus');
    const tab = await screen.findByRole('tab', { name: 'Công việc' });
    expect(tab.getAttribute('aria-selected')).toBe('true');
  });

  it('switching tabs updates the URL and keeps other query params', async () => {
    setup('Leader');
    renderAt('/projects/p1?view=board');
    fireEvent.click(await screen.findByRole('tab', { name: /Tài liệu/ }));
    expect(screen.getByRole('tab', { name: /Tài liệu/ }).getAttribute('aria-selected')).toBe('true');
    const loc = screen.getByTestId('loc').textContent!;
    expect(loc).toContain('view=board');
    expect(loc).toContain('tab=files');
  });

  it('ArrowLeft/Right/Home/End move selection with roving focus', async () => {
    setup('Leader');
    renderAt('/projects/p1');
    const tasks = await screen.findByRole('tab', { name: 'Công việc' });
    tasks.focus();
    fireEvent.keyDown(tasks, { key: 'ArrowRight' });
    const discussion = screen.getByRole('tab', { name: 'Thảo luận' });
    expect(discussion.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(discussion);
    fireEvent.keyDown(discussion, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Công việc' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Công việc' }), { key: 'End' });
    expect(screen.getByRole('tab', { name: /Tài liệu/ }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(screen.getByRole('tab', { name: /Tài liệu/ }), { key: 'Home' });
    expect(screen.getByRole('tab', { name: 'Công việc' }).getAttribute('aria-selected')).toBe('true');
  });
});
