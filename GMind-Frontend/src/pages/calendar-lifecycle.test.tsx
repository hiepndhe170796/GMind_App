// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { act } from 'react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Calendar from './Calendar';
import { dashboardService, type MyTaskDto } from '../services/dashboard';
import { clearSession, saveSession } from '../services/session';
import { qk } from '../services/query-keys';

const UID = 'calendar-user-1';
vi.mock('../layouts/MainLayout', () => ({ default: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock('../services/auth', () => ({
  authService: { isLoggedIn: () => true, currentUser: () => ({ id: 'mock-auth-user' }) },
}));

const task = (id: string, deadlineAt = '2026-02-10T10:00:00Z'): MyTaskDto => ({
  id, title: `Private ${id}`, projectId: 'p1', projectName: 'Project',
  status: 'ToDo', priority: 'Medium', deadlineAt,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => { resolve = res; });
  return { promise, resolve };
}
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, gcTime: 0 } } });
const seed = (id = UID) => saveSession({
  accessToken: 'at', refreshToken: 'rt', expiresAt: '2100-01-01',
  user: { id, displayName: 'U', email: 'u@x.dev' },
});
const tree = (client: QueryClient, entry = '/calendar?month=2026-02&date=2026-02-10') =>
  <QueryClientProvider client={client}>
    <MemoryRouter initialEntries={[entry]}><Calendar /></MemoryRouter>
  </QueryClientProvider>;

function HistoryCalendar() {
  const navigate = useNavigate();
  const location = useLocation();
  return <>
    <button onClick={() => navigate(-1)}>History back</button>
    <button onClick={() => navigate(1)}>History forward</button>
    <output data-testid="calendar-url">{location.pathname + location.search}</output>
    <Calendar />
  </>;
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); clearSession(); localStorage.clear(); });

describe('Calendar request and navigation regressions', () => {
  it('fetches for the new user after an account switch and ignores the old response', async () => {
    const client = newClient();
    seed();
    const first = deferred<MyTaskDto[]>();
    const get = vi.spyOn(dashboardService, 'myTasks')
      .mockReturnValueOnce(first.promise).mockResolvedValueOnce([task('new-user')]);
    render(tree(client));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    act(() => { seed('calendar-user-2'); });
    await screen.findAllByText('Private new-user');
    await act(async () => { first.resolve([task('old-user')]); await first.promise; });
    expect(screen.queryAllByText('Private old-user')).toHaveLength(0);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('retains old rows on a refresh failure and clears the warning after a real GET retry', async () => {
    const client = newClient();
    seed();
    const get = vi.spyOn(dashboardService, 'myTasks')
      .mockResolvedValueOnce([task('before')])
      .mockRejectedValueOnce({ status: 500, message: 'offline' })
      .mockResolvedValueOnce([task('after')]);
    render(tree(client));
    await screen.findAllByText('Private before');
    await act(async () => { await client.invalidateQueries({ queryKey: qk.myTasks(UID) }); });
    await screen.findByText(/Chưa làm mới được lịch/);
    expect(screen.getAllByText('Private before').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await screen.findAllByText('Private after');
    expect(screen.queryByText(/Chưa làm mới được lịch/)).toBeNull();
    expect(screen.queryAllByText('Private before')).toHaveLength(0);
    expect(get).toHaveBeenCalledTimes(3);
  });

  it.each([401, 403, 404])('shows the fatal error state when a background refresh fails with %i', async status => {
    const client = newClient();
    seed();
    vi.spyOn(dashboardService, 'myTasks')
      .mockResolvedValueOnce([task('restricted')])
      .mockRejectedValueOnce({ status, message: 'Không còn quyền' })
      .mockResolvedValueOnce([task('allowed')]);
    render(tree(client));
    await screen.findAllByText('Private restricted');
    await act(async () => { await client.invalidateQueries({ queryKey: qk.myTasks(UID) }); });
    await screen.findByRole('button', { name: 'Thử lại' });
    expect(screen.queryByText('Private restricted')).toBeNull();
    expect(screen.queryByText(/Chưa làm mới được lịch/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await screen.findAllByText('Private allowed');
  });

  it('restores month, view and committed search through Back/Forward without fetching again', async () => {
    const client = newClient();
    seed();
    const get = vi.spyOn(dashboardService, 'myTasks').mockResolvedValue([
      task('feb'), task('mar', '2026-03-15T10:00:00Z'),
    ]);
    const feb = '/calendar?month=2026-02&date=2026-02-10&view=list&q=feb';
    const mar = '/calendar?month=2026-03&date=2026-03-15&view=list&q=mar';
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[feb, mar]} initialIndex={1}><HistoryCalendar /></MemoryRouter>
      </QueryClientProvider>);
    await screen.findAllByText('Private mar');
    const input = screen.getByLabelText('Tìm công việc') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'uncommitted' } });
    expect(screen.getByTestId('calendar-url').textContent).toBe(mar);
    expect(screen.getAllByText('Private mar')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'History back' }));
    await screen.findByText('Private feb');
    expect(input.value).toBe('feb');
    expect(screen.getByTestId('calendar-url').textContent).toBe(feb);
    fireEvent.click(screen.getByRole('button', { name: 'History forward' }));
    await screen.findAllByText('Private mar');
    expect(input.value).toBe('mar');
    expect(screen.getByTestId('calendar-url').textContent).toBe(mar);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it.each(['0001-01', '0099-12', '9999-12'])('renders a bounded civil month %s without invalid date labels', async month => {
    seed();
    vi.spyOn(dashboardService, 'myTasks').mockResolvedValue([task('other-month')]);
    render(
      <QueryClientProvider client={newClient()}>
        <MemoryRouter initialEntries={[`/calendar?month=${month}&date=${month}-01`]}><Calendar /></MemoryRouter>
      </QueryClientProvider>);
    await screen.findByRole('group', { name: /Chọn ngày đến hạn/ });
    const buttons = document.querySelectorAll<HTMLButtonElement>('[data-cal-date]');
    expect(buttons.length).toBeGreaterThanOrEqual(28);
    expect([...buttons].filter(button => button.tabIndex === 0)).toHaveLength(1);
    expect([...buttons].every(button => !button.getAttribute('aria-label')?.includes('Invalid'))).toBe(true);
    if (month === '0001-01') expect((screen.getByRole('button', { name: 'Tháng trước' }) as HTMLButtonElement).disabled).toBe(true);
    if (month === '9999-12') expect((screen.getByRole('button', { name: 'Tháng sau' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
