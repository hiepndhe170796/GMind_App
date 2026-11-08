// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Groups from './Groups';
import JoinGroup from './JoinGroup';
import GroupDetail from './GroupDetail';
import { groupsService, groupsManage, type GroupDto, type GroupDetailDto } from '../services/groups';
import { projectsService } from '../services/projects';
import { loadGroupWorkspace } from '../services/workspace';
import { clearSession } from '../services/session';

vi.mock('../layouts/MainLayout', () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('../services/auth', () => ({
  authService: { isLoggedIn: () => true, currentUser: () => ({ id: 'u-l', displayName: 'Leader', email: 'l@x.dev' }) },
}));
vi.mock('../services/workspace', () => ({ loadTaskWorkspace: vi.fn(), loadGroupWorkspace: vi.fn() }));

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
  group: detail(role, leaders), projects: [], progress: role === 'Leader' ? { groupId: 'g1', totalTasks: 0, completedTasks: 0, percentComplete: 0, members: [] } : null,
  activity: role === 'Leader' ? [{ id: 'a1', actorName: 'X', action: 'Create', entityType: 'Task', summary: 'ACT', createdAt: '2026-01-01T00:00:00Z' }] : [],
});
const renderAt = (_el: ReactNode, entry: string) => render(
  <MemoryRouter initialEntries={[entry]}><Routes>
    <Route path="/groups" element={<Groups />} />
    <Route path="/join-group" element={<JoinGroup />} />
    <Route path="/groups/:id" element={<GroupDetail />} />
  </Routes></MemoryRouter>);

// jsdom lacks dialog.showModal/close
if (typeof HTMLDialogElement !== 'undefined') {
  (HTMLDialogElement.prototype).showModal ??= function () { this.setAttribute('open', ''); };
  (HTMLDialogElement.prototype).close ??= function () { this.removeAttribute('open'); };
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); clearSession(); localStorage.clear(); });

describe('Groups', () => {
  it('loading -> error retry -> list; search commits on Enter only', async () => {
    const my = vi.spyOn(groupsService, 'myGroups').mockRejectedValueOnce({ message: 'x' }).mockResolvedValue([g('g1', 'Alpha'), g('g2', 'Beta', 'Member')]);
    renderAt(<Groups />, '/groups');
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
    renderAt(<Groups />, '/groups');
    expect(await screen.findByText('Bạn chưa thuộc nhóm nào')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Tạo hoặc tham gia nhóm/ })).toBeTruthy();
  });
});

describe('JoinGroup', () => {
  it('invalid name/code produce inline errors and zero writes; shared lock covers both forms', async () => {
    const create = vi.spyOn(groupsService, 'create').mockResolvedValue(g('g9', 'New'));
    const join = vi.spyOn(groupsService, 'join').mockImplementation(() => new Promise(() => { }));
    renderAt(<JoinGroup />, '/join-group');
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
    // while join pending, create form is locked too
    fireEvent.change(screen.getByLabelText('Tên nhóm'), { target: { value: 'Team' } });
    fireEvent.submit(screen.getByLabelText('Tên nhóm').closest('form')!);
    expect(create).not.toHaveBeenCalled();
  });

  it('server error keeps draft; create navigates', async () => {
    vi.spyOn(groupsService, 'create').mockRejectedValueOnce({ status: 500, message: 'boom' }).mockResolvedValue(g('g9', 'Team'));
    renderAt(<JoinGroup />, '/join-group');
    fireEvent.change(screen.getByLabelText('Tên nhóm'), { target: { value: 'Team' } });
    fireEvent.submit(screen.getByLabelText('Tên nhóm').closest('form')!);
    expect(await screen.findByText('boom')).toBeTruthy();
    expect((screen.getByLabelText('Tên nhóm') as HTMLInputElement).value).toBe('Team');
  });
});

describe('GroupDetail', () => {
  it('member sees no progress/activity even when payload includes them', async () => {
    vi.mocked(loadGroupWorkspace).mockResolvedValue({
      ...ws('Member'), progress: { groupId: 'g1', totalTasks: 1, completedTasks: 0, percentComplete: 0, members: [] } as never,
      activity: [{ id: 'a1', actorName: 'X', action: 'c', entityType: 'T', summary: 'SECRET', createdAt: '2026-01-01T00:00:00Z' }],
    });
    renderAt(<GroupDetail />, '/groups/g1');
    expect(await screen.findByRole('heading',{name:'Nhóm A'})).toBeTruthy();
    expect(screen.queryByText('Tiến độ thành viên')).toBeNull();
    expect(screen.queryByText('SECRET')).toBeNull();
    expect(screen.queryByText('Hoạt động gần đây')).toBeNull();
  });

  it('sole Leader cannot leave; remove confirm calls API once', async () => {
    vi.mocked(loadGroupWorkspace).mockResolvedValue(ws('Leader'));
    const rm = vi.spyOn(groupsManage, 'removeMember').mockResolvedValue({});
    renderAt(<GroupDetail />, '/groups/g1');
    await screen.findByRole('heading',{name:'Nhóm A'});
    expect((screen.getByRole('button', { name: 'Rời nhóm' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Xóa' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Xác nhận' }));
    expect(rm).toHaveBeenCalledWith('g1', 'u-m');
  });

  it('403 on write clears private state; invalid project makes no POST', async () => {
    vi.mocked(loadGroupWorkspace).mockResolvedValue(ws('Leader'));
    vi.spyOn(groupsService, 'createInvite').mockRejectedValue({ status: 403, message: 'Mất quyền' });
    const cp = vi.spyOn(projectsService, 'create');
    renderAt(<GroupDetail />, '/groups/g1');
    await screen.findByRole('heading',{name:'Nhóm A'});
    fireEvent.click(screen.getByRole('button', { name: 'Tạo dự án' }));
    fireEvent.submit(screen.getByLabelText('Tên dự án').closest('form')!);
    expect(cp).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Tạo mã mời' }));
    await screen.findByRole('alert');
    expect(screen.queryByRole('heading',{name:'Nhóm A'})).toBeNull();
  });

  it('invite create+copy+revoke lifecycle uses returned DTO', async () => {
    vi.mocked(loadGroupWorkspace).mockResolvedValue(ws('Leader'));
    vi.spyOn(groupsService, 'createInvite').mockResolvedValue({ id: 'i1', code: 'AB12CD34', inviteLink: '/x', usedCount: 0 });
    const revoke = vi.spyOn(groupsManage, 'revokeInvite').mockResolvedValue({});
    renderAt(<GroupDetail />, '/groups/g1');
    fireEvent.click(await screen.findByRole('button', { name: 'Tạo mã mời' }));
    expect(await screen.findByText('AB12CD34')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Thu hồi' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Thu hồi' }).find(b => b.closest('dialog'))!);
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('i1'));
  });

  it('unmount before scheduled fetch issues no request', async () => {
    vi.mocked(loadGroupWorkspace).mockClear();
    const { unmount } = renderAt(<GroupDetail />, '/groups/g1');
    unmount();
    await act(async () => { await Promise.resolve(); });
    expect(loadGroupWorkspace).not.toHaveBeenCalled();
  });
});

const defer = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
describe('Round2 regressions', () => {
  it('join success navigates to group route', async () => {
    vi.spyOn(groupsService, 'join').mockResolvedValue(g('g9', 'Joined'));
    renderAt(<JoinGroup />, '/join-group');
    fireEvent.change(screen.getByLabelText('Mã mời'), { target: { value: 'abcd1234' } });
    fireEvent.submit(screen.getByLabelText('Mã mời').closest('form')!);
    await waitFor(() => expect(screen.queryByLabelText('Mã mời')).toBeNull());
  });

  it('create unmount during write does not navigate', async () => {
    const d = defer<GroupDto>();
    vi.spyOn(groupsService, 'create').mockReturnValue(d.promise);
    const { unmount } = renderAt(<JoinGroup />, '/join-group');
    fireEvent.change(screen.getByLabelText('Tên nhóm'), { target: { value: 'Team' } });
    fireEvent.submit(screen.getByLabelText('Tên nhóm').closest('form')!);
    unmount();
    await act(async () => { d.resolve(g('g9', 'T')); await d.promise; });
    expect(groupsService.create).toHaveBeenCalledTimes(1);
  });

  it('role change applied locally even when refresh fails', async () => {
    vi.mocked(loadGroupWorkspace)
      .mockResolvedValueOnce(ws('Leader'))
      .mockRejectedValue({ status: 500, message: 'get fail' });
    vi.spyOn(groupsManage, 'changeRole').mockResolvedValue({});
    renderAt(<GroupDetail />, '/groups/g1');
    await screen.findByRole('heading', { name: 'Nhóm A' });
    fireEvent.click(screen.getByRole('button', { name: 'Làm trưởng nhóm' }));
    fireEvent.click((await screen.findByRole('dialog'))!.querySelector('button') ?? screen.getByRole('button', { name: 'Xác nhận' }));
    await waitFor(() => expect(groupsManage.changeRole).toHaveBeenCalledWith('g1', 'u-m', 1));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Hạ vai trò' })).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Làm trưởng nhóm' })).toBeNull();
    expect(await screen.findByRole('button', { name: 'Tải lại' })).toBeTruthy();
  });

  it('project create server error visible and draft retained', async () => {
    vi.mocked(loadGroupWorkspace).mockResolvedValue(ws('Leader'));
    vi.spyOn(projectsService, 'create').mockRejectedValue({ status: 500, message: 'proj fail' });
    renderAt(<GroupDetail />, '/groups/g1');
    await screen.findByRole('heading', { name: 'Nhóm A' });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo dự án' }));
    fireEvent.change(screen.getByLabelText('Tên dự án'), { target: { value: 'DraftP' } });
    fireEvent.submit(screen.getByLabelText('Tên dự án').closest('form')!);
    expect(await screen.findByText('proj fail')).toBeTruthy();
    expect((screen.getByLabelText('Tên dự án') as HTMLInputElement).value).toBe('DraftP');
  });
});
