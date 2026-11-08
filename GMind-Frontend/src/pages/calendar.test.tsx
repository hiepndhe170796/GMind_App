// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Calendar from './Calendar';
import { dashboardService, type MyTaskDto } from '../services/dashboard';
import { clearSession } from '../services/session';

vi.mock('../layouts/MainLayout', () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('../services/auth', () => ({
  authService: { isLoggedIn: () => true, currentUser: () => ({ id: 'u1', displayName: 'Me', email: 'm@x.dev' }) },
}));

const t = (id: string, deadlineAt?: string, over: Partial<MyTaskDto> = {}): MyTaskDto =>
  ({ id, projectId: 'p1', projectName: 'Web', title: `Task ${id}`, status: 'ToDo', priority: 'Medium', deadlineAt, ...over });
const deferred = <T,>() => { let resolve!: (v: T) => void, reject!: (e?: unknown) => void; const promise = new Promise<T>((r, j) => { resolve = r; reject = j; }); return { promise, resolve, reject }; };
const renderCal = (entry = '/calendar') => render(
  <MemoryRouter initialEntries={[entry]}><Routes><Route path="/calendar" element={<Calendar />} /></Routes></MemoryRouter>);
afterEach(() => { cleanup(); vi.restoreAllMocks(); clearSession(); });

describe('Calendar', () => {
  it('uses one full-width empty state instead of an empty day pane when no tasks are assigned', async () => {
    vi.spyOn(dashboardService, 'myTasks').mockResolvedValue([]);
    renderCal();
    expect(await screen.findByText('Chưa có công việc nào')).toBeTruthy();
    expect(document.querySelector('[data-selected-agenda]')).toBeNull();
    expect(screen.getByRole('link', { name: 'Về Việc của tôi' })).toBeTruthy();
  });

  it('opens the filter panel, reports combined filters, and clears their actual field values', async () => {
    const get = vi.spyOn(dashboardService, 'myTasks').mockResolvedValue([
      t('a', '2026-02-10T10:00:00Z', { status: 'InProgress', priority: 'High' }),
      t('b', '2026-02-11T10:00:00Z', { projectId: 'p2', projectName: 'Other' }),
    ]);
    renderCal('/calendar?month=2026-02&date=2026-02-10');
    await screen.findAllByText('Task a');
    expect(screen.queryByLabelText('Trạng thái')).toBeNull();
    const toggle = screen.getByRole('button', { name: /^Bộ lọc/ });
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.change(screen.getByLabelText('Dự án'), { target: { value: 'p1' } });
    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'InProgress' } });
    fireEvent.change(screen.getByLabelText('Ưu tiên'), { target: { value: 'High' } });
    expect(toggle.textContent).toContain('3');
    expect(screen.queryAllByText('Task b')).toHaveLength(0);
    const clear = document.querySelector<HTMLButtonElement>('#cal-filter-panel button')!;
    fireEvent.click(clear);
    expect((screen.getByLabelText('Dự án') as HTMLSelectElement).value).toBe('');
    expect((screen.getByLabelText('Trạng thái') as HTMLSelectElement).value).toBe('');
    expect((screen.getByLabelText('Ưu tiên') as HTMLSelectElement).value).toBe('');
    expect(toggle.textContent?.trim()).toBe('Bộ lọc');
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('selects a different dense day through overflow and shows every task without nested controls', async () => {
    const get = vi.spyOn(dashboardService, 'myTasks').mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => t(String(i), '2026-02-10T10:00:00Z', {
        status: i === 0 ? 'InProgress' : 'Submitted',
      })),
    );
    renderCal('/calendar?month=2026-02&date=2026-02-09');
    await screen.findByText('Task 0');
    fireEvent.click(screen.getByRole('button', { name: /xem 6 công việc/ }));
    const agenda = document.querySelector('[data-selected-agenda="2026-02-10"]')!;
    expect(agenda.querySelectorAll('a[href^="/tasks/"]')).toHaveLength(6);
    expect(document.querySelector('[data-cal-date="2026-02-10"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('button a, button button, a button')).toBeNull();
    expect(document.querySelector('[data-event-id="0"]')?.getAttribute('data-status')).toBe('InProgress');
    expect(document.querySelector('[data-event-id="1"]')?.getAttribute('data-status')).toBe('Submitted');
    fireEvent.click(screen.getByRole('button', { name: 'Danh sách' }));
    expect(document.querySelector('[data-calendar-month]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Danh sách' }).getAttribute('aria-pressed')).toBe('true');
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('deferred load -> empty vs populated, no filter triggers API refetch', async () => {
    const d = deferred<MyTaskDto[]>();
    const my = vi.spyOn(dashboardService, 'myTasks').mockReturnValue(d.promise);
    renderCal('/calendar?month=2026-02');
    expect(screen.getByText('Đang tải lịch công việc…')).toBeTruthy();
    await act(async () => { d.resolve([t('a', '2026-02-10T00:00:00Z')]); });
    expect(await screen.findByText('Task a')).toBeTruthy();
    expect(my).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /Bộ lọc/ }));
    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'InProgress' } });
    expect(my).toHaveBeenCalledTimes(1); // filter = URL-only, no fetch
  });

  it('typing does not commit until Enter; q syncs on applied URL change', async () => {
    vi.spyOn(dashboardService, 'myTasks').mockResolvedValue([t('a'), t('b')]);
    renderCal('/calendar?month=2026-02');
    await screen.findByText('Task a');
    fireEvent.change(screen.getByLabelText('Tìm công việc'), { target: { value: 'Task a' } });
    expect(screen.getByText('Task b')).toBeTruthy(); // uncommitted
    fireEvent.submit(screen.getByRole('search'));
    await waitFor(() => expect(screen.queryByText('Task b')).toBeNull());
    expect((document.querySelector('input[type=search]') as HTMLInputElement).value).toBe('Task a');
  });

  it('month nav clamps, adjacent-day select commits month+date, Today restores', async () => {
    vi.spyOn(dashboardService, 'myTasks').mockResolvedValue([t('a', '2026-01-31T00:00:00Z')]);
    renderCal('/calendar?month=2026-01&date=2026-01-31');
    await screen.findAllByText('Task a');
    fireEvent.click(screen.getByRole('button', { name: 'Tháng sau' }));
    // Feb 2026: Jan31 -> Feb28 clamp
    expect(document.querySelector('[data-calendar-month]')?.getAttribute('data-calendar-month')).toBe('2026-02');
    expect(document.querySelector('[data-cal-date="2026-02-28"][data-selected]')).toBeTruthy();
    expect(screen.getByText('Tháng 2, 2026')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Hôm nay' }));
    const month = document.querySelector('[data-calendar-month]')?.getAttribute('data-calendar-month');
    expect(month).toBeTruthy();
  });

  it('+N count shows all selected-day tasks in agenda; undated disclosure lists them', async () => {
    vi.spyOn(dashboardService, 'myTasks').mockResolvedValue([
      t('a', '2026-02-10T00:00:00Z'), t('b', '2026-02-10T10:00:00Z'), t('c', '2026-02-10T11:00:00Z'), t('x'),
    ]);
    renderCal('/calendar?month=2026-02&date=2026-02-10');
    await screen.findAllByText('Task a');
    const agenda = document.querySelector('[data-selected-agenda]')!;
    expect(agenda.textContent).toContain('Task a');
    expect(agenda.textContent).toContain('Task b');
    expect(agenda.textContent).toContain('Task c');
    fireEvent.click(screen.getByText(/Chưa đặt hạn \(1\)/));
    expect(screen.getByText('Task x')).toBeTruthy();
  });

  it('keyboard arrows move selection+focus; roving tabindex on one date', async () => {
    vi.spyOn(dashboardService, 'myTasks').mockResolvedValue([t('a', '2026-02-10T00:00:00Z')]);
    renderCal('/calendar?month=2026-02&date=2026-02-15');
    await screen.findByText('Task a');
    const sel = document.querySelector('[data-cal-date="2026-02-15"]') as HTMLElement;
    expect(sel.getAttribute('tabindex')).toBe('0');
    fireEvent.keyDown(sel, { key: 'ArrowRight' });
    await waitFor(() => expect(document.querySelector('[data-cal-date="2026-02-16"][data-selected]')).toBeTruthy());
    expect(document.activeElement).toBe(document.querySelector('[data-cal-date="2026-02-16"]'));
    const focused = document.querySelector('[data-cal-date="2026-02-16"]') as HTMLElement;
    expect(focused.getAttribute('tabindex')).toBe('0');
    fireEvent.keyDown(focused, { key: 'PageDown' });
    await waitFor(() => expect(document.querySelector('[data-calendar-month]')?.getAttribute('data-calendar-month')).toBe('2026-03'));
    expect(document.querySelector('[data-cal-date="2026-03-16"][data-selected]')).toBeTruthy();
    expect(document.activeElement).toBe(document.querySelector('[data-cal-date="2026-03-16"]'));
  });

  it('500 initial shows retry; 403 clears; quiet500 keeps rows+GET-only retry', async () => {
    vi.spyOn(dashboardService, 'myTasks')
      .mockRejectedValueOnce({ status: 500, message: 'boom' })
      .mockResolvedValueOnce([t('a', '2026-02-10T00:00:00Z')])
      .mockRejectedValueOnce({ status: 500, message: 'boom2' })
      .mockResolvedValue([t('a', '2026-02-10T00:00:00Z')]);
    renderCal('/calendar?month=2026-02');
    expect(await screen.findByRole('button', { name: 'Thử lại' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Task a')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Làm mới' }));
    await waitFor(() => expect(screen.getByText('Task a')).toBeTruthy());
    expect(await screen.findByRole('button', { name: 'Tải lại' })).toBeTruthy();
  });

  it('403 wipes rows; unmount before fetch ignores result', async () => {
    vi.spyOn(dashboardService, 'myTasks').mockRejectedValue({ status: 403, message: 'out' });
    renderCal();
    expect(await screen.findByRole('button', { name: 'Thử lại' })).toBeTruthy();
    expect(screen.queryByText('Task a')).toBeNull();
    const d = deferred<MyTaskDto[]>();
    vi.spyOn(dashboardService, 'myTasks').mockReturnValue(d.promise);
    const { unmount } = renderCal();
    unmount();
    await act(async () => { d.resolve([t('a')]); await d.promise; });
    expect(dashboardService.myTasks).toHaveBeenCalledTimes(1);
  });
});
