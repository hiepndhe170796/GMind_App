import type { ReactNode } from 'react';
import { act } from 'react';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TaskDetail from './TaskDetail';
import GroupDetail from './GroupDetail';
import { loadGroupWorkspace, loadTaskWorkspace } from '../services/workspace';
import { tasksService, type TaskDetailDto, type TaskSummaryDto, type CommentDto, type LinkDto, type ReviewDto } from '../services/tasks';
import { groupsService, type InviteDto, type GroupDetailDto, type ActivityDto } from '../services/groups';
import { type GroupProgress } from '../services/dashboard';

vi.mock('../layouts/MainLayout', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('../services/auth', () => ({
  authService: {
    isLoggedIn: () => true,
    currentUser: () => ({ id: 'u-b', displayName: 'User B', email: 'b@test.dev' }),
  },
}));

vi.mock('../services/workspace', () => ({
  loadTaskWorkspace: vi.fn(),
  loadGroupWorkspace: vi.fn(),
}));

const detailTask: TaskDetailDto = {
  id: 't1', projectId: 'p1', parentTaskId: null, title: 'Task T1',
  assigneeUserId: 'u-b', assigneeName: 'User B', status: 'InProgress', priority: 'Medium',
  deadlineAt: null, canViewDetails: true, description: 'PRIVATE_TASK',
  estimateHours: 8, points: 3, progressPercent: 40, createdByUserId: 'u-a',
  createdAt: '2026-01-01T00:00:00Z', submittedAt: null, completedAt: null,
};

const summaryTask2: TaskSummaryDto = {
  id: 't2', projectId: 'p2', parentTaskId: null, title: 'Task T2',
  assigneeUserId: 'u-c', assigneeName: 'User C', status: 'ToDo', priority: 'Low',
  deadlineAt: null, canViewDetails: false,
};

const privateComment: CommentDto = {
  id: 'c1', taskId: 't1', authorUserId: 'u-b', authorName: 'User B',
  body: 'PRIVATE_COMMENT', createdAt: '2026-01-01T00:00:00Z', isMine: false,
};
const privateLink: LinkDto = {
  id: 'l1', taskId: 't1', url: 'https://private.example', displayName: 'PRIVATE_LINK', createdAt: '2026-01-01T00:00:00Z',
};
const privateReview: ReviewDto = {
  id: 'r1', reviewerName: 'Leader A', decision: 'ChangesRequested', comment: 'PRIVATE_REVIEW',
  submissionVersion: 1, createdAt: '2026-01-01T00:00:00Z',
};

const group = (id: string, name: string, myRole: string): GroupDetailDto => ({
  id, name, memberCount: 2, myRole, createdAt: '2026-01-01T00:00:00Z', members: [],
});
const leaderProgress: GroupProgress = {
  groupId: 'g1', totalTasks: 2, completedTasks: 1, percentComplete: 50,
  members: [{ userId: 'u-b', displayName: 'User B', total: 2, inProgress: 1, submitted: 0, completed: 1 }],
};
const privateActivity: ActivityDto[] = [
  { id: 'a1', actorName: 'Leader A', action: 'Create', entityType: 'Task', summary: 'PRIVATE_ACTIVITY', createdAt: '2026-01-01T00:00:00Z' },
];

const taskWorkspace = (task: TaskDetailDto | TaskSummaryDto) => ({
  task,
  comments: [privateComment],
  links: [privateLink],
  reviews: [privateReview],
  myRole: 'Leader',
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function renderTaskRoutes(initial: string, state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[state === undefined ? initial : { pathname: initial, state }]}>
      <Routes>
        <Route path="/tasks/:id" element={<TaskDetail />} />
      </Routes>
      <Link to="/tasks/t2">go-t2</Link>
    </MemoryRouter>
  );
}

function renderGroupRoutes(initial: string) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/groups/:id" element={<GroupDetail />} />
      </Routes>
      <Link to="/groups/g2">go-g2</Link>
    </MemoryRouter>
  );
}


// jsdom lacks dialog.showModal/close
if (typeof HTMLDialogElement !== 'undefined') {
  (HTMLDialogElement.prototype).showModal ??= function () { this.setAttribute('open', ''); };
  (HTMLDialogElement.prototype).close ??= function () { this.removeAttribute('open'); };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.mocked(loadTaskWorkspace).mockClear();
  vi.mocked(loadGroupWorkspace).mockClear();
});

describe('TaskDetail access handling', () => {
  it.each([403, 404])('mutation denied with %i clears private panels and shows alert + retry', async (status) => {
    vi.mocked(loadTaskWorkspace).mockResolvedValue(taskWorkspace(detailTask));
    const addComment = vi.spyOn(tasksService, 'addComment').mockRejectedValue({ status, message: 'Không có quyền' });
    renderTaskRoutes('/tasks/t1');

    expect(await screen.findByText('PRIVATE_TASK')).toBeTruthy();
    expect(screen.getByText('PRIVATE_COMMENT')).toBeTruthy();
    expect(screen.getByText('PRIVATE_LINK')).toBeTruthy();
    expect(screen.getByText('PRIVATE_REVIEW')).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('Viết bình luận...'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByText('Gửi'));

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByText('Không có quyền')).toBeTruthy();
    expect(screen.getByText('Thử lại')).toBeTruthy();
    expect(screen.queryByText('PRIVATE_TASK')).toBeNull();
    expect(screen.queryByText('PRIVATE_COMMENT')).toBeNull();
    expect(screen.queryByText('PRIVATE_LINK')).toBeNull();
    expect(screen.queryByText('PRIVATE_REVIEW')).toBeNull();
    expect(screen.queryByText('Task T1')).toBeNull();
    expect(addComment).toHaveBeenCalledWith('t1', 'hello');
    expect(vi.mocked(loadTaskWorkspace).mock.calls).toEqual([['t1']]);
  });

  it('late mutation result from a previous task does not overwrite the new task', async () => {
    vi.mocked(loadTaskWorkspace).mockImplementation(async (id: string) =>
      taskWorkspace(id === 't1' ? detailTask : summaryTask2));
    const pending = deferred<CommentDto>();
    vi.spyOn(tasksService, 'addComment').mockReturnValue(pending.promise);
    renderTaskRoutes('/tasks/t1');

    expect(await screen.findByText('Task T1')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('Viết bình luận...'), { target: { value: 'draft' } });
    fireEvent.click(screen.getByText('Gửi'));
    fireEvent.click(screen.getByText('go-t2'));

    expect(await screen.findByText('Task T2')).toBeTruthy();
    await act(async () => {
      pending.reject({ status: 403, message: 'Không có quyền' });
      await pending.promise.catch(() => undefined);
    });

    expect(screen.getByText('Task T2')).toBeTruthy();
    expect(screen.queryByText('Task T1')).toBeNull();
    expect(screen.queryByText('PRIVATE_TASK')).toBeNull();
    expect(screen.queryByText('PRIVATE_COMMENT')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(vi.mocked(loadTaskWorkspace).mock.calls).toEqual([['t1'], ['t2']]);
  });

  it('ordinary 500 mutation error keeps the task and the comment draft', async () => {
    vi.mocked(loadTaskWorkspace).mockResolvedValue(taskWorkspace(detailTask));
    vi.spyOn(tasksService, 'addComment').mockRejectedValue({ status: 500, message: 'boom' });
    renderTaskRoutes('/tasks/t1');

    expect(await screen.findByText('PRIVATE_TASK')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('Viết bình luận...'), { target: { value: 'keep me' } });
    fireEvent.click(screen.getByText('Gửi'));

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByText('boom')).toBeTruthy();
    expect(screen.getByText('PRIVATE_TASK')).toBeTruthy();
    expect((screen.getByPlaceholderText('Viết bình luận...') as HTMLInputElement).value).toBe('keep me');
  });

  it('summary task renders notice instead of private panels', async () => {
    vi.mocked(loadTaskWorkspace).mockResolvedValue({ task: summaryTask2, comments: [], links: [], reviews: [], myRole: 'Member' });
    renderTaskRoutes('/tasks/t2');

    expect(await screen.findByText('Task T2')).toBeTruthy();
    expect(screen.getByText(/Chỉ Leader và người phụ trách được xem chi tiết/)).toBeTruthy();
    expect(screen.queryByPlaceholderText('Viết bình luận...')).toBeNull();
    expect(screen.queryByPlaceholderText('https://...')).toBeNull();
    expect(screen.queryByText('Lịch sử duyệt')).toBeNull();
  });
});

describe('GroupDetail access handling', () => {
  it('invite denied with 403 clears group, activity, code and shows retry', async () => {
    vi.mocked(loadGroupWorkspace).mockResolvedValue({
      group: group('g1', 'Group One', 'Leader'), projects: [], progress: leaderProgress, activity: privateActivity,
    });
    vi.spyOn(groupsService, 'createInvite')
      .mockResolvedValueOnce({ id: 'i1', code: 'OLDCODE', inviteLink: '/join/OLDCODE', usedCount: 0 });
    const { groupsManage } = await import('../services/groups');
    const revoke = vi.spyOn(groupsManage, 'revokeInvite')
      .mockRejectedValueOnce({ status: 403, message: 'Không có quyền' });
    renderGroupRoutes('/groups/g1');

    expect(await screen.findByRole('heading',{name:'Group One'})).toBeTruthy();
    expect(screen.getByText(/PRIVATE_ACTIVITY/)).toBeTruthy();
    fireEvent.click(screen.getByText('Tạo mã mời'));
    expect(await screen.findByText('OLDCODE')).toBeTruthy();

    fireEvent.click(screen.getByText('Thu hồi'));
    fireEvent.click(screen.getAllByText('Thu hồi').find(el => el.closest('dialog'))!);
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByText('Thử lại')).toBeTruthy();
    expect(screen.queryByText('OLDCODE')).toBeNull();
    expect(screen.queryByText(/PRIVATE_ACTIVITY/)).toBeNull();
    expect(screen.queryByRole('heading',{name:'Group One'})).toBeNull();
    expect(revoke).toHaveBeenCalledWith('i1');
  });

  it('late invite result from a previous group does not leak into the new group', async () => {
    vi.mocked(loadGroupWorkspace).mockImplementation(async (id: string) => ({
      group: group(id, id === 'g1' ? 'Group One' : 'Group Two', 'Leader'),
      projects: [], progress: leaderProgress, activity: [],
    }));
    const pending = deferred<InviteDto>();
    vi.spyOn(groupsService, 'createInvite').mockReturnValue(pending.promise);
    renderGroupRoutes('/groups/g1');

    expect(await screen.findByRole('heading',{name:'Group One'})).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tạo dự án' }));
    fireEvent.change(screen.getByLabelText('Tên dự án'), { target: { value: 'draft' } });
    fireEvent.click(screen.getByText('Tạo mã mời'));
    fireEvent.click(screen.getByText('go-g2'));

    expect(await screen.findByRole('heading',{name:'Group Two'})).toBeTruthy();
    await act(async () => {
      pending.resolve({ id: 'i1', code: 'OLDCODE', inviteLink: '/join/OLDCODE', usedCount: 0 });
      await pending.promise;
    });

    expect(screen.getByRole('heading',{name:'Group Two'})).toBeTruthy();
    expect(screen.queryByText('OLDCODE')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tạo dự án' }));
    expect((screen.getByLabelText('Tên dự án') as HTMLInputElement).value).toBe('');
    expect(vi.mocked(loadGroupWorkspace).mock.calls).toEqual([['g1'], ['g2']]);
  });

  it('member sees no leader activity or progress sections', async () => {
    vi.mocked(loadGroupWorkspace).mockResolvedValue({
      group: group('g1', 'Group One', 'Member'), projects: [], progress: null, activity: [],
    });
    renderGroupRoutes('/groups/g1');

    expect(await screen.findByRole('heading',{name:'Group One'})).toBeTruthy();
    expect(screen.queryByText('Hoạt động gần đây')).toBeNull();
    expect(screen.queryByText(/Tiến độ thành viên/)).toBeNull();
    expect(screen.queryByText('Tạo mã mời')).toBeNull();
  });
});

describe('TaskDetail mutations', () => {
  const ws = (over: Partial<TaskDetailDto> = {}, myRole = 'Member') => ({
    task: { ...detailTask, ...over } as TaskDetailDto,
    comments: [], links: [], reviews: [], myRole,
  });
  const header = () => document.querySelector('.task-surface header')!;

  it.each([
    ['ToDo', 'InProgress', 2, 'Bắt đầu làm', 'Đang làm'],
    ['InProgress', 'Submitted', 3, 'Nộp để duyệt', 'Chờ duyệt'],
    ['ChangesRequested', 'InProgress', 2, 'Làm lại', 'Đang làm'],
  ] as const)('assignee %s -> posts %i via %s', async (from, next, code, label, badge) => {
    vi.mocked(loadTaskWorkspace)
      .mockResolvedValueOnce(ws({ status: from }))
      .mockResolvedValue(ws({ status: next }));
    const change = vi.spyOn(tasksService, 'changeStatus').mockResolvedValue({ ...detailTask, status: next });
    renderTaskRoutes('/tasks/t1');
    fireEvent.click(await screen.findByText(label));
    await waitFor(() => expect(change).toHaveBeenCalledWith('t1', code, undefined));
    await waitFor(() => expect(header().textContent).toContain(badge));
    expect(change).toHaveBeenCalledTimes(1);
  });

  it('pending return locks both review buttons; double click still one POST', async () => {
    vi.mocked(loadTaskWorkspace).mockResolvedValue(ws({ status: 'Submitted', assigneeUserId: 'u-x' }, 'Leader'));
    const req = deferred<TaskDetailDto>();
    const change = vi.spyOn(tasksService, 'changeStatus').mockReturnValue(req.promise);
    renderTaskRoutes('/tasks/t1');
    fireEvent.change(await screen.findByLabelText('Nhận xét duyệt'), { target: { value: 'note' } });
    const ret = screen.getByText('Trả về sửa');
    const ok = screen.getByText('Duyệt hoàn thành');
    fireEvent.click(ret);
    fireEvent.click(ret);
    fireEvent.click(ok);
    expect(change).toHaveBeenCalledTimes(1);
    expect(change).toHaveBeenCalledWith('t1', 4, 'note');
    expect((ok as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { req.resolve({ ...detailTask, status: 'ChangesRequested' }); });
    await waitFor(() => expect((ok as HTMLButtonElement).disabled).toBe(false));
  });

  it('status 500 keeps review draft; retry posts once and clears old error', async () => {
    vi.mocked(loadTaskWorkspace).mockResolvedValue(ws({ status: 'Submitted', assigneeUserId: 'u-x' }, 'Leader'));
    const change = vi.spyOn(tasksService, 'changeStatus')
      .mockRejectedValueOnce({ status: 500, message: 'server err' })
      .mockResolvedValue({ ...detailTask, status: 'ChangesRequested' });
    renderTaskRoutes('/tasks/t1');
    const note = await screen.findByLabelText('Nhận xét duyệt');
    fireEvent.change(note, { target: { value: 'fix it' } });
    fireEvent.click(screen.getByText('Trả về sửa'));
    expect(await screen.findByText('server err')).toBeTruthy();
    expect((note as HTMLTextAreaElement).value).toBe('fix it');
    fireEvent.click(screen.getByText('Trả về sửa'));
    await waitFor(() => expect(change).toHaveBeenCalledTimes(2));
    await screen.findByText('Đã yêu cầu chỉnh sửa.');
    expect(screen.queryByText('server err')).toBeNull();
  });

  it('comment validation: blank and overlength give aria-invalid+focus, no POST; ctrl+enter pending counts once', async () => {
    vi.mocked(loadTaskWorkspace).mockResolvedValue(taskWorkspace(detailTask));
    const req = deferred<CommentDto>();
    const add = vi.spyOn(tasksService, 'addComment').mockReturnValue(req.promise);
    renderTaskRoutes('/tasks/t1');
    await screen.findByText('PRIVATE_TASK');
    const box = screen.getByPlaceholderText('Viết bình luận...') as HTMLTextAreaElement;
    fireEvent.click(screen.getByText('Gửi'));
    expect(add).not.toHaveBeenCalled();
    expect(box.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(box);
    expect(screen.getByText('Nhập nội dung bình luận.')).toBeTruthy();
    fireEvent.change(box, { target: { value: 'y'.repeat(2001) } });
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
    expect(add).not.toHaveBeenCalled();
    expect(screen.getByText('Bình luận tối đa 2.000 ký tự.')).toBeTruthy();
    fireEvent.change(box, { target: { value: 'multi\nline' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(add).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
    expect(add).toHaveBeenCalledWith('t1', 'multi\nline');
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
    expect(add).toHaveBeenCalledTimes(1);
    await act(async () => { req.resolve(privateComment); });
  });

  it('url validator shared: bad schemes no POST+focus, 500 keeps draft+focus, legacy link renders inert', async () => {
    vi.mocked(loadTaskWorkspace).mockResolvedValue({
      ...ws(), links: [{ id: 'l9', taskId: 't1', url: 'javascript:x', displayName: 'LEGACY', createdAt: '2026-01-01T00:00:00Z' }],
    });
    const add = vi.spyOn(tasksService, 'addLink').mockRejectedValue({ status: 500, message: 'net' });
    renderTaskRoutes('/tasks/t1');
    await screen.findByText('PRIVATE_TASK');
    expect(screen.getByText('LEGACY').tagName).not.toBe('A');
    const input = screen.getByPlaceholderText('https://...') as HTMLInputElement;
    for (const bad of ['javascript:alert(1)', 'ftp://x', 'not a url']) {
      fireEvent.change(input, { target: { value: bad } });
      fireEvent.submit(input.closest('form')!);
      expect(add).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(input);
    }
    fireEvent.change(input, { target: { value: 'https://ok.dev/doc' } });
    screen.getByRole('button', { name: 'Thêm liên kết' }).focus();
    fireEvent.submit(input.closest('form')!);
    expect(add).toHaveBeenCalledWith('t1', 'https://ok.dev/doc');
    await screen.findByRole('alert');
    await waitFor(() => expect(document.activeElement).toBe(input));
    expect(input.value).toBe('https://ok.dev/doc');
  });

  it('unmount before scheduled fetch issues no request', async () => {
    vi.mocked(loadTaskWorkspace).mockClear();
    const { unmount } = renderTaskRoutes('/tasks/t1');
    unmount();
    await act(async () => { await Promise.resolve(); });
    expect(loadTaskWorkspace).not.toHaveBeenCalled();
  });

  it('post-success quiet GET 403 clears private panels, drafts and success', async () => {
    vi.mocked(loadTaskWorkspace)
      .mockResolvedValueOnce(ws())
      .mockRejectedValueOnce({ status: 403, message: 'Mất quyền' });
    vi.spyOn(tasksService, 'addComment').mockResolvedValue(privateComment);
    renderTaskRoutes('/tasks/t1');
    await screen.findByText('PRIVATE_TASK');
    fireEvent.change(screen.getByPlaceholderText('Viết bình luận...'), { target: { value: 'hi' } });
    fireEvent.change(screen.getByPlaceholderText('https://...'), { target: { value: 'https://a.dev' } });
    fireEvent.click(screen.getByText('Gửi'));
    expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.queryByText('PRIVATE_TASK')).toBeNull();
    expect(screen.queryByText('Đã gửi bình luận.')).toBeNull();
    expect(screen.queryByPlaceholderText('Viết bình luận...')).toBeNull();
  });

  it('manual refresh during pending write cannot interleave; controls stay locked', async () => {
    const gate = deferred<Awaited<ReturnType<typeof loadTaskWorkspace>>>();
    vi.mocked(loadTaskWorkspace)
      .mockResolvedValueOnce(ws())
      .mockRejectedValueOnce({ status: 500, message: 'get fail' })
      .mockImplementation(() => gate.promise);
    const add = vi.spyOn(tasksService, 'addComment').mockResolvedValue(privateComment);
    renderTaskRoutes('/tasks/t1');
    await screen.findByText('PRIVATE_TASK');
    fireEvent.change(screen.getByPlaceholderText('Viết bình luận...'), { target: { value: 'kept' } });
    fireEvent.click(screen.getByText('Gửi'));
    await screen.findByRole('button', { name: 'Tải lại chi tiết' });
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại chi tiết' }));
    await waitFor(() => expect((screen.getByPlaceholderText('Viết bình luận...') as HTMLTextAreaElement).disabled).toBe(true));
    const box = screen.getByPlaceholderText('Viết bình luận...');
    fireEvent.change(box, { target: { value: 'second' } });
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));
    expect(add).toHaveBeenCalledTimes(1);
    await act(async () => { gate.resolve(ws()); });
    await waitFor(() => expect((screen.getByPlaceholderText('Viết bình luận...') as HTMLTextAreaElement).disabled).toBe(false));
    expect(add).toHaveBeenCalledTimes(1);
  });

  it('summary task hides private panels even when arrays are populated', async () => {
    vi.mocked(loadTaskWorkspace).mockResolvedValue({
      task: summaryTask2, comments: [privateComment], links: [privateLink], reviews: [privateReview], myRole: 'Member',
    });
    renderTaskRoutes('/tasks/t2');
    expect(await screen.findByText('Task T2')).toBeTruthy();
    expect(screen.queryByText('PRIVATE_COMMENT')).toBeNull();
    expect(screen.queryByText('PRIVATE_LINK')).toBeNull();
    expect(screen.queryByText('PRIVATE_REVIEW')).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByPlaceholderText('Viết bình luận...')).toBeNull();
  });

  it.each([
    ['/my-tasks?q=Build&page=2', '/my-tasks?q=Build&page=2'],
    ['/my-tasks-invalid', '/my-tasks'],
    [42, '/my-tasks'],
    [undefined, '/dashboard'],
  ])('returnTo %p resolves back link %p', async (ret, expected) => {
    vi.mocked(loadTaskWorkspace).mockResolvedValue(taskWorkspace(detailTask));
    const state = { navigationSection: ret === undefined ? '/dashboard' : '/my-tasks', returnTo: ret };
    renderTaskRoutes('/tasks/t1', state);
    await screen.findByText('PRIVATE_TASK');
    const back = screen.getByRole('link', { name: /Về (Việc của tôi|Tổng quan)/ });
    expect(back.getAttribute('href')).toBe(expected);
  });
});

describe('calendar TaskDetail navigation', () => {
  it.each([
    ['/calendar', '/calendar'],
    ['/calendar?month=2026-12&date=2026-12-15&view=list&q=x', '/calendar?month=2026-12&date=2026-12-15&view=list&q=x'],
    ['/calendar/evil', '/calendar'],
    ['//evil.example', '/calendar'],
    ['https://evil.example', '/calendar'],
    ['/calendar#x', '/calendar'],
  ])('calendar returnTo %p resolves back link %p', async (ret, expected) => {
    vi.mocked(loadTaskWorkspace).mockResolvedValue(taskWorkspace(detailTask));
    renderTaskRoutes('/tasks/t1', { navigationSection: '/calendar', returnTo: ret });
    await screen.findByText('PRIVATE_TASK');
    const back = screen.getByRole('link', { name: 'Về Lịch công việc' });
    expect(back.getAttribute('href')).toBe(expected);
  });
});

describe('notification TaskDetail navigation', () => {
  it.each([
    ['/notifications', '/notifications'],
    ['/notifications?source=bell&unread=1', '/notifications?source=bell&unread=1'],
    ['/notifications/evil', '/notifications'],
    ['/notifications#unexpected', '/notifications'],
    ['https://evil.example/notifications', '/notifications'],
    ['//evil.example', '/notifications'],
  ])('returnTo %p uses the correct notification label and safe path %p', async (ret, expected) => {
    vi.mocked(loadTaskWorkspace).mockResolvedValue(taskWorkspace(detailTask));
    renderTaskRoutes('/tasks/t1', { navigationSection: '/notifications', returnTo: ret });
    await screen.findByText('PRIVATE_TASK');
    expect(screen.getByRole('link', { name: 'Về Thông báo' }).getAttribute('href')).toBe(expected);
  });
});
