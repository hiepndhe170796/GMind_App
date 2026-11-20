import type { ReactNode } from 'react';
import { act } from 'react';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GroupDetail from './GroupDetail';
import { loadGroupWorkspace } from '../services/workspace';
import { groupsService, groupsManage, type InviteDto, type GroupDetailDto, type ActivityDto } from '../services/groups';
import { projectsManage } from '../services/projects';
import { type GroupProgress } from '../services/dashboard';
import { ToastProvider } from '../components/ui/Toast';

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
  loadGroupWorkspace: vi.fn(),
}));

vi.mock('../hooks/use-current-user-id', () => ({ useCurrentUserId: () => 'u-b' }));

const group = (id: string, name: string, myRole: string): GroupDetailDto => ({
  id, name, memberCount: 2, myRole, createdAt: '2026-01-01T00:00:00Z', members: [],
});
const leaderProgress: GroupProgress = {
  groupId: 'g1', totalTasks: 2, completedTasks: 1, percentComplete: 50, unassignedTasks: 0,
  members: [{ userId: 'u-b', displayName: 'User B', total: 2, inProgress: 1, submitted: 0, completed: 1, changesRequested: 0, overdue: 0, isActiveMember: true, atRisk: 0 }],
};
const privateActivity: ActivityDto[] = [
  { id: 'a1', actorName: 'Leader A', action: 'Create', entityType: 'Task', summary: 'PRIVATE_ACTIVITY', createdAt: '2026-01-01T00:00:00Z' },
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
function renderGroupRoutes(initial: string) {
  return render(
    <QueryClientProvider client={qc()}><ToastProvider>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/groups/:id" element={<GroupDetail />} />
        </Routes>
        <Link to="/groups/g2">go-g2</Link>
      </MemoryRouter>
    </ToastProvider></QueryClientProvider>
  );
}

const mockServices = () => {
  vi.spyOn(groupsService, 'listInvites').mockResolvedValue([]);
  vi.spyOn(projectsManage, 'archived').mockResolvedValue([]);
};

// jsdom lacks dialog.showModal/close
if (typeof HTMLDialogElement !== 'undefined') {
  (HTMLDialogElement.prototype).showModal ??= function () { this.setAttribute('open', ''); };
  (HTMLDialogElement.prototype).close ??= function () { this.removeAttribute('open'); };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.mocked(loadGroupWorkspace).mockClear();
});

describe('GroupDetail access handling', () => {
  it('403 on a write surfaces the server message and refetches the workspace', async () => {
    vi.mocked(loadGroupWorkspace).mockResolvedValue({
      group: group('g1', 'Group One', 'Leader'), projects: [], progress: leaderProgress, activity: privateActivity,
    });
    mockServices();
    vi.spyOn(groupsService, 'listInvites').mockResolvedValue([
      { id: 'i1', label: 'Old', createdAt: '2026-01-01', createdByName: 'User B', usedCount: 0, status: 'Active' },
    ]);
    vi.spyOn(groupsManage, 'revokeInvite').mockRejectedValue({ status: 403, message: 'Không có quyền' });
    renderGroupRoutes('/groups/g1');

    expect(await screen.findByRole('heading', { name: 'Group One' })).toBeTruthy();
    expect(screen.getByText(/PRIVATE_ACTIVITY/)).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Thu hồi' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Xác nhận' }));
    expect(await screen.findByText('Không có quyền')).toBeTruthy();
    await waitFor(() => expect(vi.mocked(loadGroupWorkspace).mock.calls.length).toBeGreaterThan(1));
  });

  it('late invite result from a previous group does not leak into the new group', async () => {
    vi.mocked(loadGroupWorkspace).mockImplementation(async (id: string) => ({
      group: group(id, id === 'g1' ? 'Group One' : 'Group Two', 'Leader'),
      projects: [], progress: leaderProgress, activity: [],
    }));
    mockServices();
    const pending = deferred<InviteDto>();
    vi.spyOn(groupsService, 'createInvite').mockReturnValue(pending.promise);
    renderGroupRoutes('/groups/g1');

    expect(await screen.findByRole('heading', { name: 'Group One' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tạo mã mời' }));
    await screen.findByRole('dialog');
    fireEvent.submit(screen.getByLabelText('Nhãn (tuỳ chọn)').closest('form')!);
    fireEvent.click(screen.getByText('go-g2'));

    expect(await screen.findByRole('heading', { name: 'Group Two' })).toBeTruthy();
    await act(async () => {
      pending.resolve({ id: 'i1', code: 'OLDCODE', inviteLink: '/join/OLDCODE', usedCount: 0 });
      await pending.promise;
    });

    expect(screen.getByRole('heading', { name: 'Group Two' })).toBeTruthy();
    expect(screen.queryByText('OLDCODE')).toBeNull();
    expect(vi.mocked(loadGroupWorkspace).mock.calls).toEqual([['g1'], ['g2']]);
  });

  it('member sees no leader activity or progress sections', async () => {
    vi.mocked(loadGroupWorkspace).mockResolvedValue({
      group: group('g1', 'Group One', 'Member'), projects: [], progress: null, activity: [],
    });
    mockServices();
    renderGroupRoutes('/groups/g1');

    expect(await screen.findByRole('heading', { name: 'Group One' })).toBeTruthy();
    expect(screen.queryByText('Hoạt động gần đây')).toBeNull();
    expect(screen.queryByText(/Tiến độ thành viên/)).toBeNull();
    expect(screen.queryByText('Mã mời')).toBeNull();
  });
});

describe('GroupDetail M3 — member table & settings button', () => {
  it('leader sees member table with links and risk counts + settings button', async () => {
    vi.mocked(loadGroupWorkspace).mockResolvedValue({
      group: group('g1', 'Group One', 'Leader'), projects: [], activity: [],
      progress: {
        groupId: 'g1', totalTasks: 4, completedTasks: 1, percentComplete: 25, unassignedTasks: 0,
        members: [
          { userId: 'u-b', displayName: 'User B', total: 3, inProgress: 2, submitted: 0, completed: 1, changesRequested: 0, overdue: 1, isActiveMember: true, atRisk: 1 },
          { userId: 'u-x', displayName: 'Gone User', total: 1, inProgress: 0, submitted: 0, completed: 0, changesRequested: 1, overdue: 0, isActiveMember: false, atRisk: 0 },
        ],
      },
    });
    mockServices();
    renderGroupRoutes('/groups/g1');
    fireEvent.click(await screen.findByRole('button', { name: 'Thêm' }));
    expect(screen.getByRole('menuitem', { name: 'Cài đặt cảnh báo' })).toBeTruthy();
    const link = screen.getByRole('link', { name: 'User B' });
    expect(link.getAttribute('href')).toBe('/groups/g1/members/u-b');
    expect(screen.getByText('(đã rời nhóm)')).toBeTruthy();
    expect(screen.getByText('1/3')).toBeTruthy(); // x/y hoàn thành
    expect(screen.getAllByRole('img', { name: /Tiến độ công việc/ })).toHaveLength(2); // StatusBar sm per member
    // member sees neither menu items nor table
    cleanup();
    vi.mocked(loadGroupWorkspace).mockResolvedValue({
      group: group('g1', 'Group One', 'Member'), projects: [], progress: null, activity: [],
    });
    renderGroupRoutes('/groups/g1');
    await screen.findByRole('heading', { name: 'Group One' });
    expect(screen.queryByRole('button', { name: 'Thêm' })).toBeNull();
    expect(screen.queryByText('Tiến độ thành viên')).toBeNull();
  });
});

describe('GroupDetail M3 — settings save refetches member table', () => {
  it('saving the dialog reloads the workspace (member table)', async () => {
    vi.mocked(loadGroupWorkspace).mockResolvedValue({
      group: group('g1', 'Group One', 'Leader'), projects: [], activity: [],
      progress: {
        groupId: 'g1', totalTasks: 2, completedTasks: 1, percentComplete: 50, unassignedTasks: 0,
        members: [{ userId: 'u-b', displayName: 'User B', total: 2, inProgress: 1, submitted: 0, completed: 1, changesRequested: 0, overdue: 0, isActiveMember: true, atRisk: 0 }],
      },
    });
    mockServices();
    vi.spyOn(groupsService, 'getSettings').mockResolvedValue({
      riskHoursBeforeDeadline: 8, riskProgressBelowPercent: 70, staleAfterHours: 24,
      updatedAt: null, updatedByName: null, isDefault: true,
    });
    vi.spyOn(groupsService, 'updateSettings').mockResolvedValue({
      riskHoursBeforeDeadline: 8, riskProgressBelowPercent: 70, staleAfterHours: 24,
      updatedAt: '2026-11-20T00:00:00Z', updatedByName: 'User B', isDefault: false,
    });
    renderGroupRoutes('/groups/g1');
    const callsBefore = vi.mocked(loadGroupWorkspace).mock.calls.length;
    fireEvent.click(await screen.findByRole('button', { name: 'Thêm' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cài đặt cảnh báo' }));
    await screen.findByLabelText(/Cảnh báo trước hạn/);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await screen.findByText('Đã lưu cài đặt cảnh báo.');
    await waitFor(() => expect(vi.mocked(loadGroupWorkspace).mock.calls.length).toBeGreaterThan(callsBefore));
  });
});
