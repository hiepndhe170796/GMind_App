import type { ReactNode } from 'react';
import { act } from 'react';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TaskDetail from './TaskDetail';
import GroupDetail from './GroupDetail';
import { loadGroupWorkspace, loadTaskWorkspace } from '../services/workspace';
import { tasksService, type TaskDetailDto, type TaskSummaryDto, type CommentDto, type LinkDto, type ReviewDto } from '../services/tasks';
import { groupsService, type GroupDetailDto, type ActivityDto } from '../services/groups';
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

function renderTaskRoutes(initial: string) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
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
    const invite = vi.spyOn(groupsService, 'createInvite')
      .mockResolvedValueOnce({ id: 'i1', code: 'OLDCODE', inviteLink: '/join/OLDCODE' })
      .mockRejectedValueOnce({ status: 403, message: 'Không có quyền' });
    renderGroupRoutes('/groups/g1');

    expect(await screen.findByText('Group One')).toBeTruthy();
    expect(screen.getByText(/PRIVATE_ACTIVITY/)).toBeTruthy();
    fireEvent.click(screen.getByText('Tạo mã mời'));
    expect(await screen.findByText('OLDCODE')).toBeTruthy();

    fireEvent.click(screen.getByText('Tạo mã mời'));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByText('Thử lại')).toBeTruthy();
    expect(screen.queryByText('OLDCODE')).toBeNull();
    expect(screen.queryByText(/PRIVATE_ACTIVITY/)).toBeNull();
    expect(screen.queryByText('Group One')).toBeNull();
    expect(invite).toHaveBeenCalledTimes(2);
  });

  it('late invite result from a previous group does not leak into the new group', async () => {
    vi.mocked(loadGroupWorkspace).mockImplementation(async (id: string) => ({
      group: group(id, id === 'g1' ? 'Group One' : 'Group Two', 'Leader'),
      projects: [], progress: leaderProgress, activity: [],
    }));
    const pending = deferred<{ id: string; code: string; inviteLink: string }>();
    vi.spyOn(groupsService, 'createInvite').mockReturnValue(pending.promise);
    renderGroupRoutes('/groups/g1');

    expect(await screen.findByText('Group One')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('Tên project'), { target: { value: 'draft' } });
    fireEvent.click(screen.getByText('Tạo mã mời'));
    fireEvent.click(screen.getByText('go-g2'));

    expect(await screen.findByText('Group Two')).toBeTruthy();
    await act(async () => {
      pending.resolve({ id: 'i1', code: 'OLDCODE', inviteLink: '/join/OLDCODE' });
      await pending.promise;
    });

    expect(screen.getByText('Group Two')).toBeTruthy();
    expect(screen.queryByText('OLDCODE')).toBeNull();
    expect((screen.getByPlaceholderText('Tên project') as HTMLInputElement).value).toBe('');
    expect(vi.mocked(loadGroupWorkspace).mock.calls).toEqual([['g1'], ['g2']]);
  });

  it('member sees no leader activity or progress sections', async () => {
    vi.mocked(loadGroupWorkspace).mockResolvedValue({
      group: group('g1', 'Group One', 'Member'), projects: [], progress: null, activity: [],
    });
    renderGroupRoutes('/groups/g1');

    expect(await screen.findByText('Group One')).toBeTruthy();
    expect(screen.queryByText('Hoạt động gần đây')).toBeNull();
    expect(screen.queryByText(/Tiến độ thành viên/)).toBeNull();
    expect(screen.queryByText('Tạo mã mời')).toBeNull();
  });
});
