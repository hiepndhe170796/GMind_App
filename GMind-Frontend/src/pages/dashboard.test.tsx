// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { useState } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dashboard from './Dashboard';
import MiniCalendar from '../components/dashboard/MiniCalendar';
import { queueAction, queueReason, riskReason } from '../components/dashboard/leader-queue-model';
import { dashboardService } from '../services/dashboard';
import { marketplaceService, type MarketplaceDto } from '../services/marketplace';
import { groupsService } from '../services/groups';
import { authService } from '../services/auth';
import { clearSession } from '../services/session';
import type { LeaderQueue, LeaderQueueItem, MyTaskDto } from '../services/dashboard';
import type { GroupDto } from '../services/groups';
import type { UserInfo } from '../services/session';

let currentUid = 'u1';
vi.mock('../layouts/MainLayout', () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('../hooks/use-current-user-id', () => ({ useCurrentUserId: () => currentUid }));

const U1: UserInfo = { id: 'u1', displayName: 'Leader', email: 'u1@x.dev' };
const U2: UserInfo = { id: 'u2', displayName: 'Member', email: 'u2@x.dev' };

const vnDayKey = (d: Date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(d);
const addDays = (key: string, n: number) => {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const vnNoon = (key: string) => new Date(`${key}T12:00:00+07:00`).toISOString();
const todayKey = vnDayKey(new Date());
const ISO = {
  overdue: new Date(Date.now() - 3 * 3600e3).toISOString(),
  today: vnNoon(todayKey) < new Date().toISOString() ? new Date(Date.now() + 3600e3).toISOString() : vnNoon(todayKey),
  tomorrow: vnNoon(addDays(todayKey, 1)),
  soon: vnNoon(addDays(todayKey, 5)),
  later: vnNoon(addDays(todayKey, 30)),
};

const t = (id: string, over: Partial<MyTaskDto> = {}): MyTaskDto => ({
  id, projectId: 'p1', projectName: 'Web App', title: `Task ${id}`,
  status: 'ToDo', priority: 'Medium', deadlineAt: ISO.later, ...over,
});
const G: GroupDto = { id: 'g1', name: 'Nhóm Một', myRole: 'Leader', memberCount: 3 } as GroupDto;
const GM: GroupDto = { id: 'g2', name: 'Nhóm Member', myRole: 'Member', memberCount: 4 } as GroupDto;

const qItem = (kind: LeaderQueueItem['kind'], id: string, over: Partial<LeaderQueueItem> = {}): LeaderQueueItem => ({
  kind, taskId: `task-${id}`, title: `Item ${id}`, groupId: 'g1', groupName: 'Nhóm Một',
  projectId: 'p1', projectName: 'Web App', assigneeName: 'Member B',
  deadlineAt: ISO.today, updatedAt: new Date(Date.now() - 5 * 3600e3).toISOString(), ...over,
});
const queue = (items: LeaderQueueItem[], totals?: Partial<LeaderQueue['totals']>): LeaderQueue => ({
  groups: [{
    groupId: 'g1', groupName: 'Nhóm Một',
    counts: { toDo: 2, inProgress: 3, submitted: 1, changesRequested: 0, completed: 4 },
    overdue: 1, atRisk: 1, stale: 0, unassigned: 1, pendingRequests: 1,
  }],
  items,
  totals: { review: 0, marketplace: 0, overdue: 0, atRisk: 0, stale: 0, unassigned: 0, ...totals },
});
const everyKind = () => queue(
  [qItem('Review', 'r'), qItem('Marketplace', 'm', { taskId: null, requestId: 'req-1', requestType: 'NeedHelp', requestedByName: 'Member B' }),
    qItem('Overdue', 'o', { deadlineAt: ISO.overdue }), qItem('AtRisk', 'a', { deadlineAt: new Date(Date.now() + 5 * 3600e3).toISOString(), progressPercent: 40 }),
    qItem('Stale', 's'), qItem('Unassigned', 'u', { assigneeName: null })],
  { review: 1, marketplace: 1, overdue: 1, atRisk: 1, stale: 1, unassigned: 1 });

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
const renderApp = (entry = '/dashboard') => render(
  <QueryClientProvider client={client()}>
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/tasks/:id" element={<div>TASK</div>} />
        <Route path="/my-tasks" element={<div>MYTASKS</div>} />
        <Route path="/groups/:id" element={<div>GROUP</div>} />
        <Route path="/groups/:id/marketplace" element={<div>MARKET</div>} />
        <Route path="/join-group" element={<div>JOIN</div>} />
      </Routes>
    </MemoryRouter>
  </QueryClientProvider>,
);

const deferred = <T,>() => {
  let res!: (v: T) => void;
  const p = new Promise<T>((r) => { res = r; });
  return { p, res };
};

beforeEach(() => {
  currentUid = 'u1';
  vi.spyOn(authService, 'currentUser').mockImplementation(() => currentUid === 'u1' ? U1 : U2);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); clearSession(); localStorage.clear(); });

describe('Dashboard — Cần bạn xử lý', () => {
  it('shows every queue kind with pills, reasons and action links', async () => {
    vi.spyOn(dashboardService, 'myTasks').mockResolvedValue([]);
    vi.spyOn(dashboardService, 'leaderQueue').mockResolvedValue(everyKind());
    vi.spyOn(groupsService, 'myGroups').mockResolvedValue([G]);
    renderApp();
    const section = within(await screen.findByRole('heading', { name: 'Cần bạn xử lý' }).then(h => h.closest('section')! as HTMLElement));
    for (const label of ['Chờ duyệt', 'Marketplace', 'Quá hạn', 'Có nguy cơ', 'Đình trệ', 'Chưa giao'])
      expect(section.getAllByText(label).length).toBeGreaterThan(0);
    expect(section.getByText('Xem và duyệt').getAttribute('href')).toBe('/tasks/task-r');
    expect(section.getByText('Mở yêu cầu').getAttribute('href')).toBe('/groups/g1/marketplace');
    expect(section.getByText('Giao việc').getAttribute('href')).toBe('/tasks/task-u');
    expect(section.getAllByText('Xem công việc').length).toBeGreaterThan(0);
    expect(section.getByRole('button', { name: 'Tất cả (6)' })).toBeTruthy();
    expect(section.getByText(/Còn .* giờ · tiến độ 40%/)).toBeTruthy();
    expect(section.getByText(/Chưa cập nhật .* giờ/)).toBeTruthy();
    expect(section.getByText(/Quá hạn .* giờ/)).toBeTruthy();
  });

  it('kind filter narrows rows; zero-count kinds are hidden', async () => {
    vi.spyOn(dashboardService, 'myTasks').mockResolvedValue([]);
    vi.spyOn(dashboardService, 'leaderQueue').mockResolvedValue(
      queue([qItem('Overdue', 'o'), qItem('Review', 'r')], { overdue: 1, review: 1 }));
    vi.spyOn(groupsService, 'myGroups').mockResolvedValue([G]);
    renderApp();
    const section = within((await screen.findByRole('heading', { name: 'Cần bạn xử lý' })).closest('section')!);
    const group = within(section.getByRole('group', { name: 'Lọc theo loại việc' }));
    expect(group.queryByText('Marketplace')).toBeNull();
    expect(group.queryByText('Đình trệ')).toBeNull();
    fireEvent.click(group.getByRole('button', { name: 'Quá hạn (1)' }));
    expect(section.getByText('Item o')).toBeTruthy();
    expect(section.queryByText('Item r')).toBeNull();
    fireEvent.click(group.getByRole('button', { name: 'Tất cả (2)' }));
    expect(section.getByText('Item r')).toBeTruthy();
  });

  it('leader with empty queue sees the empty state', async () => {
    vi.spyOn(dashboardService, 'myTasks').mockResolvedValue([]);
    vi.spyOn(dashboardService, 'leaderQueue').mockResolvedValue(queue([]));
    vi.spyOn(groupsService, 'myGroups').mockResolvedValue([G]);
    renderApp();
    expect(await screen.findByText('Không có việc cần bạn xử lý.')).toBeTruthy();
  });

  it('hidden entirely for a member-only user; member groups show role pill', async () => {
    vi.spyOn(dashboardService, 'myTasks').mockResolvedValue([t('1')]);
    vi.spyOn(dashboardService, 'leaderQueue').mockResolvedValue({ groups: [], items: [], totals: { review: 0, marketplace: 0, overdue: 0, atRisk: 0, stale: 0, unassigned: 0 } });
    vi.spyOn(groupsService, 'myGroups').mockResolvedValue([GM]);
    renderApp();
    await screen.findByText('Task 1');
    expect(screen.queryByText('Cần bạn xử lý')).toBeNull();
    expect(screen.queryByText('Nhóm bạn quản lý')).toBeNull();
    expect(screen.getByText('Nhóm của tôi')).toBeTruthy();
    expect(screen.getByText('Thành viên')).toBeTruthy();
  });

  it('Nhóm bạn quản lý renders StatusBar + counts', async () => {
    vi.spyOn(dashboardService, 'myTasks').mockResolvedValue([]);
    vi.spyOn(dashboardService, 'leaderQueue').mockResolvedValue(everyKind());
    vi.spyOn(groupsService, 'myGroups').mockResolvedValue([G, GM]);
    renderApp();
    const section = within((await screen.findByRole('heading', { name: 'Nhóm bạn quản lý' })).closest('section')!);
    expect(section.getByText('Nhóm Một')).toBeTruthy();
    expect(section.getByText((_, el) => el?.tagName === 'P' && el.textContent === '1 quá hạn · 1 chưa giao')).toBeTruthy();
    expect(section.getByRole('img', { name: /Tiến độ công việc/ })).toBeTruthy();
    // member group appears under "Nhóm của tôi", not the leader list
    const mine = within((await screen.findByRole('heading', { name: 'Nhóm của tôi' })).closest('section')!);
    expect(mine.getByText('Nhóm Member')).toBeTruthy();
    expect(mine.queryByText('Nhóm Một')).toBeNull();
  });
});

describe('Dashboard — Việc của bạn tabs', () => {
  const tabsTasks = () => [
    t('td', { title: 'Việc hôm nay', deadlineAt: ISO.today, status: 'InProgress' }),
    t('tm', { title: 'Việc ngày mai', deadlineAt: ISO.tomorrow }),
    t('sn', { title: 'Việc tuần này', deadlineAt: ISO.soon }),
    t('od', { title: 'Việc quá hạn', deadlineAt: ISO.overdue, status: 'InProgress' }),
    t('lt', { title: 'Việc xa', deadlineAt: ISO.later }),
    t('nd', { title: 'Việc không hạn', deadlineAt: null }),
    t('cp', { title: 'Việc xong', deadlineAt: ISO.today, status: 'Completed', completedAt: new Date().toISOString() }),
  ];

  it('tab counts + filtering via deadlineState; completed excluded', async () => {
    vi.spyOn(dashboardService, 'myTasks').mockResolvedValue(tabsTasks());
    vi.spyOn(dashboardService, 'leaderQueue').mockResolvedValue({ groups: [], items: [], totals: { review: 0, marketplace: 0, overdue: 0, atRisk: 0, stale: 0, unassigned: 0 } });
    vi.spyOn(groupsService, 'myGroups').mockResolvedValue([GM]);
    renderApp();
    const card = within((await screen.findByRole('heading', { name: 'Việc của bạn' })).closest('section')!);
    // "Tất cả" default: all 6 open tasks, completed hidden
    await card.findByText('Việc xa');
    expect(card.getByRole('button', { name: 'Tất cả (6)' })).toBeTruthy();
    expect(card.getByRole('button', { name: 'Hôm nay (1)' })).toBeTruthy();
    expect(card.queryByText('Việc xong')).toBeNull();
    fireEvent.click(card.getByRole('button', { name: 'Ngày mai (1)' }));
    expect(card.getByText('Việc ngày mai')).toBeTruthy();
    expect(card.queryByText('Việc xa')).toBeNull();
    fireEvent.click(card.getByRole('button', { name: 'Quá hạn (1)' }));
    expect(card.getByText('Việc quá hạn')).toBeTruthy();
    fireEvent.click(card.getByRole('button', { name: 'Sắp đến hạn (7 ngày) (1)' }));
    expect(card.getByText('Việc tuần này')).toBeTruthy();
  });

  it('summary line counts open/inProgress/completed30; risk chips render', async () => {
    vi.spyOn(dashboardService, 'myTasks').mockResolvedValue([
      t('a', { status: 'InProgress', isAtRisk: true }),
      t('b', { status: 'InProgress', isStale: true, title: 'Việc đình trệ' }),
      t('c'), t('d', { status: 'Completed' }),
    ]);
    vi.spyOn(dashboardService, 'leaderQueue').mockResolvedValue({ groups: [], items: [], totals: { review: 0, marketplace: 0, overdue: 0, atRisk: 0, stale: 0, unassigned: 0 } });
    vi.spyOn(groupsService, 'myGroups').mockResolvedValue([GM]);
    renderApp();
    expect(await screen.findByText('3 việc đang mở · 2 đang làm · 1 hoàn thành trong 30 ngày')).toBeTruthy();
    expect(screen.getByText('Có nguy cơ trễ')).toBeTruthy();
    expect(screen.getByText('Đình trệ')).toBeTruthy();
  });

  it('max 8 rows + "Xem tất cả" link', async () => {
    vi.spyOn(dashboardService, 'myTasks').mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => t(`x${i}`, { title: `Việc ${i}` })));
    vi.spyOn(dashboardService, 'leaderQueue').mockResolvedValue({ groups: [], items: [], totals: { review: 0, marketplace: 0, overdue: 0, atRisk: 0, stale: 0, unassigned: 0 } });
    vi.spyOn(groupsService, 'myGroups').mockResolvedValue([GM]);
    renderApp();
    const card = within((await screen.findByRole('heading', { name: 'Việc của bạn' })).closest('section')!);
    await card.findByText('Việc 7');
    expect(card.queryByText('Việc 8')).toBeNull();
    expect(card.getByRole('link', { name: 'Xem tất cả trong Việc của tôi (10)' }).getAttribute('href')).toBe('/my-tasks');
  });

  it('groups but no tasks → explanatory empty state; no groups → onboarding', async () => {
    const myTasks = vi.spyOn(dashboardService, 'myTasks').mockResolvedValue([]);
    vi.spyOn(dashboardService, 'leaderQueue').mockResolvedValue({ groups: [], items: [], totals: { review: 0, marketplace: 0, overdue: 0, atRisk: 0, stale: 0, unassigned: 0 } });
    vi.spyOn(groupsService, 'myGroups').mockResolvedValue([GM]);
    renderApp();
    expect(await screen.findByText('Bạn chưa có công việc đang mở.')).toBeTruthy();
    cleanup();

    myTasks.mockResolvedValue([]);
    vi.spyOn(groupsService, 'myGroups').mockResolvedValue([]);
    renderApp();
    expect(await screen.findByText('Tạo nhóm hoặc tham gia bằng mã mời.')).toBeTruthy();
    expect(screen.queryByText('Việc của bạn')).toBeNull();
    // header CTA hidden: only the card CTA remains
    const ctas = screen.getAllByRole('link', { name: /Tạo \/ tham gia nhóm/ });
    expect(ctas).toHaveLength(1);
    expect(ctas[0].getAttribute('href')).toBe('/join-group');
    expect(screen.getByText('Bắt đầu bằng cách tạo nhóm cho dự án hoặc tham gia nhóm có sẵn.')).toBeTruthy();
  });
});

describe('Dashboard — queue states & cap', () => {
  const bigQueue = (n: number) => queue(
    Array.from({ length: n }, (_, i) => qItem('Overdue', `o${i}`, { title: `Việc quá hạn ${i}` })),
    { overdue: n });

  it('shows 6 items then "Hiện thêm" expands and "Thu gọn" collapses', async () => {
    vi.spyOn(dashboardService, 'myTasks').mockResolvedValue([]);
    vi.spyOn(dashboardService, 'leaderQueue').mockResolvedValue(bigQueue(8));
    vi.spyOn(groupsService, 'myGroups').mockResolvedValue([G]);
    renderApp();
    const section = within((await screen.findByRole('heading', { name: 'Cần bạn xử lý' })).closest('section')!);
    await section.findByText('Việc quá hạn 5');
    expect(section.queryByText('Việc quá hạn 6')).toBeNull();
    fireEvent.click(section.getByRole('button', { name: 'Hiện thêm 2 việc' }));
    expect(section.getByText('Việc quá hạn 7')).toBeTruthy();
    fireEvent.click(section.getByRole('button', { name: 'Thu gọn' }));
    expect(section.queryByText('Việc quá hạn 6')).toBeNull();
  });

  it('expansion resets when the kind filter changes', async () => {
    vi.spyOn(dashboardService, 'myTasks').mockResolvedValue([]);
    vi.spyOn(dashboardService, 'leaderQueue').mockResolvedValue(
      queue([...Array.from({ length: 8 }, (_, i) => qItem('Overdue', `o${i}`, { title: `Quá hạn ${i}` })), qItem('Stale', 's', { title: 'Đình trệ x' })],
        { overdue: 8, stale: 1 }));
    vi.spyOn(groupsService, 'myGroups').mockResolvedValue([G]);
    renderApp();
    const section = within((await screen.findByRole('heading', { name: 'Cần bạn xử lý' })).closest('section')!);
    await section.findByText('Hiện thêm 3 việc');
    fireEvent.click(section.getByRole('button', { name: 'Hiện thêm 3 việc' }));
    fireEvent.click(within(section.getByRole('group', { name: 'Lọc theo loại việc' })).getByRole('button', { name: 'Đình trệ (1)' }));
    expect(section.getByText('Đình trệ x')).toBeTruthy();
    expect(section.queryByText('Thu gọn')).toBeNull();
    fireEvent.click(within(section.getByRole('group', { name: 'Lọc theo loại việc' })).getByRole('button', { name: 'Tất cả (9)' }));
    await section.findByText('Hiện thêm 3 việc');
  });

  it('leader (from groups) sees a skeleton while the queue is pending, then data', async () => {
    const q = deferred<LeaderQueue>();
    vi.spyOn(dashboardService, 'myTasks').mockResolvedValue([]);
    vi.spyOn(dashboardService, 'leaderQueue').mockReturnValue(q.p);
    vi.spyOn(groupsService, 'myGroups').mockResolvedValue([G]);
    renderApp();
    expect(await screen.findByRole('heading', { name: 'Cần bạn xử lý' })).toBeTruthy();
    expect(screen.getByText('Đang tải hàng chờ xử lý…')).toBeTruthy();
    await act(async () => { q.res(queue([qItem('Review', 'r', { title: 'Việc chờ duyệt' })], { review: 1 })); });
    await screen.findByText('Việc chờ duyệt');
  });

  it('queue error → ErrorState inside the card; retry recovers', async () => {
    const lq = vi.spyOn(dashboardService, 'leaderQueue').mockRejectedValue({ message: 'lỗi hàng chờ' });
    vi.spyOn(dashboardService, 'myTasks').mockResolvedValue([t('1', { title: 'Việc A' })]);
    vi.spyOn(groupsService, 'myGroups').mockResolvedValue([G]);
    renderApp();
    const section = within((await screen.findByRole('heading', { name: 'Cần bạn xử lý' })).closest('section')!);
    await section.findByText('lỗi hàng chờ');
    lq.mockResolvedValue(queue([qItem('Review', 'r', { title: 'Việc chờ duyệt' })], { review: 1 }));
    fireEvent.click(section.getByRole('button', { name: 'Thử lại' }));
    await section.findByText('Việc chờ duyệt');
  });

  it('selecting a MiniCalendar day resets the tasks tab to Tất cả', async () => {
    vi.spyOn(dashboardService, 'myTasks').mockResolvedValue([
      t('a', { title: 'Việc hôm nay', deadlineAt: ISO.today }),
      t('b', { title: 'Việc xa', deadlineAt: ISO.later }),
    ]);
    vi.spyOn(dashboardService, 'leaderQueue').mockResolvedValue(queue([]));
    vi.spyOn(groupsService, 'myGroups').mockResolvedValue([G]);
    renderApp();
    const card = within((await screen.findByRole('heading', { name: 'Việc của bạn' })).closest('section')!);
    fireEvent.click(card.getByRole('button', { name: 'Hôm nay (1)' }));
    await card.findByText('Việc hôm nay');
    expect(card.getByRole('button', { name: 'Hôm nay (1)' }).getAttribute('aria-pressed')).toBe('true');
    // pick a day in the calendar (month grid follows the system date)
    const day = screen.getAllByRole('button', { name: /tháng \d{1,2}, \d{4}/ })[10];
    fireEvent.click(day);
    await waitFor(() => expect(card.getByRole('button', { name: 'Tất cả (2)' }).getAttribute('aria-pressed')).toBe('true'));
  });
});

describe('Dashboard — isolation & errors', () => {
  it('user switch: u1 tasks cannot leak into u2 view', async () => {
    const first = deferred<MyTaskDto[]>();
    const tasks = vi.spyOn(dashboardService, 'myTasks').mockReturnValueOnce(first.p).mockResolvedValue([t('u2task', { title: 'Việc U2' })]);
    vi.spyOn(dashboardService, 'leaderQueue').mockResolvedValue({ groups: [], items: [], totals: { review: 0, marketplace: 0, overdue: 0, atRisk: 0, stale: 0, unassigned: 0 } });
    vi.spyOn(groupsService, 'myGroups').mockResolvedValue([GM]);
    const qc = client();
    const tree = () => (
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes><Route path="/dashboard" element={<Dashboard />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    const { rerender } = render(tree());
    currentUid = 'u2';
    qc.clear();
    rerender(tree());
    await screen.findByText('Việc U2');
    await act(async () => { first.res([t('stale', { title: 'Việc cũ' })]); });
    await waitFor(() => expect(screen.getByText('Việc U2')).toBeTruthy());
    expect(screen.queryByText('Việc cũ')).toBeNull();
    expect(tasks).toHaveBeenCalledTimes(2);
  });

  it('load failure shows retry; retry recovers', async () => {
    const tasks = vi.spyOn(dashboardService, 'myTasks').mockRejectedValue({ message: 'mạng lỗi' });
    vi.spyOn(dashboardService, 'leaderQueue').mockResolvedValue({ groups: [], items: [], totals: { review: 0, marketplace: 0, overdue: 0, atRisk: 0, stale: 0, unassigned: 0 } });
    vi.spyOn(groupsService, 'myGroups').mockResolvedValue([GM]);
    renderApp();
    await screen.findByText('mạng lỗi');
    tasks.mockResolvedValue([t('ok', { title: 'Việc mới' })]);
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await screen.findByText('Việc mới');
  });
});

describe('queue reason/action helpers', () => {
  const now = new Date();
  it('reasons per kind', () => {
    expect(queueReason(qItem('AtRisk', 'a', { deadlineAt: new Date(now.getTime() + 5 * 3600e3).toISOString(), progressPercent: 40 }), now))
      .toBe('Còn 5 giờ · tiến độ 40%');
    expect(queueReason(qItem('Stale', 's', { updatedAt: new Date(now.getTime() - 50 * 3600e3).toISOString() }), now))
      .toBe('Chưa cập nhật 2 ngày');
    expect(queueReason(qItem('Overdue', 'o', { deadlineAt: new Date(now.getTime() - 3 * 3600e3).toISOString() }), now))
      .toBe('Quá hạn 3 giờ');
    expect(queueReason(qItem('Marketplace', 'm', { requestType: 'NeedHelp', requestedByName: 'B' }), now))
      .toBe('Cần hỗ trợ · B');
    expect(queueReason(qItem('Unassigned', 'u', { deadlineAt: null }), now))
      .toBe('Chưa đặt hạn');
    expect(queueReason(qItem('Unassigned', 'u2', { deadlineAt: new Date(now.getTime() + 26 * 3600e3).toISOString() }), now))
      .toMatch(/^Hạn: /);
  });
  it('actions per kind', () => {
    expect(queueAction(qItem('Review', 'r'))).toEqual({ href: '/tasks/task-r', label: 'Xem và duyệt' });
    expect(queueAction(qItem('Marketplace', 'm'))).toEqual({ href: '/groups/g1/marketplace', label: 'Mở yêu cầu' });
    expect(queueAction(qItem('Unassigned', 'u'))).toEqual({ href: '/tasks/task-u', label: 'Giao việc' });
    expect(queueAction(qItem('Overdue', 'o'))).toEqual({ href: '/tasks/task-o', label: 'Xem công việc' });
    expect(queueAction(qItem('AtRisk', 'a'))).toEqual({ href: '/tasks/task-a', label: 'Xem công việc' });
    expect(queueAction(qItem('Stale', 's'))).toEqual({ href: '/tasks/task-s', label: 'Xem công việc' });
  });
});

describe('MiniCalendar', () => {
  const tasks = [t('a', { deadlineAt: '2026-11-10T10:00:00Z' })];
  const Harness = () => {
    const [sel, setSel] = useState<string | null>(null);
    return <MemoryRouter><MiniCalendar tasks={tasks} selectedDate={sel} today="2026-11-01" onSelect={setSel} /></MemoryRouter>;
  };

  it('date select toggles aria-pressed on and off', () => {
    render(<Harness />);
    const cell = screen.getByRole('button', { name: /^10 tháng 11.*1 công việc/ });
    fireEvent.click(cell);
    expect(cell.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(cell);
    expect(cell.getAttribute('aria-pressed')).toBe('false');
  });

  it('Hôm nay selects today; prev/next crosses Dec->Jan', () => {
    const sel: { v: string | null } = { v: null };
    render(
      <MemoryRouter><MiniCalendar tasks={tasks} selectedDate={sel.v} today="2026-11-01" onSelect={k => { sel.v = k; }} /></MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Hôm nay' }));
    expect(sel.v).toBe('2026-11-01');
    fireEvent.click(screen.getByRole('button', { name: 'Tháng sau' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tháng sau' }));
    expect(screen.getByText('Tháng 1, 2027')).toBeTruthy();
  });

  it('arrow/home/end move focus; PageUp clamps to last day of previous month', () => {
    render(
      <MemoryRouter><MiniCalendar tasks={tasks} selectedDate="2026-03-31" today="2026-03-01" onSelect={() => undefined} /></MemoryRouter>
    );
    const cell = screen.getByRole('button', { name: /^31 tháng 3/ });
    fireEvent.keyDown(cell, { key: 'PageUp' });
    expect(document.activeElement!.getAttribute('data-date')).toBe('2026-02-28');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(document.activeElement!.getAttribute('data-date')).toBe('2026-03-01');
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(document.activeElement!.getAttribute('data-date')).toBe('2026-02-23');
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(document.activeElement!.getAttribute('data-date')).toBe('2026-03-01');
    fireEvent.keyDown(document.activeElement!, { key: 'PageDown' });
    expect(document.activeElement!.getAttribute('data-date')).toBe('2026-04-01');
  });
});

describe('riskReason (shared with member page)', () => {
  const now = new Date();
  it('overdue / at-risk / stale texts match the queue', () => {
    expect(riskReason('Overdue', { deadlineAt: new Date(now.getTime() - 14 * 3600e3).toISOString() }, now)).toBe('Quá hạn 14 giờ');
    expect(riskReason('AtRisk', { deadlineAt: new Date(now.getTime() + 4 * 3600e3).toISOString(), progressPercent: 30 }, now)).toBe('Còn 4 giờ · tiến độ 30%');
    expect(riskReason('Stale', { updatedAt: new Date(now.getTime() - 3 * 3600e3).toISOString() }, now)).toBe('Chưa cập nhật 3 giờ');
    expect(riskReason('Overdue', { deadlineAt: null }, now)).toBe('Đã quá hạn');
    expect(riskReason('AtRisk', { deadlineAt: null, progressPercent: 55 }, now)).toBe('Tiến độ 55%');
    expect(riskReason('Stale', { updatedAt: null }, now)).toBe('Chưa có cập nhật gần đây');
  });
});

describe('Dashboard — capped queue caption', () => {
  it('shows the top-priority caption when server totals exceed returned items', async () => {
    vi.spyOn(dashboardService, 'myTasks').mockResolvedValue([]);
    vi.spyOn(groupsService, 'myGroups').mockResolvedValue([G]);
    vi.spyOn(dashboardService, 'leaderQueue').mockResolvedValue(
      queue([qItem('Overdue', 'o1')], { overdue: 51 }));
    renderApp();
    expect(await screen.findByText('Đang hiển thị 1 việc ưu tiên nhất.')).toBeTruthy();
    // hidden when a kind filter narrows the view
    fireEvent.click(screen.getByRole('button', { name: /Quá hạn \(51\)/ }));
    await screen.findByText('Item o1');
    expect(screen.queryByText('Đang hiển thị 1 việc ưu tiên nhất.')).toBeNull();
  });
});

describe('Dashboard M4 — Yêu cầu gửi tới bạn', () => {
  const inc = (id: string, over: Partial<MarketplaceDto> = {}): MarketplaceDto => ({
    id, requestType: 'NeedHelp', status: 'AwaitingRecipient', taskTitle: `Req ${id}`, taskId: `t-${id}`,
    requestedByName: 'Ann', reason: 'r', createdAt: '2026-01-01T00:00:00Z', requestedByUserId: 'u-x',
    groupId: 'g1', groupName: 'Nhóm Một', ...over,
  });

  it('lists incoming requests with per-status CTA links', async () => {
    vi.spyOn(dashboardService, 'myTasks').mockResolvedValue([]);
    vi.spyOn(dashboardService, 'leaderQueue').mockResolvedValue(queue([]));
    vi.spyOn(groupsService, 'myGroups').mockResolvedValue([GM]);
    vi.spyOn(marketplaceService, 'incoming').mockResolvedValue([
      inc('r1'), inc('r2', { status: 'Open', requestType: 'Transfer', groupId: 'g2', groupName: 'Nhóm 2' }),
    ]);
    renderApp();
    const card = within((await screen.findByRole('heading', { name: /Yêu cầu gửi tới bạn \(2\)/ })).closest('section')! as HTMLElement);
    expect((card.getByRole('link', { name: 'Phản hồi' }) as HTMLAnchorElement).getAttribute('href')).toBe('/groups/g1/marketplace?tab=action');
    expect((card.getByRole('link', { name: 'Xem và nhận' }) as HTMLAnchorElement).getAttribute('href')).toBe('/groups/g2/marketplace?tab=open');
    expect(card.getByText('Cần hỗ trợ')).toBeTruthy();
    expect(card.getByText('Chuyển giao')).toBeTruthy();
  });

  it('hidden when empty', async () => {
    vi.spyOn(dashboardService, 'myTasks').mockResolvedValue([]);
    vi.spyOn(dashboardService, 'leaderQueue').mockResolvedValue(queue([]));
    vi.spyOn(groupsService, 'myGroups').mockResolvedValue([GM]);
    vi.spyOn(marketplaceService, 'incoming').mockResolvedValue([]);
    renderApp();
    await screen.findByText('Nhóm bạn quản lý').catch(() => screen.findByRole('heading', { name: /Lịch hạn/ }));
    await screen.findByRole('heading', { name: /Lịch hạn/ });
    expect(screen.queryByRole('heading', { name: /Yêu cầu gửi tới bạn/ })).toBeNull();
  });
});
