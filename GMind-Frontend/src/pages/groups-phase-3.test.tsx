// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Groups from './Groups';
import JoinGroup from './JoinGroup';
import GroupDetail from './GroupDetail';
import { groupsService, groupsManage, type GroupDto, type GroupDetailDto } from '../services/groups';
import { projectsService, projectsManage } from '../services/projects';
import { loadGroupWorkspace } from '../services/workspace';
import { ToastProvider } from '../components/ui/Toast';
import { clearSession } from '../services/session';

vi.mock('../layouts/MainLayout', () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('../services/auth', () => ({
  authService: { isLoggedIn: () => true, currentUser: () => ({ id: 'u-l', displayName: 'Leader', email: 'l@x.dev' }) },
}));
vi.mock('../services/workspace', () => ({ loadTaskWorkspace: vi.fn(), loadGroupWorkspace: vi.fn() }));
vi.mock('../hooks/use-current-user-id', () => ({ useCurrentUserId: () => 'u-l' }));

const g = (id: string, name: string, role = 'Leader', memberCount = 2): GroupDto => ({ id, name, memberCount, myRole: role, createdAt: '2026-01-01T00:00:00Z' });
const detail = (role = 'Leader', leaders = 1): GroupDetailDto => ({
  id: 'g1', name: 'Nhóm A', memberCount: 2, myRole: role, createdAt: '2026-01-01T00:00:00Z',
  members: [
    { userId: 'u-l', displayName: 'Leader', role: 'Leader', joinedAt: '2026-01-01' },
    { userId: 'u-m', displayName: 'Member One', role: 'Member', joinedAt: '2026-01-01' },
    ...(leaders > 1 ? [{ userId: 'u-l2', displayName: 'Leader Two', role: 'Leader', joinedAt: '2026-01-01' }] : []),
  ],
});
const ws = (role = 'Leader', leaders = 1) => ({
  group: detail(role, leaders), projects: [], progress: role === 'Leader' ? { groupId: 'g1', totalTasks: 0, completedTasks: 0, percentComplete: 0, unassignedTasks: 0, members: [] } : null,
  activity: role === 'Leader' ? [{ id: 'a1', actorName: 'X', action: 'Create', entityType: 'Task', summary: 'ACT', createdAt: '2026-01-01T00:00:00Z' }] : [],
});

const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const renderAt = (entry: string) => render(
  <QueryClientProvider client={qc()}><ToastProvider>
    <MemoryRouter initialEntries={[entry]}><Routes>
      <Route path="/groups" element={<Groups />} />
      <Route path="/join-group" element={<JoinGroup />} />
      <Route path="/join/:code" element={<JoinGroup />} />
      <Route path="/groups/:id" element={<GroupDetail />} />
      <Route path="/groups/:groupId/members/:userId" element={<div>member-page</div>} />
    </Routes></MemoryRouter>
  </ToastProvider></QueryClientProvider>);

// jsdom lacks dialog.showModal/close
if (typeof HTMLDialogElement !== 'undefined') {
  (HTMLDialogElement.prototype).showModal ??= function () { this.setAttribute('open', ''); };
  (HTMLDialogElement.prototype).close ??= function () { this.removeAttribute('open'); };
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); clearSession(); localStorage.clear(); });

const setupGroup = (w: object = ws()) => {
  vi.mocked(loadGroupWorkspace).mockResolvedValue(w as never);
  vi.spyOn(groupsService, 'listInvites').mockResolvedValue([]);
  vi.spyOn(projectsManage, 'archived').mockResolvedValue([]);
};

describe('Groups', () => {
  it('loading -> error retry -> list; search commits on Enter only', async () => {
    const my = vi.spyOn(groupsService, 'myGroups').mockRejectedValueOnce({ message: 'x' }).mockResolvedValue([g('g1', 'Alpha'), g('g2', 'Beta', 'Member')]);
    vi.spyOn(groupsService, 'archivedGroups').mockResolvedValue([]);
    renderAt('/groups');
    expect(await screen.findByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Alpha')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Tìm nhóm'), { target: { value: 'alp' } });
    expect(screen.getByText('Beta')).toBeTruthy(); // typing doesn't filter until submit
    fireEvent.submit(screen.getByRole('search'));
    await waitFor(() => expect(screen.queryByText('Beta')).toBeNull());
    expect(screen.getByText('1 nhóm')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Vai trò'), { target: { value: 'Member' } });
    await waitFor(() => expect(screen.getByText('Không có nhóm khớp bộ lọc')).toBeTruthy());
    expect(my).toHaveBeenCalledTimes(2);
  });

  it('empty list shows create/join CTA distinct from filtered empty', async () => {
    vi.spyOn(groupsService, 'myGroups').mockResolvedValue([]);
    vi.spyOn(groupsService, 'archivedGroups').mockResolvedValue([]);
    renderAt('/groups');
    expect(await screen.findByText('Bạn chưa thuộc nhóm nào')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Tạo hoặc tham gia nhóm/ })).toBeTruthy();
  });

  it('archived section lists groups and restore calls the API', async () => {
    vi.spyOn(groupsService, 'myGroups').mockResolvedValue([g('g1', 'Alpha')]);
    vi.spyOn(groupsService, 'archivedGroups').mockResolvedValue([
      { id: 'g9', name: 'Nhóm Cũ', archivedAt: '2026-11-01T00:00:00Z', archivedByName: 'Leader', myRole: 'Leader', memberCount: 3, projectCount: 1, canRestore: true },
      { id: 'g8', name: 'Nhóm Khác', archivedAt: '2026-11-02T00:00:00', myRole: 'Member', memberCount: 2, projectCount: 0, canRestore: false },
    ]);
    const restore = vi.spyOn(groupsService, 'restoreGroup').mockResolvedValue(undefined);
    renderAt('/groups');
    expect(await screen.findByText('Nhóm đã lưu trữ (2)')).toBeTruthy();
    expect(screen.getByText(/Lưu trữ 01\/11\/2026 bởi Leader · 3 thành viên · 1 dự án/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Khôi phục' })).toHaveLength(1); // only canRestore rows
    fireEvent.click(screen.getByRole('button', { name: 'Khôi phục' }));
    fireEvent.click((await screen.findByRole('dialog')).querySelector('button')!);
    await waitFor(() => expect(restore).toHaveBeenCalledWith('g9'));
    expect(await screen.findByText('Đã khôi phục nhóm.')).toBeTruthy();
  });
});

describe('JoinGroup', () => {
  it('invalid name/code produce inline errors and zero writes; shared lock covers both forms', async () => {
    const create = vi.spyOn(groupsService, 'create').mockResolvedValue(g('g9', 'New'));
    const join = vi.spyOn(groupsService, 'join').mockImplementation(() => new Promise(() => { }));
    renderAt('/join-group');
    fireEvent.submit(screen.getByLabelText('Tên nhóm').closest('form')!);
    expect(create).not.toHaveBeenCalled();
    expect(screen.getByText('Nhập tên nhóm.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Mã mời'), { target: { value: 'ab-1' } });
    fireEvent.submit(screen.getByLabelText('Mã mời').closest('form')!);
    expect(join).not.toHaveBeenCalled();
    expect(screen.getByText(/đúng 8 ký tự/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Mã mời'), { target: { value: 'abcd1234' } });
    fireEvent.submit(screen.getByLabelText('Mã mời').closest('form')!);
    expect(join).toHaveBeenCalledWith('ABCD1234');
    fireEvent.change(screen.getByLabelText('Tên nhóm'), { target: { value: 'Team' } });
    fireEvent.submit(screen.getByLabelText('Tên nhóm').closest('form')!);
    expect(create).not.toHaveBeenCalled();
  });

  it('/join/:code prefills the code', async () => {
    renderAt('/join/abcd1234');
    await waitFor(() => expect((screen.getByLabelText('Mã mời') as HTMLInputElement).value).toBe('ABCD1234'));
  });

  it('/join/:code puts the join card first with a primary button; create-group inside a disclosure', async () => {
    renderAt('/join/abcd1234');
    await waitFor(() => expect((screen.getByLabelText('Mã mời') as HTMLInputElement).value).toBe('ABCD1234'));
    const joinBtn = screen.getByRole('button', { name: 'Tham gia nhóm' });
    expect(joinBtn).toBeTruthy();
    // join card renders before the collapsed create-group disclosure
    const disclosure = screen.getByText('Hoặc tạo nhóm mới').closest('summary');
    expect(disclosure).toBeTruthy();
    expect(joinBtn.compareDocumentPosition(disclosure!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.activeElement === joinBtn).toBe(true);
  });

  it('server error keeps draft; create navigates', async () => {
    vi.spyOn(groupsService, 'create').mockRejectedValueOnce({ status: 500, message: 'boom' }).mockResolvedValue(g('g9', 'Team'));
    renderAt('/join-group');
    fireEvent.change(screen.getByLabelText('Tên nhóm'), { target: { value: 'Team' } });
    fireEvent.submit(screen.getByLabelText('Tên nhóm').closest('form')!);
    expect(await screen.findByText('boom')).toBeTruthy();
    expect((screen.getByLabelText('Tên nhóm') as HTMLInputElement).value).toBe('Team');
  });
});

describe('GroupDetail', () => {
  it('member sees no progress/activity even when payload includes them', async () => {
    setupGroup({
      ...ws('Member'), progress: { groupId: 'g1', totalTasks: 1, completedTasks: 0, percentComplete: 0, members: [] } as never,
      activity: [{ id: 'a1', actorName: 'X', action: 'c', entityType: 'T', summary: 'SECRET', createdAt: '2026-01-01T00:00:00Z' }],
    });
    renderAt('/groups/g1');
    expect(await screen.findByRole('heading', { name: 'Nhóm A' })).toBeTruthy();
    expect(screen.queryByText('Tiến độ thành viên')).toBeNull();
    expect(screen.queryByText('SECRET')).toBeNull();
    expect(screen.queryByText('Hoạt động gần đây')).toBeNull();
    // member menu only offers Rời nhóm
    fireEvent.click(screen.getByRole('button', { name: 'Tùy chọn' }));
    expect(screen.getAllByRole('menuitem')).toHaveLength(1);
    expect(screen.queryByText('Mã mời')).toBeNull();
  });

  it('sole Leader cannot leave; member row menu remove calls API once', async () => {
    setupGroup();
    const rm = vi.spyOn(groupsManage, 'removeMember').mockResolvedValue({});
    renderAt('/groups/g1');
    await screen.findByRole('heading', { name: 'Nhóm A' });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));
    const leave = screen.getAllByRole('menuitem').find(i => i.textContent?.startsWith('Rời nhóm'))!;
    expect(leave.getAttribute('aria-disabled')).toBe('true');
    fireEvent.keyDown(leave.closest('[role=menu]')!, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Thao tác với Member One' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Xóa khỏi nhóm' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Xác nhận' }));
    await waitFor(() => expect(rm).toHaveBeenCalledWith('g1', 'u-m'));
    expect(await screen.findByText('Đã xóa thành viên.')).toBeTruthy();
  });

  it('invalid project makes no POST; server error keeps draft', async () => {
    setupGroup();
    const cp = vi.spyOn(projectsService, 'create').mockRejectedValue({ status: 500, message: 'proj fail' });
    renderAt('/groups/g1');
    fireEvent.click(await screen.findByRole('button', { name: 'Tạo dự án' }));
    fireEvent.submit(screen.getByLabelText('Tên dự án').closest('form')!);
    expect(screen.getByText('Nhập tên dự án.')).toBeTruthy();
    expect(cp).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Tên dự án'), { target: { value: 'DraftP' } });
    fireEvent.submit(screen.getByLabelText('Tên dự án').closest('form')!);
    expect(await screen.findByText('proj fail')).toBeTruthy();
    expect((screen.getByLabelText('Tên dự án') as HTMLInputElement).value).toBe('DraftP');
  });

  it('403 on write shows error toast and refetches', async () => {
    setupGroup();
    vi.spyOn(groupsService, 'listInvites').mockResolvedValue([
      { id: 'i1', label: 'Lớp A', createdAt: '2026-01-01', createdByName: 'Leader', usedCount: 0, status: 'Active' },
    ]);
    vi.spyOn(groupsManage, 'revokeInvite').mockRejectedValue({ status: 403, message: 'Mất quyền' });
    renderAt('/groups/g1');
    await screen.findByRole('heading', { name: 'Nhóm A' });
    fireEvent.click(await screen.findByRole('button', { name: 'Thu hồi' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Xác nhận' }));
    expect(await screen.findByText('Mất quyền')).toBeTruthy();
    await waitFor(() => expect(vi.mocked(loadGroupWorkspace).mock.calls.length).toBeGreaterThan(1));
  });

  it('invite list renders flat — rows in a divide-y list, no nested card', async () => {
    setupGroup();
    vi.spyOn(groupsService, 'listInvites').mockResolvedValue([
      { id: 'i1', label: 'Lớp A', createdAt: '2026-01-01', createdByName: 'Leader', usedCount: 0, status: 'Active' },
    ]);
    renderAt('/groups/g1');
    const label = await screen.findByText('Lớp A');
    const li = label.closest('li')!;
    const ul = li.closest('ul')!;
    expect(ul.className).toContain('divide-y');
    // the row itself must not be a bordered card
    expect(li.className).not.toContain('rounded');
    expect(li.className).not.toContain('border ');
  });

  it('invite dialog: validation, create -> result view with code + link, revoke', async () => {
    setupGroup();
    const create = vi.spyOn(groupsService, 'createInvite').mockResolvedValue({ id: 'i1', code: 'AB12CD34', inviteLink: '/join/AB12CD34', usedCount: 0 });
    vi.spyOn(groupsService, 'listInvites').mockResolvedValue([
      { id: 'i1', label: 'Lớp A', createdAt: '2026-01-01', createdByName: 'Leader', usedCount: 0, status: 'Active' },
    ]);
    const revoke = vi.spyOn(groupsManage, 'revokeInvite').mockResolvedValue({});
    renderAt('/groups/g1');
    fireEvent.click(await screen.findByRole('button', { name: 'Tạo mã mời' }));
    fireEvent.change(screen.getByLabelText('Nhãn (tuỳ chọn)'), { target: { value: 'Lớp A' } });
    fireEvent.change(screen.getByLabelText('Hạn dùng'), { target: { value: '30d' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Giới hạn' }));
    fireEvent.change(screen.getByLabelText(/Số lượt/), { target: { value: '0' } });
    fireEvent.submit(screen.getByLabelText('Nhãn (tuỳ chọn)').closest('form')!);
    expect(screen.getByText('Số lượt từ 1 đến 500.')).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Số lượt/), { target: { value: '5' } });
    fireEvent.submit(screen.getByLabelText('Nhãn (tuỳ chọn)').closest('form')!);
    await screen.findByText('AB12CD34');
    expect(create.mock.calls[0][1]).toMatchObject({ label: 'Lớp A', maxUses: 5 });
    expect(create.mock.calls[0][1]?.expiresAt).toBeTruthy();
    expect(screen.getByText(/\/join\/AB12CD34/)).toBeTruthy();
    expect(screen.getByText(/Mã chỉ hiển thị một lần/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    // list row + revoke
    fireEvent.click(await screen.findByRole('button', { name: 'Thu hồi' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Xác nhận' }));
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('i1'));
  });

  it('archive dialog is gated on the typed group name', async () => {
    setupGroup();
    const archive = vi.spyOn(groupsService, 'archiveGroup').mockResolvedValue(undefined);
    renderAt('/groups/g1');
    await screen.findByRole('heading', { name: 'Nhóm A' });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Lưu trữ nhóm' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Nhóm sẽ ẩn khỏi danh sách/)).toBeTruthy();
    const btn = within(dialog).getByRole('button', { name: 'Lưu trữ nhóm' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/Nhập tên nhóm/), { target: { value: 'Sai tên' } });
    expect(btn.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/Nhập tên nhóm/), { target: { value: 'Nhóm A' } });
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    await waitFor(() => expect(archive).toHaveBeenCalledWith('g1', 'Nhóm A'));
  });

  it('archived projects disclosure lists rows and leader can restore', async () => {
    setupGroup();
    vi.spyOn(projectsManage, 'archived').mockResolvedValue([
      { id: 'p9', name: 'Dự án Cũ', archivedAt: '2026-11-01T00:00:00Z', taskCount: 4, completedCount: 2, canRestore: true },
    ]);
    const restore = vi.spyOn(projectsManage, 'restore').mockResolvedValue({});
    renderAt('/groups/g1');
    await screen.findByRole('heading', { name: 'Nhóm A' });
    expect(screen.getByText('Dự án đã lưu trữ (1)')).toBeTruthy();
    expect(screen.getByText('Dự án Cũ')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Khôi phục' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Xác nhận' }));
    await waitFor(() => expect(restore).toHaveBeenCalledWith('p9'));
    expect(await screen.findByText('Đã khôi phục dự án.')).toBeTruthy();
  });

  it('recent activity shows 5 items and links to the full log', async () => {
    setupGroup({
      ...ws(), activity: Array.from({ length: 7 }, (_, i) => ({ id: `a${i}`, actorName: 'X', action: 'c', entityType: 'T', summary: `S${i}`, createdAt: '2026-01-01T00:00:00Z' })),
    });
    renderAt('/groups/g1');
    const link = await screen.findByRole('link', { name: 'Xem nhật ký đầy đủ' });
    expect(link.getAttribute('href')).toBe('/groups/g1/activity');
    expect(screen.queryByText('S5')).toBeNull(); // capped at 5
    expect(screen.getByText('S4')).toBeTruthy();
  });
});

const defer = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
describe('Round2 regressions', () => {
  it('join success navigates to group route', async () => {
    vi.spyOn(groupsService, 'join').mockResolvedValue(g('g9', 'Joined'));
    renderAt('/join-group');
    fireEvent.change(screen.getByLabelText('Mã mời'), { target: { value: 'abcd1234' } });
    fireEvent.submit(screen.getByLabelText('Mã mời').closest('form')!);
    await waitFor(() => expect(screen.queryByLabelText('Mã mời')).toBeNull());
  });

  it('create unmount during write does not navigate', async () => {
    const d = defer<GroupDto>();
    vi.spyOn(groupsService, 'create').mockReturnValue(d.promise);
    const { unmount } = renderAt('/join-group');
    fireEvent.change(screen.getByLabelText('Tên nhóm'), { target: { value: 'Team' } });
    fireEvent.submit(screen.getByLabelText('Tên nhóm').closest('form')!);
    unmount();
    await act(async () => { d.resolve(g('g9', 'T')); await d.promise; });
    expect(groupsService.create).toHaveBeenCalledTimes(1);
  });

  it('role change via member menu calls API and refetches', async () => {
    setupGroup();
    vi.spyOn(groupsManage, 'changeRole').mockResolvedValue({});
    renderAt('/groups/g1');
    await screen.findByRole('heading', { name: 'Nhóm A' });
    fireEvent.click(screen.getByRole('button', { name: 'Thao tác với Member One' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Làm trưởng nhóm' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Xác nhận' }));
    await waitFor(() => expect(groupsManage.changeRole).toHaveBeenCalledWith('g1', 'u-m', 1));
    await waitFor(() => expect(vi.mocked(loadGroupWorkspace).mock.calls.length).toBeGreaterThan(1));
  });
});

describe('M0 group progress', () => {
  it('Leader sees unassigned count, departed marker and split status counts', async () => {
    setupGroup({
      group: detail('Leader'), projects: [], activity: [],
      progress: {
        groupId: 'g1', totalTasks: 5, completedTasks: 1, percentComplete: 20, unassignedTasks: 2,
        members: [
          { userId: 'u-gone', displayName: 'Departed Member', total: 3, inProgress: 0, submitted: 0, completed: 1, changesRequested: 1, overdue: 1, atRisk: 0, isActiveMember: false },
          { userId: 'u-m', displayName: 'Member One', total: 2, inProgress: 1, submitted: 1, completed: 0, changesRequested: 0, overdue: 0, atRisk: 0, isActiveMember: true },
        ],
      },
    });
    renderAt('/groups/g1');
    await screen.findByText(/2 chưa giao/);
    const row = screen.getByRole('link', { name: 'Departed Member' }).closest('li')!;
    expect(within(row).getByText(/đã rời nhóm/)).toBeTruthy();
    const bar = within(row).getByRole('img', { name: /Tiến độ công việc/ });
    expect(bar.getAttribute('aria-label')).toContain('1 Cần chỉnh sửa');
    expect(bar.getAttribute('aria-label')).toContain('1 Hoàn thành');
    expect(within(row).getByText('1/3')).toBeTruthy();
  });
});
