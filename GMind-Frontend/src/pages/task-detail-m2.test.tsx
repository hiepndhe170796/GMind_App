import type { ReactNode } from 'react';
import { act } from 'react';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TaskDetail from './TaskDetail';
import { ToastProvider } from '../components/ui/Toast';
import {
  tasksService, type TaskDetailDto, type TaskSummaryDto, type TaskPermissionsDto,
  type CommentDto, type LinkDto, type ReviewDto, type SubmissionDto,
} from '../services/tasks';
import { projectsService, type ProjectDto } from '../services/projects';
import { groupsService, type GroupDetailDto, type TaskHelperDto } from '../services/groups';
import { remindedTaskIds } from '../hooks/use-remind-task';

let currentUid = 'u-b';

vi.mock('../layouts/MainLayout', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('../hooks/use-current-user-id', () => ({
  useCurrentUserId: () => currentUid,
}));

const ALL_PERMS: TaskPermissionsDto = {
  canEdit: true, canAssign: true, canDelete: true, canUpdateProgress: true, canAddSubtask: true,
  allowedTransitions: [], canComment: true, canAddLink: true,
};
const perms = (over: Partial<TaskPermissionsDto> = {}): TaskPermissionsDto => ({ ...ALL_PERMS, ...over });

const detailTask: TaskDetailDto = {
  id: 't1', projectId: 'p1', parentTaskId: null, title: 'Task T1',
  assigneeUserId: 'u-b', assigneeName: 'User B', status: 'InProgress', priority: 'Medium',
  deadlineAt: null, canViewDetails: true, description: 'PRIVATE_TASK',
  estimateHours: 8, points: 3, progressPercent: 40, createdByUserId: 'u-a',
  createdAt: '2026-01-01T00:00:00Z', submittedAt: null, completedAt: null,
  permissions: perms({ canAssign: false, canEdit: false, canDelete: false, allowedTransitions: ['ToDo', 'Submitted'] }),
};

const summaryTask2: TaskSummaryDto = {
  id: 't2', projectId: 'p2', parentTaskId: null, title: 'Task T2',
  assigneeUserId: 'u-c', assigneeName: 'User C', status: 'ToDo', priority: 'Low',
  deadlineAt: null, canViewDetails: false,
};

const project: ProjectDto = { id: 'p1', groupId: 'g1', name: 'Project One', description: '', status: 'Active', createdAt: '2026-01-01T00:00:00Z' } as ProjectDto;
const group: GroupDetailDto = {
  id: 'g1', name: 'Group One', memberCount: 2, myRole: 'Leader', createdAt: '2026-01-01T00:00:00Z',
  members: [
    { userId: 'u-a', displayName: 'Leader A', role: 'Leader', joinedAt: '2026-01-01T00:00:00Z', openTaskCount: 2 },
    { userId: 'u-b', displayName: 'User B', role: 'Member', joinedAt: '2026-01-01T00:00:00Z', openTaskCount: 5 },
  ],
};

const comment = (over: Partial<CommentDto> = {}): CommentDto => ({
  id: 'c1', taskId: 't1', authorUserId: 'u-a', authorName: 'Leader A',
  body: 'PRIVATE_COMMENT', createdAt: '2026-01-01T00:00:00Z', isMine: false, ...over,
});
const link = (over: Partial<LinkDto> = {}): LinkDto => ({
  id: 'l1', taskId: 't1', url: 'https://private.example', displayName: 'PRIVATE_LINK',
  createdAt: '2026-01-01T00:00:00Z', ...over,
});
const review = (over: Partial<ReviewDto> = {}): ReviewDto => ({
  id: 'r1', reviewerName: 'Leader A', decision: 'ChangesRequested', comment: 'PRIVATE_REVIEW',
  submissionVersion: 1, createdAt: '2026-01-01T00:00:00Z', ...over,
});
const submission = (over: Partial<SubmissionDto> = {}): SubmissionDto => ({
  id: 's1', version: 1, submittedByName: 'User B', note: 'PRIVATE_NOTE', createdAt: '2026-01-01T00:00:00Z', ...over,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function renderPage(initial = '/tasks/t1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[initial]}>
          <Routes>
            <Route path="/tasks/:id" element={<TaskDetail />} />
          </Routes>
          <Link to="/tasks/t2">go-t2</Link>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

// jsdom lacks dialog.showModal/close
if (typeof HTMLDialogElement !== 'undefined') {
  (HTMLDialogElement.prototype).showModal ??= function () { this.setAttribute('open', ''); };
  (HTMLDialogElement.prototype).close ??= function () { this.removeAttribute('open'); };
}

function mockDetail(over: Partial<TaskDetailDto> = {}, extras: {
  comments?: CommentDto[]; links?: LinkDto[]; reviews?: ReviewDto[]; submissions?: SubmissionDto[]; subtasks?: TaskSummaryDto[];
  helpers?: TaskHelperDto[];
} = {}) {
  vi.spyOn(tasksService, 'get').mockResolvedValue({ ...detailTask, ...over });
  vi.spyOn(tasksService, 'comments').mockResolvedValue(extras.comments ?? []);
  vi.spyOn(tasksService, 'links').mockResolvedValue(extras.links ?? []);
  vi.spyOn(tasksService, 'reviews').mockResolvedValue(extras.reviews ?? []);
  vi.spyOn(tasksService, 'submissions').mockResolvedValue(extras.submissions ?? []);
  vi.spyOn(tasksService, 'subtasks').mockResolvedValue(extras.subtasks ?? []);
  vi.spyOn(tasksService, 'listHelpers').mockResolvedValue(extras.helpers ?? []);
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); currentUid = 'u-b'; remindedTaskIds.clear(); });

describe('TaskDetail M2 — permission-driven controls', () => {
  it('assignee sees only transition actions; no leader management buttons', async () => {
    mockDetail();
    vi.spyOn(projectsService, 'get').mockResolvedValue(project);
    vi.spyOn(groupsService, 'get').mockResolvedValue(group);
    renderPage();
    await screen.findByText('PRIVATE_TASK');
    expect(screen.getAllByRole('button', { name: 'Nộp để duyệt' }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: 'Về Cần làm' }).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole('button', { name: 'Sửa' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Giao lại' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Xóa' })).toBeNull();
    // header action bar on desktop + sticky bar on mobile render duplicates; check at least one exists
    expect(screen.getAllByRole('button', { name: 'Nộp để duyệt' }).length).toBeGreaterThanOrEqual(1);
  });

  it('leader sees Sửa / Giao lại / Xóa plus review actions on a submitted task', async () => {
    mockDetail({
      status: 'Submitted', assigneeUserId: 'u-x', assigneeName: 'User X',
      permissions: perms({ canUpdateProgress: false, canAddSubtask: true, allowedTransitions: ['Completed', 'ChangesRequested'] }),
    });
    vi.spyOn(projectsService, 'get').mockResolvedValue(project);
    vi.spyOn(groupsService, 'get').mockResolvedValue(group);
    renderPage();
    await screen.findByText('PRIVATE_TASK');
    expect(screen.getAllByRole('button', { name: 'Duyệt' }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: 'Yêu cầu chỉnh sửa' }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: 'Sửa' }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: 'Giao lại' }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: 'Xóa' }).length).toBeGreaterThanOrEqual(1);
  });

  it('member without details sees summary-only view and no private queries fire', async () => {
    vi.spyOn(tasksService, 'get').mockResolvedValue(summaryTask2);
    const comments = vi.spyOn(tasksService, 'comments');
    const links = vi.spyOn(tasksService, 'links');
    const reviews = vi.spyOn(tasksService, 'reviews');
    const submissions = vi.spyOn(tasksService, 'submissions');
    vi.spyOn(projectsService, 'get').mockResolvedValue({ ...project, id: 'p2' });
    vi.spyOn(groupsService, 'get').mockResolvedValue(group);
    renderPage('/tasks/t2');
    expect(await screen.findByRole('heading', { name: 'Task T2' })).toBeTruthy();
    expect(screen.getByText(/Chỉ Trưởng nhóm, người phụ trách/)).toBeTruthy();
    expect(comments).not.toHaveBeenCalled();
    expect(links).not.toHaveBeenCalled();
    expect(reviews).not.toHaveBeenCalled();
    expect(submissions).not.toHaveBeenCalled();
    expect(screen.queryByPlaceholderText('Viết bình luận…')).toBeNull();
  });

  it('parent-assignee with details sees subtask pill and breadcrumb parent link', async () => {
    mockDetail({
      parentTaskId: 'tp', parentTitle: 'Parent Task',
      permissions: perms({ allowedTransitions: ['InProgress'] }),
    });
    vi.spyOn(projectsService, 'get').mockResolvedValue(project);
    vi.spyOn(groupsService, 'get').mockResolvedValue(group);
    renderPage();
    await screen.findByText('PRIVATE_TASK');
    expect(screen.getByText('Công việc con')).toBeTruthy();
    const parentLink = screen.getByRole('link', { name: 'Parent Task' });
    expect(parentLink.getAttribute('href')).toBe('/tasks/tp');
    expect(screen.getAllByRole('button', { name: 'Bắt đầu' }).length).toBeGreaterThanOrEqual(1);
  });
});

describe('TaskDetail M2 — transitions', () => {
  beforeEach(() => {
    vi.spyOn(projectsService, 'get').mockResolvedValue(project);
    vi.spyOn(groupsService, 'get').mockResolvedValue(group);
  });

  it('ToDo assignee: Bắt đầu posts InProgress', async () => {
    mockDetail({ status: 'ToDo', permissions: perms({ allowedTransitions: ['InProgress'] }) });
    const change = vi.spyOn(tasksService, 'changeStatus').mockResolvedValue({ ...detailTask, status: 'InProgress' });
    renderPage();
    await screen.findByText('PRIVATE_TASK');
    fireEvent.click(screen.getAllByRole('button', { name: 'Bắt đầu' })[0]);
    await waitFor(() => expect(change).toHaveBeenCalledWith('t1', 2, undefined));
    expect(change).toHaveBeenCalledTimes(1);
  });

  it('ChangesRequested assignee: Làm lại posts InProgress', async () => {
    mockDetail({ status: 'ChangesRequested', permissions: perms({ allowedTransitions: ['InProgress'] }) });
    const change = vi.spyOn(tasksService, 'changeStatus').mockResolvedValue({ ...detailTask, status: 'InProgress' });
    renderPage();
    await screen.findByText('PRIVATE_TASK');
    fireEvent.click(screen.getAllByRole('button', { name: 'Làm lại' })[0]);
    await waitFor(() => expect(change).toHaveBeenCalledWith('t1', 2, undefined));
  });

  it('submit dialog sends handoff note and shows toast', async () => {
    mockDetail();
    const change = vi.spyOn(tasksService, 'changeStatus').mockResolvedValue({ ...detailTask, status: 'Submitted' });
    renderPage();
    await screen.findByText('PRIVATE_TASK');
    fireEvent.click(screen.getAllByRole('button', { name: 'Nộp để duyệt' })[0]);
    const note = await screen.findByLabelText(/Ghi chú bàn giao/);
    expect(screen.getByText(/Kiểm tra tài liệu đính kèm/)).toBeTruthy();
    fireEvent.change(note, { target: { value: 'xong phần A' } });
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Nộp để duyệt' }));
    await waitFor(() => expect(change).toHaveBeenCalledWith('t1', 3, 'xong phần A'));
    expect(await screen.findByText('Đã nộp công việc để duyệt.')).toBeTruthy();
  });

  it('submit blocked by open subtasks shows reason and no dialog', async () => {
    mockDetail({ subtaskCount: 3, subtasksCompleted: 1 });
    renderPage();
    await screen.findByText('PRIVATE_TASK');
    const btn = screen.getAllByRole('button', { name: 'Nộp để duyệt' })[0] as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByText('Hoàn thành tất cả công việc con trước khi nộp.')).toBeTruthy();
    expect(screen.queryByLabelText(/Ghi chú bàn giao/)).toBeNull();
  });

  it('approve posts Completed, shows toast and the approve moment', async () => {
    const approved = { ...detailTask, status: 'Completed', progressPercent: 100 };
    const get = vi.spyOn(tasksService, 'get')
      .mockResolvedValueOnce({ ...detailTask, status: 'Submitted', assigneeUserId: 'u-x', permissions: perms({ allowedTransitions: ['Completed', 'ChangesRequested'] }) })
      .mockResolvedValue(approved);
    vi.spyOn(tasksService, 'comments').mockResolvedValue([]);
    vi.spyOn(tasksService, 'links').mockResolvedValue([]);
    vi.spyOn(tasksService, 'reviews').mockResolvedValue([]);
    vi.spyOn(tasksService, 'submissions').mockResolvedValue([]);
    vi.spyOn(tasksService, 'subtasks').mockResolvedValue([]);
    const change = vi.spyOn(tasksService, 'changeStatus').mockResolvedValue(approved);
    renderPage();
    await screen.findByText('PRIVATE_TASK');
    fireEvent.click(screen.getAllByRole('button', { name: 'Duyệt' })[0]);
    await waitFor(() => expect(change).toHaveBeenCalledWith('t1', 5, undefined));
    expect(await screen.findByText('Đã duyệt công việc.')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Hoàn thành')).toBeTruthy());
    expect(get).toHaveBeenCalledTimes(2); // invalidated and refetched
  });

  it('request-changes requires a comment; double submit posts once', async () => {
    mockDetail({
      status: 'Submitted', assigneeUserId: 'u-x',
      permissions: perms({ allowedTransitions: ['Completed', 'ChangesRequested'] }),
    });
    const req = deferred<TaskDetailDto>();
    const change = vi.spyOn(tasksService, 'changeStatus').mockReturnValue(req.promise);
    renderPage();
    await screen.findByText('PRIVATE_TASK');
    fireEvent.click(screen.getAllByRole('button', { name: 'Yêu cầu chỉnh sửa' })[0]);
    const box = await screen.findByLabelText(/Nhận xét/);
    fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu' }));
    expect(await screen.findByText(/Hãy nhập nhận xét/)).toBeTruthy();
    expect(change).not.toHaveBeenCalled();
    fireEvent.change(box, { target: { value: 'bổ sung test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu' }));
    await waitFor(() => expect(change).toHaveBeenCalledWith('t1', 4, 'bổ sung test'));
    expect(change).toHaveBeenCalledTimes(1);
    await act(async () => { req.resolve({ ...detailTask, status: 'ChangesRequested' }); });
  });

  it('subtask reopen: Mở lại posts InProgress', async () => {
    mockDetail({
      parentTaskId: 'tp', status: 'Completed', progressPercent: 100,
      permissions: perms({ allowedTransitions: ['InProgress'] }),
    });
    const change = vi.spyOn(tasksService, 'changeStatus').mockResolvedValue({ ...detailTask, status: 'InProgress' });
    renderPage();
    await screen.findByText('PRIVATE_TASK');
    fireEvent.click(screen.getAllByRole('button', { name: 'Mở lại' })[0]);
    await waitFor(() => expect(change).toHaveBeenCalledWith('t1', 2, undefined));
  });
});

describe('TaskDetail M2 — progress', () => {
  beforeEach(() => {
    vi.spyOn(projectsService, 'get').mockResolvedValue(project);
    vi.spyOn(groupsService, 'get').mockResolvedValue(group);
  });

  it('assignee saves progress; server value confirmed', async () => {
    mockDetail({ permissions: perms({ canUpdateProgress: true, allowedTransitions: ['ToDo', 'Submitted'] }) });
    const update = vi.spyOn(tasksService, 'updateProgress').mockResolvedValue({ ...detailTask, progressPercent: 80 });
    renderPage();
    await screen.findByText('PRIVATE_TASK');
    const slider = screen.getByLabelText('Tiến độ phần trăm');
    fireEvent.change(slider, { target: { value: '80' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Lưu tiến độ' })[0]);
    await waitFor(() => expect(update).toHaveBeenCalledWith('t1', 80));
    expect(await screen.findByText('Đã lưu tiến độ.')).toBeTruthy();
  });

  it('failed save rolls the slider back and shows an error toast', async () => {
    mockDetail({ permissions: perms({ canUpdateProgress: true, allowedTransitions: ['ToDo', 'Submitted'] }) });
    vi.spyOn(tasksService, 'updateProgress').mockRejectedValue({ status: 500, message: 'boom' });
    renderPage();
    await screen.findByText('PRIVATE_TASK');
    const slider = screen.getByLabelText('Tiến độ phần trăm') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '90' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Lưu tiến độ' })[0]);
    expect(await screen.findByText('boom')).toBeTruthy();
    await waitFor(() => expect(slider.value).toBe('40'));
  });

  it('non-assignee sees the bar, not the slider', async () => {
    mockDetail({ assigneeUserId: 'u-x', permissions: perms({ canUpdateProgress: false, allowedTransitions: [] }) });
    renderPage();
    await screen.findByText('PRIVATE_TASK');
    expect(screen.queryByLabelText('Tiến độ phần trăm')).toBeNull();
    expect(screen.getByRole('img', { name: 'Tiến độ 40%' })).toBeTruthy();
  });
});

describe('TaskDetail M2 — subtasks, links, comments', () => {
  beforeEach(() => {
    vi.spyOn(projectsService, 'get').mockResolvedValue(project);
    vi.spyOn(groupsService, 'get').mockResolvedValue(group);
  });

  it('subtask add posts parentTaskId; toggle advances status', async () => {
    const sub: TaskSummaryDto = {
      id: 't-sub', projectId: 'p1', parentTaskId: 't1', title: 'Sub A', status: 'InProgress', priority: 'Low',
      assigneeName: 'User B', canViewDetails: true, permissions: perms({ allowedTransitions: ['ToDo', 'Completed'] }),
    };
    mockDetail({ subtaskCount: 1, subtasksCompleted: 0, permissions: perms({ canAddSubtask: true, allowedTransitions: [] }) }, { subtasks: [sub] });
    const create = vi.spyOn(tasksService, 'create').mockResolvedValue(detailTask);
    const change = vi.spyOn(tasksService, 'changeStatus').mockResolvedValue({ ...sub, status: 'Completed' } as TaskDetailDto);
    renderPage();
    await screen.findByText('Sub A');
    fireEvent.change(screen.getByLabelText('Thêm công việc con'), { target: { value: 'Sub B' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));
    await waitFor(() => expect(create).toHaveBeenCalledWith('p1', expect.objectContaining({ title: 'Sub B', parentTaskId: 't1' })));
    fireEvent.click(screen.getByRole('button', { name: 'Hoàn thành Sub A' }));
    await waitFor(() => expect(change).toHaveBeenCalledWith('t-sub', 5));
  });

  it('link add validates URL and delete goes through confirm', async () => {
    mockDetail({}, { links: [link({ canDelete: true })] });
    const add = vi.spyOn(tasksService, 'addLink').mockResolvedValue(link());
    const del = vi.spyOn(tasksService, 'deleteLink').mockResolvedValue({});
    renderPage();
    await screen.findByText('PRIVATE_LINK');
    fireEvent.click(screen.getByRole('button', { name: 'Thêm liên kết' }));
    const url = await screen.findByLabelText('Liên kết');
    fireEvent.change(url, { target: { value: 'javascript:alert(1)' } });
    fireEvent.submit(url.closest('form')!);
    expect(add).not.toHaveBeenCalled();
    expect(await screen.findByText(/http:\/\/ hoặc https:\/\//)).toBeTruthy();
    fireEvent.change(url, { target: { value: 'https://ok.dev/doc' } });
    fireEvent.submit(url.closest('form')!);
    await waitFor(() => expect(add).toHaveBeenCalledWith('t1', 'https://ok.dev/doc', undefined));
    fireEvent.click(screen.getByRole('button', { name: /Xóa tài liệu/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xóa' }));
    await waitFor(() => expect(del).toHaveBeenCalledWith('l1'));
  });

  it('comment edit inline and delete via confirm', async () => {
    mockDetail({}, { comments: [comment({ canEdit: true, canDelete: true })] });
    const update = vi.spyOn(tasksService, 'updateComment').mockResolvedValue(comment({ body: 'edited' }));
    const del = vi.spyOn(tasksService, 'deleteComment').mockResolvedValue({});
    renderPage();
    await screen.findByText('PRIVATE_COMMENT');
    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    const edit = screen.getByLabelText('Sửa bình luận');
    fireEvent.change(edit, { target: { value: 'edited body' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith('c1', 'edited body'));
    fireEvent.click(screen.getByRole('button', { name: 'Xóa' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xóa' }));
    await waitFor(() => expect(del).toHaveBeenCalledWith('c1'));
  });
});

describe('TaskDetail M2 — comment composer (ported)', () => {
  beforeEach(() => {
    vi.spyOn(projectsService, 'get').mockResolvedValue(project);
    vi.spyOn(groupsService, 'get').mockResolvedValue(group);
    mockDetail();
  });

  it('blank and overlength give aria-invalid+focus, no POST; ctrl+enter pending counts once', async () => {
    const req = deferred<CommentDto>();
    const add = vi.spyOn(tasksService, 'addComment').mockReturnValue(req.promise);
    renderPage();
    await screen.findByText('PRIVATE_TASK');
    const box = screen.getByPlaceholderText('Viết bình luận…') as HTMLTextAreaElement;
    fireEvent.submit(box.closest('form')!);
    expect(add).not.toHaveBeenCalled();
    expect(box.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(box);
    expect(screen.getByText('Hãy viết nội dung bình luận.')).toBeTruthy();
    fireEvent.change(box, { target: { value: 'y'.repeat(2001) } });
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
    expect(add).not.toHaveBeenCalled();
    expect(screen.getByText('Bình luận tối đa 2.000 ký tự.')).toBeTruthy();
    fireEvent.change(box, { target: { value: 'multi\nline' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(add).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(add).toHaveBeenCalledWith('t1', 'multi\nline'));
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
    expect(add).toHaveBeenCalledTimes(1);
    await act(async () => { req.resolve(comment()); });
  });

  it('ordinary 500 error keeps the task and the comment draft', async () => {
    vi.spyOn(tasksService, 'addComment').mockRejectedValue({ status: 500, message: 'boom' });
    renderPage();
    await screen.findByText('PRIVATE_TASK');
    const box = screen.getByPlaceholderText('Viết bình luận…') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'keep me' } });
    fireEvent.submit(box.closest('form')!);
    expect(await screen.findByText('boom')).toBeTruthy();
    expect(screen.getByText('PRIVATE_TASK')).toBeTruthy();
    expect(box.value).toBe('keep me');
  });

  it('post-success refetch 403 drops private panels', async () => {
    vi.spyOn(tasksService, 'get')
      .mockResolvedValueOnce(detailTask)
      .mockRejectedValue({ status: 403, message: 'Mất quyền' });
    vi.spyOn(tasksService, 'addComment').mockResolvedValue(comment());
    renderPage();
    await screen.findByText('PRIVATE_TASK');
    const box = screen.getByPlaceholderText('Viết bình luận…');
    fireEvent.change(box, { target: { value: 'hi' } });
    fireEvent.submit(box.closest('form')!);
    await waitFor(() => expect(screen.getByText('Bạn không có quyền xem công việc này')).toBeTruthy());
    expect(screen.queryByText('PRIVATE_TASK')).toBeNull();
  });
});

describe('TaskDetail M2 — handoff timeline', () => {
  beforeEach(() => {
    vi.spyOn(projectsService, 'get').mockResolvedValue(project);
    vi.spyOn(groupsService, 'get').mockResolvedValue(group);
  });

  it('merges submissions and reviews by version, newest first', async () => {
    mockDetail({ status: 'Submitted' }, {
      submissions: [submission(), submission({ id: 's2', version: 2, note: 'v2 note' })],
      reviews: [review(), review({ id: 'r2', decision: 'Completed', comment: '', submissionVersion: 1 })],
    });
    renderPage();
    await screen.findByText('PRIVATE_TASK');
    expect(await screen.findByText('Lần nộp 2')).toBeTruthy();
    expect(screen.getByText('v2 note')).toBeTruthy();
    const list = screen.getByRole('list');
    expect(list.textContent!.indexOf('Lần nộp 2')).toBeLessThan(list.textContent!.indexOf('Lần nộp 1'));
    expect(screen.getByText('Duyệt lần nộp 1')).toBeTruthy();
    expect(screen.getByText('Yêu cầu chỉnh sửa lần nộp 1')).toBeTruthy();
  });

  it('empty timeline shows friendly copy', async () => {
    mockDetail();
    renderPage();
    await screen.findByText('PRIVATE_TASK');
    expect(screen.getByText(/Chưa có lượt bàn giao nào/)).toBeTruthy();
  });
});

describe('TaskDetail M2 — error and session states', () => {
  it('404 shows not-found state with back link', async () => {
    vi.spyOn(tasksService, 'get').mockRejectedValue({ status: 404, message: 'Không tìm thấy' });
    renderPage();
    expect(await screen.findByText('Không tìm thấy công việc')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Về Công việc của tôi' })).toBeTruthy();
  });

  it('403 shows access-denied state', async () => {
    vi.spyOn(tasksService, 'get').mockRejectedValue({ status: 403, message: 'Không có quyền' });
    renderPage();
    expect(await screen.findByText('Bạn không có quyền xem công việc này')).toBeTruthy();
  });

  it('network error shows ErrorState with retry', async () => {
    vi.spyOn(tasksService, 'get')
      .mockRejectedValueOnce({ status: 0, message: 'net' })
      .mockResolvedValue(detailTask);
    vi.spyOn(tasksService, 'comments').mockResolvedValue([]);
    vi.spyOn(tasksService, 'links').mockResolvedValue([]);
    vi.spyOn(tasksService, 'reviews').mockResolvedValue([]);
    vi.spyOn(tasksService, 'submissions').mockResolvedValue([]);
    vi.spyOn(tasksService, 'subtasks').mockResolvedValue([]);
    vi.spyOn(projectsService, 'get').mockResolvedValue(project);
    vi.spyOn(groupsService, 'get').mockResolvedValue(group);
    renderPage();
    expect(await screen.findByText('net')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('PRIVATE_TASK')).toBeTruthy();
  });

  it('user switch refetches under a new key — no stale private data', async () => {
    const get = vi.spyOn(tasksService, 'get').mockResolvedValue(detailTask);
    vi.spyOn(tasksService, 'comments').mockResolvedValue([comment()]);
    vi.spyOn(tasksService, 'links').mockResolvedValue([]);
    vi.spyOn(tasksService, 'reviews').mockResolvedValue([]);
    vi.spyOn(tasksService, 'submissions').mockResolvedValue([]);
    vi.spyOn(tasksService, 'subtasks').mockResolvedValue([]);
    vi.spyOn(projectsService, 'get').mockResolvedValue(project);
    vi.spyOn(groupsService, 'get').mockResolvedValue(group);
    const { rerender } = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
        <ToastProvider>
          <MemoryRouter initialEntries={['/tasks/t1']}>
            <Routes><Route path="/tasks/:id" element={<TaskDetail />} /></Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );
    await screen.findByText('PRIVATE_TASK');
    expect(get).toHaveBeenCalledTimes(1);
    // switch user → same component, different cache key → refetch, fresh render
    currentUid = 'u-c';
    const other = { ...detailTask, title: 'Task T1', description: 'OTHER_USER_TASK', assigneeUserId: 'u-c' };
    get.mockResolvedValue(other);
    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
        <ToastProvider>
          <MemoryRouter initialEntries={['/tasks/t1']}>
            <Routes><Route path="/tasks/:id" element={<TaskDetail />} /></Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );
    await screen.findByText('OTHER_USER_TASK');
    expect(screen.queryByText('PRIVATE_TASK')).toBeNull();
  });

  it('late mutation result from a previous task does not overwrite the new task', async () => {
    vi.spyOn(tasksService, 'get').mockImplementation(async (id: string) =>
      id === 't1' ? detailTask : summaryTask2);
    vi.spyOn(tasksService, 'comments').mockResolvedValue([]);
    vi.spyOn(tasksService, 'links').mockResolvedValue([]);
    vi.spyOn(tasksService, 'reviews').mockResolvedValue([]);
    vi.spyOn(tasksService, 'submissions').mockResolvedValue([]);
    vi.spyOn(tasksService, 'subtasks').mockResolvedValue([]);
    vi.spyOn(projectsService, 'get').mockResolvedValue({ ...project, id: 'p2', groupId: 'g1' });
    vi.spyOn(groupsService, 'get').mockResolvedValue(group);
    const pending = deferred<CommentDto>();
    vi.spyOn(tasksService, 'addComment').mockReturnValue(pending.promise);
    renderPage('/tasks/t1');
    await screen.findByRole('heading', { name: 'Task T1' });
    const box = screen.getByPlaceholderText('Viết bình luận…');
    fireEvent.change(box, { target: { value: 'draft' } });
    fireEvent.submit(box.closest('form')!);
    fireEvent.click(screen.getByText('go-t2'));
    expect(await screen.findByRole('heading', { name: 'Task T2' })).toBeTruthy();
    await act(async () => {
      pending.reject({ status: 403, message: 'Không có quyền' });
      await pending.promise.catch(() => undefined);
    });
    expect(screen.getByRole('heading', { name: 'Task T2' })).toBeTruthy();
    expect(screen.queryByText('PRIVATE_TASK')).toBeNull();
    // stale mutation may toast, but must not clear the new summary view
    expect(screen.getByText(/Chỉ Trưởng nhóm, người phụ trách/)).toBeTruthy();
  });
});

describe('TaskDetail M2 — polish (deadline, pills, progress card)', () => {
  const vnDayKey = (d: Date) => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
  const addDays = (key: string, n: number) => {
    const d = new Date(`${key}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const vnIso = (key: string, hm = '12:00') => new Date(`${key}T${hm}:00+07:00`).toISOString();

  beforeEach(() => {
    vi.spyOn(projectsService, 'get').mockResolvedValue(project);
    vi.spyOn(groupsService, 'get').mockResolvedValue(group);
  });

  it('soon/later deadlines render no state pill; meta shows absolute date only', async () => {
    const todayKey = vnDayKey(new Date());
    const soonIso = vnIso(addDays(todayKey, 4));
    const { deadlineState } = await import('../utils/task-time');
    const { formatDateTime } = await import('../utils/presentation');
    mockDetail({ deadlineAt: soonIso });
    renderPage();
    await screen.findByText('PRIVATE_TASK');
    const dl = deadlineState(soonIso);
    expect(dl.kind).toBe('soon');
    expect(screen.queryByText(dl.label)).toBeNull();
    expect(screen.getByText(`User B · Hạn ${formatDateTime(soonIso)}`)).toBeTruthy();
  });

  it('overdue shows danger pill, absolute meta, and relative line in side column', async () => {
    const overdueIso = new Date(Date.now() - 2 * 3600e3).toISOString();
    const { formatDateTime } = await import('../utils/presentation');
    mockDetail({ deadlineAt: overdueIso });
    renderPage();
    await screen.findByText('PRIVATE_TASK');
    expect(screen.getByText(`User B · Hạn ${formatDateTime(overdueIso)}`)).toBeTruthy();
    const rel = screen.getAllByText('Quá hạn 2 giờ');
    expect(rel.length).toBeGreaterThanOrEqual(2); // pill + side-column relative line
    expect(rel.some(el => el.className.includes('text-danger-700'))).toBe(true);
  });

  it('no deadline → meta shows Chưa đặt hạn', async () => {
    mockDetail({ deadlineAt: null });
    renderPage();
    await screen.findByText('PRIVATE_TASK');
    expect(screen.getAllByText(/Chưa đặt hạn/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('User B · Chưa đặt hạn')).toBeTruthy();
  });

  it('current-page breadcrumb crumb is hidden below sm', async () => {
    mockDetail();
    renderPage();
    await screen.findByText('PRIVATE_TASK');
    const nav = screen.getByRole('navigation', { name: 'Đường dẫn' });
    const crumbs = Array.from(nav.querySelectorAll(':scope > span'));
    const last = crumbs[crumbs.length - 1] as HTMLElement;
    expect(last.className).toContain('max-sm:hidden');
    expect(last.textContent).toBe('Task T1');
    // ancestors keep their visibility classes
    for (const c of crumbs.slice(0, -1)) expect((c as HTMLElement).className).not.toContain('max-sm:hidden');
  });

  it('approve moment shows check without the badge dot', async () => {
    const approved = { ...detailTask, status: 'Completed', progressPercent: 100 };
    vi.spyOn(tasksService, 'get')
      .mockResolvedValueOnce({ ...detailTask, status: 'Submitted', assigneeUserId: 'u-x', permissions: perms({ allowedTransitions: ['Completed', 'ChangesRequested'] }) })
      .mockResolvedValue(approved);
    vi.spyOn(tasksService, 'comments').mockResolvedValue([]);
    vi.spyOn(tasksService, 'links').mockResolvedValue([]);
    vi.spyOn(tasksService, 'reviews').mockResolvedValue([]);
    vi.spyOn(tasksService, 'submissions').mockResolvedValue([]);
    vi.spyOn(tasksService, 'subtasks').mockResolvedValue([]);
    vi.spyOn(tasksService, 'changeStatus').mockResolvedValue(approved);
    renderPage();
    await screen.findByText('PRIVATE_TASK');
    fireEvent.click(screen.getAllByRole('button', { name: 'Duyệt' })[0]);
    const pill = await screen.findByText('Hoàn thành');
    const badge = pill.closest('span')!;
    expect(badge.querySelector('svg')).toBeTruthy();           // check icon shown
    expect(badge.querySelector('span.bg-current')).toBeNull(); // no dot
  });

  it('progress card: single value in header; save disabled until slider changes', async () => {
    mockDetail({ permissions: perms({ canUpdateProgress: true, allowedTransitions: ['ToDo', 'Submitted'] }) });
    renderPage();
    await screen.findByText('PRIVATE_TASK');
    expect(screen.getAllByText('40%').length).toBe(1);
    const save = screen.getAllByRole('button', { name: 'Lưu tiến độ' })[0] as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Tiến độ phần trăm'), { target: { value: '60' } });
    expect((screen.getAllByRole('button', { name: 'Lưu tiến độ' })[0] as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getAllByText('60%').length).toBe(1);
  });
});

describe('TaskDetail M3 — Nhắc', () => {
  it('200 → success toast and the button becomes disabled "Đã nhắc"', async () => {
    mockDetail({ permissions: perms({ canRemind: true }) });
    const remind = vi.spyOn(tasksService, 'remind').mockResolvedValue({} as never);
    renderPage();
    await screen.findByText('PRIVATE_TASK');
    fireEvent.click(screen.getAllByRole('button', { name: 'Nhắc User B về Task T1' })[0]);
    await screen.findByText('Đã gửi nhắc nhở tới User B.');
    const done = (await screen.findAllByRole('button', { name: 'Đã nhắc User B về Task T1' }))[0] as HTMLButtonElement;
    expect(done.disabled).toBe(true);
    expect(done.textContent).toContain('Đã nhắc');
    fireEvent.click(done); // no second request
    expect(remind).toHaveBeenCalledTimes(1);
  });

  it('409 → error toast with server message and the button becomes "Đã nhắc"', async () => {
    mockDetail({ permissions: perms({ canRemind: true }) });
    const remind = vi.spyOn(tasksService, 'remind').mockRejectedValue({ status: 409, message: 'Bạn vừa nhắc công việc này gần đây.' });
    renderPage();
    await screen.findByText('PRIVATE_TASK');
    fireEvent.click(screen.getAllByRole('button', { name: 'Nhắc User B về Task T1' })[0]);
    await screen.findByText('Bạn vừa nhắc công việc này gần đây.');
    expect(((await screen.findAllByRole('button', { name: 'Đã nhắc User B về Task T1' }))[0] as HTMLButtonElement).disabled).toBe(true);
    expect(remind).toHaveBeenCalledTimes(1);
  });

  it('hidden when canRemind is false', async () => {
    mockDetail({ permissions: perms({ canRemind: false }) });
    renderPage();
    await screen.findByText('PRIVATE_TASK');
    expect(screen.queryByRole('button', { name: /^Nhắc/ })).toBeNull();
  });
});

describe('TaskDetail M4 — helpers', () => {
  const helper = (over: Partial<TaskHelperDto> = {}): TaskHelperDto => ({
    id: 'h1', userId: 'u-h', displayName: 'Helper H', scope: 'fix tests',
    createdAt: '2026-01-02T00:00:00Z', canEnd: true, ...over,
  });
  const mockShell = () => {
    vi.spyOn(projectsService, 'get').mockResolvedValue(project);
    vi.spyOn(groupsService, 'get').mockResolvedValue(group);
  };

  it('helpers card lists active + ended; end-help confirm calls API and toasts', async () => {
    mockDetail({}, { helpers: [helper(), helper({ id: 'h2', displayName: 'Old H', scope: 'old scope', endedAt: '2026-01-05T00:00:00Z', canEnd: false })] });
    mockShell();
    const end = vi.spyOn(tasksService, 'endHelper').mockResolvedValue(undefined as never);
    renderPage();
    await screen.findByText('Người hỗ trợ (1)');
    expect(screen.getByText('fix tests')).toBeTruthy();
    expect(screen.getByText('Đã kết thúc (1)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Kết thúc hỗ trợ' }));
    const dlg = await screen.findByRole('dialog');
    expect(dlg.textContent).toContain('Helper H');
    fireEvent.click(within(dlg).getByRole('button', { name: 'Kết thúc hỗ trợ' }));
    await waitFor(() => expect(end).toHaveBeenCalledWith('t1', 'h1'));
    await screen.findByText('Đã kết thúc hỗ trợ.');
  });

  it('helper notice + canComment true shows comment form; canAddLink false hides link form', async () => {
    mockDetail({ permissions: perms({ isHelper: true, canAssign: false, canComment: true, canAddLink: false, canEdit: false, canUpdateProgress: false, allowedTransitions: [] }) },
      { helpers: [helper({ canEnd: false })] });
    mockShell();
    renderPage();
    await screen.findByText(/Bạn đang hỗ trợ công việc này/);
    expect(screen.getByRole('button', { name: 'Gửi bình luận' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Thêm tài liệu' })).toBeNull();
  });

  it('leader who is also a helper does not see the helper notice', async () => {
    mockDetail({ permissions: perms({ isHelper: true, canAssign: true }) });
    mockShell();
    renderPage();
    await screen.findByText('PRIVATE_TASK');
    expect(screen.queryByText(/Bạn đang hỗ trợ công việc này/)).toBeNull();
  });

  it('canComment false hides the comment form', async () => {
    mockDetail({ permissions: perms({ canComment: false, canAddLink: true }) });
    mockShell();
    renderPage();
    await screen.findByText('PRIVATE_TASK');
    expect(screen.queryByRole('button', { name: 'Gửi bình luận' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Thêm liên kết' })).toBeTruthy();
  });

  it('assignee gets the marketplace entry link on an open top-level task', async () => {
    mockDetail();
    mockShell();
    renderPage();
    await screen.findByText('PRIVATE_TASK');
    const links = await screen.findAllByRole('link', { name: 'Nhờ hỗ trợ / chuyển giao' });
    expect(links[0].getAttribute('href')).toBe('/groups/g1/marketplace?new=NeedHelp&task=t1');
  });

  it('remindedRecently renders the disabled Đã nhắc state', async () => {
    mockDetail({ permissions: perms({ canRemind: true, remindedRecently: true }) });
    mockShell();
    renderPage();
    await screen.findByText('PRIVATE_TASK');
    const btn = screen.getAllByRole('button', { name: /Đã nhắc/ })[0] as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
