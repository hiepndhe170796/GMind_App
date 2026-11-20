// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ActivityLogPage from './ActivityLogPage';
import { groupsService, type ActivityItemDto, type GroupDetailDto } from '../services/groups';

vi.mock('../layouts/MainLayout', () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('../services/auth', () => ({
  authService: { isLoggedIn: () => true, currentUser: () => ({ id: 'u-l', displayName: 'Leader', email: 'l@x.dev' }) },
}));
vi.mock('../hooks/use-current-user-id', () => ({ useCurrentUserId: () => 'u-l' }));

const item = (id: string, over: Partial<ActivityItemDto> = {}): ActivityItemDto => ({
  id, actorUserId: 'u1', actorName: 'Actor', action: 'Create', entityType: 'Task',
  category: 'task', summary: `Hoạt động ${id}`, createdAt: new Date().toISOString(), ...over,
});

const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const renderAt = (entry: string) => render(
  <QueryClientProvider client={qc()}>
    <MemoryRouter initialEntries={[entry]}><Routes>
      <Route path="/groups/:id/activity" element={<ActivityLogPage />} />
    </Routes></MemoryRouter>
  </QueryClientProvider>);

const setup = () => {
  vi.spyOn(groupsService, 'get').mockResolvedValue({ id: 'g1', name: 'Nhóm A', memberCount: 1, myRole: 'Leader', createdAt: '2026-01-01', members: [] } as GroupDetailDto);
  vi.spyOn(groupsService, 'activityLogFilters').mockResolvedValue({
    actors: [{ userId: 'u1', displayName: 'Actor One', isActive: true }, { userId: 'u2', displayName: 'Gone', isActive: false }],
    projects: [{ id: 'p1', name: 'Proj', isArchived: false }, { id: 'p2', name: 'Old Proj', isArchived: true }],
  });
};

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('ActivityLogPage', () => {
  it('403 shows the leader-only message with a back link', async () => {
    setup();
    vi.spyOn(groupsService, 'activityLog').mockRejectedValue({ status: 403, message: 'no' });
    renderAt('/groups/g1/activity');
    expect(await screen.findByText('Chỉ Trưởng nhóm xem được nhật ký hoạt động của nhóm.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Về nhóm' }).getAttribute('href')).toBe('/groups/g1');
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });

  it('groups rows under VN day headings and renders meta', async () => {
    setup();
    const log = vi.spyOn(groupsService, 'activityLog').mockResolvedValue({
      items: [item('a1', { taskId: 't1', projectName: 'Proj' }), item('a2', { category: 'marketplace', entityType: 'MarketplaceRequest' })],
      nextCursor: null,
    });
    renderAt('/groups/g1/activity');
    expect(await screen.findByText('Hôm nay')).toBeTruthy();
    expect(screen.getByText('Hoạt động a1')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Mở công việc' }).getAttribute('href')).toBe('/tasks/t1');
    expect(screen.getByText('Proj')).toBeTruthy();
    expect(screen.getAllByText('Marketplace').length).toBeGreaterThanOrEqual(2); // filter option + row badge
    expect(screen.getByText('Đã hiển thị toàn bộ hoạt động.')).toBeTruthy();
    expect(log.mock.calls[0][1]).toMatchObject({ take: 30, cursor: undefined });
  });

  it('filters sync to the URL and are sent to the API; clear resets', async () => {
    setup();
    const log = vi.spyOn(groupsService, 'activityLog').mockResolvedValue({ items: [item('a1')], nextCursor: null });
    renderAt('/groups/g1/activity');
    await screen.findByText('Hoạt động a1');
    fireEvent.change(screen.getByLabelText('Người thực hiện'), { target: { value: 'u1' } });
    fireEvent.change(screen.getByLabelText('Dự án'), { target: { value: 'p2' } });
    fireEvent.change(screen.getByLabelText('Loại'), { target: { value: 'marketplace' } });
    await waitFor(() => expect(log).toHaveBeenLastCalledWith('g1',
      expect.objectContaining({ actorId: 'u1', projectId: 'p2', category: 'marketplace' })));
    // actor select lists inactive members with the suffix
    expect(screen.getByText('Gone (đã rời nhóm)')).toBeTruthy();
    expect(screen.getByText('Old Proj (đã lưu trữ)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Xóa bộ lọc' }));
    await waitFor(() => expect(log).toHaveBeenLastCalledWith('g1',
      expect.objectContaining({ actorId: undefined, projectId: undefined, category: undefined })));
  });

  it('rejects from > to with an inline error and no request', async () => {
    setup();
    const log = vi.spyOn(groupsService, 'activityLog').mockResolvedValue({ items: [item('a1')], nextCursor: null });
    renderAt('/groups/g1/activity');
    await screen.findByText('Hoạt động a1');
    const calls = log.mock.calls.length;
    fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2026-11-20' } });
    fireEvent.change(screen.getByLabelText('Đến ngày'), { target: { value: '2026-11-01' } });
    expect(screen.getByRole('alert').textContent).toContain('Từ ngày phải trước hoặc bằng đến ngày.');
    expect(log.mock.calls.length).toBe(calls + 1); // only the valid 'from' request went out
  });

  it('empty state offers clear-filters; Tải thêm pages via cursor', async () => {
    setup();
    const log = vi.spyOn(groupsService, 'activityLog')
      .mockResolvedValueOnce({ items: [], nextCursor: null })
      .mockResolvedValueOnce({ items: [item('a1')], nextCursor: 'cur2' })
      .mockResolvedValueOnce({ items: [item('a2')], nextCursor: null });
    renderAt('/groups/g1/activity?category=task');
    expect(await screen.findByText('Không có hoạt động phù hợp.')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Xóa bộ lọc' })[0]);
    await screen.findByText('Hoạt động a1');
    fireEvent.click(screen.getByRole('button', { name: 'Tải thêm' }));
    await screen.findByText('Hoạt động a2');
    expect(log).toHaveBeenLastCalledWith('g1', expect.objectContaining({ cursor: 'cur2' }));
    expect(await screen.findByText('Đã hiển thị toàn bộ hoạt động.')).toBeTruthy();
  });
});
