// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MemberDetail from './MemberDetail';
import { ToastProvider } from '../components/ui/Toast';
import { groupsService, type MemberOverviewDto, type MemberOverviewTask } from '../services/groups';
import { tasksService, type TaskPermissionsDto } from '../services/tasks';
import { clearSession } from '../services/session';
import { remindedTaskIds } from '../hooks/use-remind-task';

let currentUid = 'leader-1';
vi.mock('../layouts/MainLayout', () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('../hooks/use-current-user-id', () => ({ useCurrentUserId: () => currentUid }));

const PERMS: TaskPermissionsDto = {
  canEdit: false, canAssign: false, canDelete: false, canUpdateProgress: false,
  canAddSubtask: false, allowedTransitions: [], canRemind: false,
};
const task = (id: string, over: Partial<MemberOverviewTask> = {}): MemberOverviewTask => ({
  id, projectId: 'p1', projectName: 'Web App', title: `Việc ${id}`, status: 'InProgress',
  priority: 'Medium', deadlineAt: new Date(Date.now() + 48 * 3600e3).toISOString(),
  isOverdue: false, isAtRisk: false, isStale: false, permissions: { ...PERMS }, ...over,
});
const overview = (over: Partial<MemberOverviewDto> = {}): MemberOverviewDto => ({
  member: { userId: 'member-1', displayName: 'M3 Vien', role: 'Member', joinedAt: '2026-09-01T00:00:00Z', isActive: true },
  summary: { total: 3, toDo: 1, inProgress: 1, submitted: 0, changesRequested: 0, completed: 1, overdue: 1, atRisk: 1, stale: 0, completionPercent: 33 },
  points: { total: 7, projects: [{ projectId: 'p1', projectName: 'Web App', memberPoints: 7, projectCreditedPoints: 14, percent: 50 }] },
  tasks: [
    task('od', { title: 'Việc quá hạn', isOverdue: true, deadlineAt: new Date(Date.now() - 3600e3).toISOString(), permissions: { ...PERMS, canRemind: true } }),
    task('rk', { title: 'Việc nguy cơ', isAtRisk: true, permissions: { ...PERMS, canRemind: true } }),
    task('ok', { title: 'Việc xong', status: 'Completed' }),
  ],
  activity: [{ id: 'a1', actorName: 'M3 Vien', action: 'Update', entityType: 'Task', summary: 'Cập nhật tiến độ Việc quá hạn', createdAt: '2026-11-19T10:00:00Z' }],
  ...over,
});
const group = { id: 'g1', name: 'Nhóm Một', memberCount: 3, myRole: 'Leader', createdAt: 'x', members: [] };

const renderPage = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
    <ToastProvider>
      <MemoryRouter initialEntries={['/groups/g1/members/member-1']}>
        <Routes><Route path="/groups/:groupId/members/:userId" element={<MemberDetail />} /></Routes>
      </MemoryRouter>
    </ToastProvider>
  </QueryClientProvider>,
);

beforeEach(() => {
  currentUid = 'leader-1';
  vi.spyOn(groupsService, 'get').mockResolvedValue(group as never);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); clearSession(); remindedTaskIds.clear(); });

describe('MemberDetail — leader view', () => {
  it('header, statusbar, risk lists with Nhắc + Mở, points, tasks, activity', async () => {
    vi.spyOn(groupsService, 'memberOverview').mockResolvedValue(overview());
    renderPage();
    expect(await screen.findByRole('heading', { name: 'M3 Vien' })).toBeTruthy();
    expect(screen.getByText('Thành viên')).toBeTruthy();
    expect(screen.getByText('Tham gia 01/09/2026')).toBeTruthy();
    expect(screen.getByRole('img', { name: /Tiến độ công việc/ })).toBeTruthy();
    expect(screen.getByText('1/3 hoàn thành · 33%')).toBeTruthy();
    // de-duplicated risk list: 2 flagged tasks → one section with 2 rows
    expect(screen.getByRole('heading', { name: 'Cần theo dõi (2)' })).toBeTruthy();
    expect(screen.getByText('Web App · Quá hạn 1 giờ')).toBeTruthy(); // overdue task meta
    expect(screen.getByText(/Còn 2 ngày · tiến độ 0%|Còn 1 ngày · tiến độ 0%|Tiến độ 0%/)).toBeTruthy();
    const remindBtns = screen.getAllByRole('button', { name: /Nhắc M3 Vien về/ });
    expect(remindBtns).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: 'Mở công việc' }).length).toBeGreaterThan(0);
    // points
    expect(screen.getByText('7 điểm')).toBeTruthy();
    expect(screen.getByText('trên tổng 14 điểm đã duyệt')).toBeTruthy();
    expect(screen.getByText(/Điểm của công việc được cộng cho người phụ trách khi Trưởng nhóm duyệt\./)).toBeTruthy();
    // activity
    expect(screen.getByText('Cập nhật tiến độ Việc quá hạn')).toBeTruthy();
  });

  it('self view renders the same page', async () => {
    currentUid = 'member-1';
    vi.spyOn(groupsService, 'memberOverview').mockResolvedValue(overview());
    renderPage();
    expect(await screen.findByRole('heading', { name: 'M3 Vien' })).toBeTruthy();
  });

  it('inactive member shows the Đã rời nhóm pill', async () => {
    vi.spyOn(groupsService, 'memberOverview').mockResolvedValue(
      overview({ member: { ...overview().member, isActive: false } }));
    renderPage();
    expect(await screen.findByText('Đã rời nhóm')).toBeTruthy();
  });

  it('remind 200 → "Đã nhắc" disabled; 409 → also disabled + error toast', async () => {
    vi.spyOn(groupsService, 'memberOverview').mockResolvedValue(overview());
    const remind = vi.spyOn(tasksService, 'remind').mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce({ status: 409, message: 'Bạn vừa nhắc công việc này gần đây.' });
    renderPage();
    fireEvent.click((await screen.findAllByRole('button', { name: 'Nhắc M3 Vien về Việc quá hạn' }))[0]);
    await screen.findByText('Đã gửi nhắc nhở tới M3 Vien.');
    const done = await screen.findByRole('button', { name: 'Đã nhắc M3 Vien về Việc quá hạn' });
    expect((done as HTMLButtonElement).disabled).toBe(true);
    expect(done.textContent).toContain('Đã nhắc');
    // 409 on a different task: error toast + the button also becomes Đã nhắc
    fireEvent.click(screen.getByRole('button', { name: 'Nhắc M3 Vien về Việc nguy cơ' }));
    await screen.findByText('Bạn vừa nhắc công việc này gần đây.');
    expect((await screen.findByRole('button', { name: 'Đã nhắc M3 Vien về Việc nguy cơ' }) as HTMLButtonElement).disabled).toBe(true);
    expect(remind).toHaveBeenCalledTimes(2);
  });

  it('task flagged Overdue + Stale renders one row with both chips', async () => {
    vi.spyOn(groupsService, 'memberOverview').mockResolvedValue(overview({
      tasks: [task('both', { title: 'Vừa quá hạn vừa đình trệ', isOverdue: true, isStale: true, deadlineAt: new Date(Date.now() - 2 * 3600e3).toISOString(), updatedAt: new Date(Date.now() - 26 * 3600e3).toISOString() })],
    }));
    renderPage();
    const watch = within((await screen.findByRole('heading', { name: 'Cần theo dõi (1)' })).closest('section')!);
    const row = watch.getByRole('link', { name: 'Vừa quá hạn vừa đình trệ' }).closest('li')!;
    const chips = within(row).getAllByText(/Quá hạn|Đình trệ/).map(el => el.textContent);
    expect(chips).toContain('Quá hạn');
    expect(chips).toContain('Đình trệ');
    // reason uses the highest-priority flag (Overdue)
    expect(within(row).getByText(/Web App · Quá hạn \d+ giờ/)).toBeTruthy();
  });

  it('status filter counts + hides zero statuses', async () => {
    vi.spyOn(groupsService, 'memberOverview').mockResolvedValue(overview());
    renderPage();
    const card = within((await screen.findByRole('heading', { name: 'Công việc (3)' })).closest('section')!);
    const group = within(card.getByRole('group', { name: 'Lọc theo trạng thái' }));
    expect(group.queryByRole('button', { name: /Chờ duyệt/ })).toBeNull();
    fireEvent.click(group.getByRole('button', { name: 'Hoàn thành (1)' }));
    expect(card.getByText('Việc xong')).toBeTruthy();
    expect(card.queryByText('Việc quá hạn')).toBeNull();
    fireEvent.click(group.getByRole('button', { name: 'Tất cả (3)' }));
    expect(card.getByText('Việc quá hạn')).toBeTruthy();
  });

  it('points empty state when no credits', async () => {
    vi.spyOn(groupsService, 'memberOverview').mockResolvedValue(
      overview({ points: { total: 0, projects: [] } }));
    renderPage();
    expect(await screen.findByText('Chưa có điểm đóng góp nào được ghi nhận.')).toBeTruthy();
  });
});

describe('MemberDetail — error states', () => {
  it('403 → forbidden message, back link only, no retry', async () => {
    vi.spyOn(groupsService, 'memberOverview').mockRejectedValue({ status: 403, message: 'denied' });
    renderPage();
    expect(await screen.findByText('Bạn không có quyền xem tiến độ của thành viên này.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Về nhóm' }).getAttribute('href')).toBe('/groups/g1');
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });
  it('404 → not-found message, back link only, no retry', async () => {
    vi.spyOn(groupsService, 'memberOverview').mockRejectedValue({ status: 404, message: 'nope' });
    renderPage();
    expect(await screen.findByText('Không tìm thấy thành viên trong nhóm này.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Về nhóm' }).getAttribute('href')).toBe('/groups/g1');
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });
  it('generic error → retry recovers', async () => {
    const ov = vi.spyOn(groupsService, 'memberOverview').mockRejectedValue({ message: 'mạng lỗi' });
    renderPage();
    await screen.findByText('mạng lỗi', undefined, { timeout: 3000 }); // one auto-retry before the error surfaces
    ov.mockResolvedValue(overview());
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await screen.findByRole('heading', { name: 'M3 Vien' });
  });
});
