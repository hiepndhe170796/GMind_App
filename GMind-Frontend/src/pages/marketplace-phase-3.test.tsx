// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Marketplace from './Marketplace';
import { marketplaceService, type MarketplaceDto } from '../services/marketplace';
import { groupsService, type GroupDetailDto } from '../services/groups';
import { projectsService, type ProjectDto } from '../services/projects';
import { tasksService, type TaskSummaryDto } from '../services/tasks';
import { clearSession } from '../services/session';

vi.mock('../layouts/MainLayout', () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('../services/auth', () => ({
  authService: { isLoggedIn: () => true, currentUser: () => ({ id: 'u-m', displayName: 'Member', email: 'm@x.dev' }) },
}));

const req = (id: string, over: Partial<MarketplaceDto> = {}): MarketplaceDto => ({
  id, requestType: 'NeedHelp', status: 'Pending', taskTitle: 'Task A', taskId: 't-a',
  requestedByName: 'Member', reason: 'help me', createdAt: '2026-01-01T00:00:00Z',
  requestedByUserId: 'u-m', ...over,
});
const task = (id: string, uid: string, over: Partial<TaskSummaryDto> = {}): TaskSummaryDto => ({
  id, projectId: 'p1', parentTaskId: null, title: `Task ${id}`, assigneeUserId: uid, assigneeName: uid,
  status: 'InProgress', priority: 'Medium', deadlineAt: null, canViewDetails: false, ...over,
});
const group = (role = 'Member'): GroupDetailDto => ({
  id: 'g1', name: 'Nhóm A', memberCount: 2, myRole: role, createdAt: '',
  members: [
    { userId: 'u-m', displayName: 'Same Name', role: 'Member', joinedAt: '' },
    { userId: 'u-x', displayName: 'Same Name', role: 'Member', joinedAt: '' },
    { userId: 'u-l', displayName: 'Leader', role: 'Leader', joinedAt: '' },
  ],
});
const proj: ProjectDto = { id: 'p1', groupId: 'g1', name: 'Web', status: 'InProgress', taskCount: 2, completedCount: 0, createdAt: '' };
const setup = (role = 'Member', reqs: MarketplaceDto[] = [req('r1')]) => {
  vi.spyOn(groupsService, 'get').mockResolvedValue(group(role));
  vi.spyOn(marketplaceService, 'list').mockResolvedValue(reqs);
  vi.spyOn(projectsService, 'list').mockResolvedValue([proj]);
  vi.spyOn(tasksService, 'list').mockResolvedValue([task('t-a', 'u-m'), task('t-x', 'u-x')]);
};
const deferred = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
const renderAt = () => render(
  <MemoryRouter initialEntries={['/groups/g1/marketplace']}><Routes><Route path="/groups/:groupId/marketplace" element={<Marketplace />} /></Routes></MemoryRouter>);

// jsdom lacks dialog.showModal/close
if (typeof HTMLDialogElement !== 'undefined') {
  (HTMLDialogElement.prototype).showModal ??= function () { this.setAttribute('open', ''); };
  (HTMLDialogElement.prototype).close ??= function () { this.removeAttribute('open'); };
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); clearSession(); });
const openForm = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Tạo yêu cầu' }));
};

describe('Marketplace', () => {
  it('Swap requires exact pair; target change clears related task; valid sends both IDs', async () => {
    setup('Member');
    const create = vi.spyOn(marketplaceService, 'create').mockResolvedValue(req('r9'));
    renderAt();
    await openForm();
    fireEvent.change(screen.getByLabelText('Loại yêu cầu'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Công việc của bạn'), { target: { value: 't-a' } });
    fireEvent.change(screen.getByLabelText('Thành viên nhận'), { target: { value: 'u-x' } });
    fireEvent.change(screen.getByLabelText(/Công việc của thành viên/), { target: { value: 't-x' } });
    fireEvent.change(screen.getByLabelText('Thành viên nhận'), { target: { value: 'u-l' } });
    // related cleared by target change
    fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: 'swap pls' } });
    fireEvent.submit(screen.getByLabelText('Lý do').closest('form')!);
    expect(create).not.toHaveBeenCalled();
    expect(screen.getByText('Chọn công việc của thành viên để đổi.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Công việc của thành viên/), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Thành viên nhận'), { target: { value: 'u-x' } });
    fireEvent.change(screen.getByLabelText(/Công việc của thành viên/), { target: { value: 't-x' } });
    fireEvent.submit(screen.getByLabelText('Lý do').closest('form')!);
    await waitFor(() => expect(create).toHaveBeenCalledWith('g1', expect.objectContaining({ requestType: 3, taskId: 't-a', targetUserId: 'u-x', relatedTaskId: 't-x' })));
  });

  it('ownership by userId not name: identical display names still show only own cancel', async () => {
    setup('Member', [req('r1'), req('r2', { requestedByUserId: 'u-x' })]);
    renderAt();
    await screen.findAllByText('Task A');
    const cancels = screen.getAllByRole('button', { name: 'Hủy yêu cầu' });
    expect(cancels.length).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Của tôi' }));
    await waitFor(() => expect(screen.getAllByText('Task A').length).toBe(1));
  });

  it('reject blank note makes no POST; double-click posts once; POST500 keeps draft', async () => {
    setup('Leader');
    const d = deferred<MarketplaceDto>();
    const rej = vi.spyOn(marketplaceService, 'reject').mockReturnValue(d.promise);
    renderAt();
    fireEvent.click(await screen.findByRole('button', { name: 'Từ chối' }));
    // blank
    const confirm = () => screen.getAllByRole('button', { name: 'Từ chối' }).find(b => b.closest('dialog'))!;
    fireEvent.click(confirm());
    expect(rej).not.toHaveBeenCalled();
    expect(screen.getByText('Nhập lý do từ chối.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Lý do từ chối'), { target: { value: 'no' } });
    const btn = confirm();
    fireEvent.click(btn); fireEvent.click(btn);
    expect(rej).toHaveBeenCalledTimes(1);
    await act(async () => { d.resolve(req('r1', { status: 'Rejected' })); });
  });

  it('POST success + GET500 shows save+refresh; retry only calls GET', async () => {
    setup('Member');
    const cancel = vi.spyOn(marketplaceService, 'cancel').mockResolvedValue({});
    vi.spyOn(marketplaceService, 'list')
      .mockResolvedValueOnce([req('r1')])
      .mockRejectedValueOnce({ status: 500, message: 'get fail' })
      .mockResolvedValue([]);
    renderAt();
    fireEvent.click(await screen.findByRole('button', { name: 'Hủy yêu cầu' }));
    const btns = screen.getAllByRole('button', { name: 'Hủy yêu cầu' });
    fireEvent.click(btns[btns.length - 1]);
    await waitFor(() => expect(cancel).toHaveBeenCalledWith('r1'));
    expect(await screen.findByRole('button', { name: 'Tải lại' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại' }));
    await waitFor(() => expect(vi.mocked(marketplaceService.list).mock.calls.length).toBe(3));
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('403 on write clears list and drafts', async () => {
    setup('Member');
    vi.spyOn(marketplaceService, 'cancel').mockRejectedValue({ status: 403, message: 'Mất quyền' });
    renderAt();
    fireEvent.click(await screen.findByRole('button', { name: 'Hủy yêu cầu' }));
    const btns = screen.getAllByRole('button', { name: 'Hủy yêu cầu' });
    fireEvent.click(btns[btns.length - 1]);
    await screen.findByRole('alert');
    expect(screen.queryByText('Task A')).toBeNull();
    expect(document.querySelector('dialog')?.open).toBeFalsy();
  });

  it('unmount before scheduled fetch issues no request', async () => {
    const get = vi.spyOn(groupsService, 'get').mockClear();
    const { unmount } = renderAt();
    unmount();
    await act(async () => { await Promise.resolve(); });
    expect(get).not.toHaveBeenCalled();
  });
});

describe('Round2 regressions', () => {
  it('approve upserts DTO so Pending actions disappear even after GET 500', async () => {
    setup('Leader');
    vi.spyOn(marketplaceService, 'approve').mockResolvedValue(req('r1', { status: 'Approved' }));
    vi.spyOn(marketplaceService, 'list')
      .mockResolvedValueOnce([req('r1')])
      .mockRejectedValue({ status: 500, message: 'get fail' });
    renderAt();
    fireEvent.click(await screen.findByRole('button', { name: 'Duyệt' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Duyệt' }).find(b => b.closest('dialog'))!);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Duyệt' })).toBeNull());
    expect(await screen.findByRole('button', { name: 'Tải lại' })).toBeTruthy();
  });

  it('page clamps when last item on page 2 cancelled', async () => {
    const nine = Array.from({ length: 9 }, (_, i) => req(`r${i}`, { taskTitle: `T${i}` }));
    setup('Member', nine);
    const cancel = vi.spyOn(marketplaceService, 'cancel').mockResolvedValue({});
    vi.spyOn(marketplaceService, 'list')
      .mockResolvedValueOnce(nine)
      .mockResolvedValue(nine.slice(1));
    renderAt();
    await screen.findByText('T0');
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    expect(screen.getByText('Trang 2 / 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Hủy yêu cầu' }));
    const btns = screen.getAllByRole('button', { name: 'Hủy yêu cầu' });
    fireEvent.click(btns[btns.length - 1]);
    await waitFor(() => expect(cancel).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Trang sau' })).toBeNull());
  });
});

it('reject POST success then GET500 upserts Rejected row and hides Pending actions', async () => {
  setup('Leader');
  vi.spyOn(marketplaceService, 'reject').mockResolvedValue(req('r1', { status: 'Rejected', reviewComment: 'no' }));
  vi.spyOn(marketplaceService, 'list')
    .mockResolvedValueOnce([req('r1')])
    .mockRejectedValue({ status: 500, message: 'get fail' });
  renderAt();
  fireEvent.click(await screen.findByRole('button', { name: 'Từ chối' }));
  fireEvent.change(screen.getByLabelText('Lý do từ chối'), { target: { value: 'no' } });
  fireEvent.click(screen.getAllByRole('button', { name: 'Từ chối' }).find(b => b.closest('dialog'))!);
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Duyệt' })).toBeNull());
  expect(await screen.findByText(/Nhận xét: no/)).toBeTruthy(); // upserted Rejected DTO
  expect(await screen.findByRole('button', { name: 'Tải lại' })).toBeTruthy();
});
