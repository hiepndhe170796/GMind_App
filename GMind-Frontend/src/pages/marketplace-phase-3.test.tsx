// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Marketplace from './Marketplace';
import { marketplaceService, type MarketplaceDto } from '../services/marketplace';
import { groupsService, type GroupDetailDto } from '../services/groups';
import { dashboardService, type MyTaskDto } from '../services/dashboard';
import { ToastProvider } from '../components/ui/Toast';

vi.mock('../layouts/MainLayout', () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('../hooks/use-current-user-id', () => ({ useCurrentUserId: () => 'u-m' }));

const req = (id: string, over: Partial<MarketplaceDto> = {}): MarketplaceDto => ({
  id, requestType: 'NeedHelp', status: 'Pending', taskTitle: 'Task A', taskId: 't-a',
  requestedByName: 'Member M', reason: 'help me', createdAt: '2026-01-01T00:00:00Z',
  requestedByUserId: 'u-m', groupId: 'g1', groupName: 'Nhóm A', projectName: 'Web', ...over,
});
const group = (role = 'Member'): GroupDetailDto => ({
  id: 'g1', name: 'Nhóm A', memberCount: 3, myRole: role, createdAt: '',
  members: [
    { userId: 'u-m', displayName: 'Member M', role: 'Member', joinedAt: '' },
    { userId: 'u-x', displayName: 'Member X', role: 'Member', joinedAt: '' },
    { userId: 'u-l', displayName: 'Leader', role: 'Leader', joinedAt: '' },
  ],
});
const myTask = (id: string): MyTaskDto => ({
  id, projectId: 'p1', projectName: 'Web', title: `Mine ${id}`, status: 'InProgress', priority: 'Medium',
  groupId: 'g1', groupName: 'Nhóm A',
} as MyTaskDto);

const setup = (role = 'Member', reqs: MarketplaceDto[] = []) => {
  vi.spyOn(groupsService, 'get').mockResolvedValue(group(role));
  vi.spyOn(marketplaceService, 'list').mockResolvedValue(reqs);
  vi.spyOn(dashboardService, 'myTasks').mockResolvedValue([myTask('t-a')]);
  vi.spyOn(marketplaceService, 'swapCandidates').mockResolvedValue([
    { id: 't-x', title: 'Task X', projectName: 'Web', status: 'InProgress' },
  ]);
};
const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const renderAt = (entry = '/groups/g1/marketplace') => render(
  <QueryClientProvider client={qc()}><ToastProvider>
    <MemoryRouter initialEntries={[entry]}><Routes>
      <Route path="/groups/:groupId/marketplace" element={<Marketplace />} />
    </Routes></MemoryRouter>
  </ToastProvider></QueryClientProvider>);

if (typeof HTMLDialogElement !== 'undefined') {
  (HTMLDialogElement.prototype).showModal ??= function () { this.setAttribute('open', ''); };
  (HTMLDialogElement.prototype).close ??= function () { this.removeAttribute('open'); };
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('tabs', () => {
  it('counts + membership + default tab', async () => {
    setup('Leader', [
      req('r1', { status: 'Open', canClaim: true, requestedByUserId: 'u-x' }),
      req('r2', { status: 'Pending', canReview: true, requestedByUserId: 'u-x', targetUserId: 'u-x', targetName: 'Member X' }),
      req('r3', { status: 'Approved', requestedByUserId: 'u-m' }),
    ]);
    renderAt();
    await screen.findByRole('button', { name: /Cần bạn xử lý \(2\)/ });
    expect(screen.getByRole('button', { name: /Đang mở \(1\)/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Của tôi \(1\)/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Tất cả \(3\)/ })).toBeTruthy();
    // default tab = action → r1 and r2 visible, r3 hidden
    expect(screen.getAllByRole('link', { name: 'Task A' }).length).toBe(2);
  });
  it('defaults to Tất cả when nothing actionable', async () => {
    setup('Member', [req('r1', { status: 'Approved' })]);
    renderAt();
    await screen.findByRole('link', { name: 'Task A' });
  });
  it('tab syncs to ?tab=', async () => {
    setup('Member', [req('r1', { status: 'Open', requestedByUserId: 'u-x' })]);
    renderAt('/groups/g1/marketplace?tab=open');
    expect(await screen.findByRole('link', { name: 'Task A' })).toBeTruthy();
  });
});

describe('flag-driven actions', () => {
  it('renders only what flags allow + party caption', async () => {
    setup('Leader', [
      req('r1', { status: 'Pending', canReview: false, canReject: false, canCancel: false }),
      req('r2', { status: 'AwaitingRecipient', canRespond: true, targetName: 'Me', targetUserId: 'u-m' }),
    ]);
    renderAt();
    fireEvent.click(await screen.findByRole('button', { name: /Tất cả/ }));
    await screen.findByText('Cần Trưởng nhóm khác duyệt');
    expect(screen.queryByRole('button', { name: 'Duyệt' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Đồng ý' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Từ chối' }).length).toBe(1);
  });

  it('respond accept + decline dialog', async () => {
    setup('Member', [req('r1', { status: 'AwaitingRecipient', canRespond: true, targetUserId: 'u-m', targetName: 'Me' })]);
    const respond = vi.spyOn(marketplaceService, 'respond').mockResolvedValue(req('r1', { status: 'Pending' }));
    renderAt();
    fireEvent.click(await screen.findByRole('button', { name: 'Đồng ý' }));
    await waitFor(() => expect(respond).toHaveBeenCalledWith('r1', true));
    respond.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Từ chối' }));
    const dlg = await screen.findByRole('dialog');
    fireEvent.change(within(dlg).getByLabelText(/Bình luận/), { target: { value: 'busy' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Từ chối' }));
    await waitFor(() => expect(respond).toHaveBeenCalledWith('r1', false, 'busy'));
  });

  it('claim posts note; 409 shows toast and refetches', async () => {
    setup('Member', [req('r1', { status: 'Open', canClaim: true, requestedByUserId: 'u-x' })]);
    const claim = vi.spyOn(marketplaceService, 'claim')
      .mockRejectedValueOnce({ status: 409, message: 'Đã có người nhận' });
    const list = vi.mocked(marketplaceService.list);
    renderAt();
    fireEvent.click(await screen.findByRole('button', { name: 'Nhận việc' }));
    const dlg = await screen.findByRole('dialog');
    fireEvent.change(within(dlg).getByLabelText(/Bình luận/), { target: { value: 'pick me' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Nhận việc' }));
    await waitFor(() => expect(claim).toHaveBeenCalledWith('r1', 'pick me'));
    await screen.findByText('Đã có người nhận');
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  it('approve dialog states the effect; reject needs a reason; cancel confirms', async () => {
    setup('Leader', [
      req('r1', { status: 'Pending', canReview: true, canReject: true, requestType: 'Transfer', targetName: 'Member X' }),
      req('r2', { status: 'AwaitingRecipient', canCancel: true, taskTitle: 'Task B', taskId: 't-b' }),
    ]);
    const approve = vi.spyOn(marketplaceService, 'approve').mockResolvedValue(req('r1', { status: 'Approved' }));
    const reject = vi.spyOn(marketplaceService, 'reject').mockResolvedValue(req('r1', { status: 'Rejected' }));
    const cancel = vi.spyOn(marketplaceService, 'cancel').mockResolvedValue({} as never);
    renderAt();
    fireEvent.click(await screen.findByRole('button', { name: /Tất cả/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Duyệt' }));
    expect((await screen.findByRole('dialog')).textContent).toContain('sẽ chuyển cho Member X');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Duyệt' }));
    await waitFor(() => expect(approve).toHaveBeenCalledWith('r1', undefined));
    // reject without reason → no POST
    fireEvent.click(screen.getAllByRole('button', { name: 'Từ chối' })[0]);
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Từ chối' }));
    expect(reject).not.toHaveBeenCalled();
    await screen.findByText('Nhập lý do từ chối.');
    // cancel
    fireEvent.click(screen.getByRole('button', { name: 'Hủy yêu cầu' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Hủy yêu cầu' }));
    await waitFor(() => expect(cancel).toHaveBeenCalledWith('r2'));
  });

  it('stepper exposes progress via aria-label', async () => {
    setup('Member', [req('r1', { status: 'Pending' })]);
    renderAt();
    await screen.findByLabelText('Bước 3/3: chờ Trưởng nhóm duyệt');
  });
});

describe('create dialog', () => {
  it('NeedHelp requires scope+reason; optional target drives the outcome sentence', async () => {
    setup('Member');
    const create = vi.spyOn(marketplaceService, 'create').mockResolvedValue(req('r9'));
    renderAt();
    fireEvent.click(await screen.findByRole('button', { name: 'Tạo yêu cầu' }));
    const dlg = await screen.findByRole('dialog');
    await within(dlg).findByLabelText('Công việc của bạn');
    fireEvent.change(within(dlg).getByLabelText('Công việc của bạn'), { target: { value: 't-a' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Gửi yêu cầu' }));
    expect(create).not.toHaveBeenCalled();
    expect(within(dlg).getByText('Nhập phần cần hỗ trợ.')).toBeTruthy();
    fireEvent.change(within(dlg).getByLabelText('Phần cần hỗ trợ'), { target: { value: 'unit tests' } });
    fireEvent.change(within(dlg).getByLabelText('Lý do'), { target: { value: 'please' } });
    // no target → open-posting sentence
    expect(dlg.textContent).toContain('được đăng để thành viên tự nhận');
    fireEvent.change(within(dlg).getByLabelText('Người hỗ trợ'), { target: { value: 'u-x' } });
    expect(dlg.textContent).toContain('chờ Member X đồng ý');
    fireEvent.click(within(dlg).getByRole('button', { name: 'Gửi yêu cầu' }));
    await waitFor(() => expect(create).toHaveBeenCalledWith('g1',
      expect.objectContaining({ requestType: 1, taskId: 't-a', targetUserId: 'u-x', helpScope: 'unit tests' })));
  });

  it('Swap requires member+task and lists swap candidates', async () => {
    setup('Member');
    const create = vi.spyOn(marketplaceService, 'create').mockResolvedValue(req('r9'));
    renderAt();
    fireEvent.click(await screen.findByRole('button', { name: 'Tạo yêu cầu' }));
    const dlg = await screen.findByRole('dialog');
    await within(dlg).findByLabelText('Công việc của bạn');
    fireEvent.click(within(dlg).getByLabelText(/Hoán đổi/, { selector: 'input' }));
    fireEvent.change(within(dlg).getByLabelText('Công việc của bạn'), { target: { value: 't-a' } });
    fireEvent.change(within(dlg).getByLabelText('Lý do'), { target: { value: 'swap' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Gửi yêu cầu' }));
    expect(create).not.toHaveBeenCalled();
    expect(within(dlg).getByText('Chọn thành viên.')).toBeTruthy();
    fireEvent.change(within(dlg).getByLabelText('Thành viên'), { target: { value: 'u-x' } });
    await within(dlg).findByLabelText('Công việc của họ');
    fireEvent.change(within(dlg).getByLabelText('Công việc của họ'), { target: { value: 't-x' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Gửi yêu cầu' }));
    await waitFor(() => expect(create).toHaveBeenCalledWith('g1',
      expect.objectContaining({ requestType: 3, targetUserId: 'u-x', relatedTaskId: 't-x' })));
  });

  it('deep link ?new=NeedHelp&task= opens pre-filled', async () => {
    setup('Member');
    renderAt('/groups/g1/marketplace?new=NeedHelp&task=t-a');
    const dlg = await screen.findByRole('dialog');
    await within(dlg).findByLabelText('Phần cần hỗ trợ');
    await waitFor(() => expect((within(dlg).getByLabelText('Công việc của bạn') as HTMLSelectElement).value).toBe('t-a'));
  });
});
