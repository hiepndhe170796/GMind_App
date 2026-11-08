// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import Notifications from './Notifications';
import { notificationsService, type NotificationDto } from '../services/notifications';

// jsdom has no ResizeObserver/geometry — stub RO and drive scroll/clientHeight per test.
let roCb: (() => void) | null = null;
class ROStub {
  constructor(cb: ResizeObserverCallback) { roCb = () => cb([], this as unknown as ResizeObserver); }
  observe() { } unobserve() { } disconnect() { roCb = null; }
}
const setHeights = (scroll: number, client: number) => {
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get() { return scroll; } });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return client; } });
};
const restoreHeights = () => { setHeights(0, 0); roCb = null; };


let userId = 'notification-user';
vi.mock('../services/auth', () => ({
  authService: { currentUser: () => ({ id: userId, displayName: 'Notification User', email: 'notifications@example.test' }), isLoggedIn: () => true },
}));

const ID = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const notification = (overrides: Partial<NotificationDto> = {}): NotificationDto => ({
  id: ID, type: 'TaskAssigned', title: 'Công việc được giao', body: 'Hãy kiểm tra các bước triển khai.',
  isRead: false, createdAt: '2026-11-08T10:00:00Z', relatedEntityType: 'Task', relatedEntityId: ID, ...overrides,
});
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};
const fail = (code = 500) => Object.assign(new Error(code === 403 ? 'Không còn quyền truy cập.' : 'Mạng tạm thời gián đoạn.'), { status: code });
let data: NotificationDto[];

function Probe() {
  const location = useLocation();
  return <div data-testid="notification-location">{location.pathname + location.search}</div>;
}
function Destination() {
  const location = useLocation();
  const state = location.state as { returnTo?: string; navigationSection?: string } | null;
  return <div data-testid="notification-destination">{JSON.stringify(state)}</div>;
}
function App({ entry = '/notifications' }: { entry?: string }) {
  return (
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/tasks/:id" element={<Destination />} />
      </Routes>
      <Probe />
    </MemoryRouter>
  );
}
function row(id = ID) {
  const element = document.querySelector<HTMLElement>(`[data-notification-id="${id}"]`);
  if (!element) throw new Error(`Missing notification ${id}`);
  return element;
}
const readButton = () => screen.getByRole('button', { name: 'Đánh dấu đã đọc: Công việc được giao' });
const unreadFilter = () => screen.getByRole('button', { name: /^Chưa đọc/ });

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
beforeAll(() => { vi.stubGlobal('ResizeObserver', ROStub); });
beforeEach(() => {
  setHeights(0, 0);
  userId = 'notification-user';
  data = [notification(), notification({ id: OTHER, title: 'Thông báo đã xem', isRead: true, relatedEntityId: OTHER })];
  vi.spyOn(notificationsService, 'list').mockImplementation(async unread => data.filter(n => !unread || !n.isRead));
  vi.spyOn(notificationsService, 'unreadCount').mockImplementation(async () => data.filter(n => !n.isRead).length);
  vi.spyOn(notificationsService, 'markRead').mockImplementation(async id => {
    data = data.map(n => n.id === id ? { ...n, isRead: true } : n);
    return {};
  });
  vi.spyOn(notificationsService, 'markAllRead').mockImplementation(async () => {
    const affected = data.filter(n => !n.isRead).length;
    data = data.map(n => ({ ...n, isRead: true }));
    return affected;
  });
});
afterEach(() => {
  restoreHeights(); cleanup(); vi.restoreAllMocks(); });

describe('Notifications inbox', () => {
  it('shares an authoritative count between the real header and page, with one count GET', async () => {
    render(<App />);
    await screen.findByText('Công việc được giao');
    expect(await screen.findByRole('link', { name: 'Thông báo, 1 chưa đọc' })).toBeTruthy();
    expect(screen.getByText('1 thông báo chưa đọc')).toBeTruthy();
    expect(notificationsService.unreadCount).toHaveBeenCalledTimes(1);
    expect(within(row()).getByText('Chưa đọc')).toBeTruthy();
    expect(within(row(OTHER)).getByText('Đã đọc')).toBeTruthy();
  });

  it('marks one read, updates both surfaces and keeps the successful read DTO', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Đánh dấu đã đọc: Công việc được giao' }));
    expect(await screen.findByText('Đã đánh dấu thông báo là đã đọc.')).toBeTruthy();
    await screen.findByRole('link', { name: 'Thông báo, 0 chưa đọc' });
    expect(within(row()).getByText('Đã đọc')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Đánh dấu đã đọc: Công việc được giao' })).toBeNull();
    expect(document.activeElement).toBe(within(row()).getByRole('heading', { level: 4 }));
  });

  it('keeps all rows and permits retry when the read POST fails', async () => {
    vi.mocked(notificationsService.markRead).mockRejectedValueOnce(fail());
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Đánh dấu đã đọc: Công việc được giao' }));
    await screen.findByText('Mạng tạm thời gián đoạn.');
    expect(within(row()).getByText('Chưa đọc')).toBeTruthy();
    expect(screen.getByText('Thông báo đã xem')).toBeTruthy();
    expect(screen.queryByText('Đã đánh dấu thông báo là đã đọc.')).toBeNull();
    fireEvent.click(readButton());
    await screen.findByText('Đã đánh dấu thông báo là đã đọc.');
  });

  it('does not revert saved read state when the subsequent list refresh fails', async () => {
    vi.mocked(notificationsService.list).mockResolvedValueOnce(data).mockRejectedValueOnce(fail());
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Đánh dấu đã đọc: Công việc được giao' }));
    await screen.findByText('Đã đánh dấu thông báo là đã đọc.');
    expect(within(row()).getByText('Đã đọc')).toBeTruthy();
    expect(screen.getByText(/Không làm mới được danh sách/)).toBeTruthy();
  });

  it('removes a saved read row locally from Unread even if the refill fails', async () => {
    vi.mocked(notificationsService.list).mockResolvedValueOnce([data[0]]).mockRejectedValueOnce(fail());
    render(<App entry="/notifications?unread=1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Đánh dấu đã đọc: Công việc được giao' }));
    await screen.findByText('Đã đánh dấu thông báo là đã đọc.');
    expect(screen.queryByText('Công việc được giao')).toBeNull();
    expect(screen.getByText('Không có thông báo chưa đọc')).toBeTruthy();
    expect(screen.getByText(/Không làm mới được danh sách/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Xem tất cả' }));
    await waitFor(() => expect(notificationsService.list).toHaveBeenLastCalledWith(false));
  });

  it('keeps filter node/focus, preserves other query state and rejects a late prior-filter response', async () => {
    const old = deferred<NotificationDto[]>();
    vi.mocked(notificationsService.list).mockReturnValueOnce(old.promise).mockResolvedValueOnce([data[0]]);
    render(<App entry="/notifications?source=bell" />);
    await waitFor(() => expect(notificationsService.list).toHaveBeenCalledTimes(1));
    const filter = unreadFilter();
    filter.focus();
    fireEvent.click(filter);
    await screen.findByText('Công việc được giao');
    await act(async () => { old.resolve([data[1]]); });
    expect(screen.queryByText('Thông báo đã xem')).toBeNull();
    expect(unreadFilter()).toBe(filter);
    expect(document.activeElement).toBe(filter);
    expect(screen.getByTestId('notification-location').textContent).toBe('/notifications?source=bell&unread=1');
  });

  it('serializes duplicate read clicks and disables all competing controls', async () => {
    const gate = deferred<unknown>();
    vi.mocked(notificationsService.markRead).mockReturnValueOnce(gate.promise);
    render(<App />);
    const read = await screen.findByRole('button', { name: 'Đánh dấu đã đọc: Công việc được giao' });
    fireEvent.click(read);
    fireEvent.click(read);
    expect(notificationsService.markRead).toHaveBeenCalledTimes(1);
    expect((unreadFilter() as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Làm mới' }) as HTMLButtonElement).disabled).toBe(true);
    data = data.map(n => ({ ...n, isRead: true }));
    await act(async () => { gate.resolve({}); });
  });

  it('cancels a bulk confirmation without a POST and restores the opener', async () => {
    render(<App />);
    await screen.findByText('Công việc được giao');
    const opener = screen.getByRole('button', { name: 'Đánh dấu tất cả đã đọc' });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Hủy' }));
    expect(notificationsService.markAllRead).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(opener);
  });

  it('keeps a failed bulk dialog open for retry, then announces the affected count and restores filter focus', async () => {
    vi.mocked(notificationsService.markAllRead).mockRejectedValueOnce(fail());
    render(<App />);
    await screen.findByText('Công việc được giao');
    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu tất cả đã đọc' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Đánh dấu tất cả' }));
    await within(screen.getByRole('dialog')).findByText('Mạng tạm thời gián đoạn.');
    expect(screen.queryByText(/Đã đánh dấu \d+ thông báo/)).toBeNull();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Đánh dấu tất cả' }));
    await screen.findByText('Đã đánh dấu 1 thông báo là đã đọc.');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Tất cả' }));
    expect(screen.getByText('0 thông báo chưa đọc')).toBeTruthy();
  });

  it('locks the pending bulk dialog against duplicates and Escape', async () => {
    const gate = deferred<number>();
    vi.mocked(notificationsService.markAllRead).mockReturnValueOnce(gate.promise);
    render(<App />);
    await screen.findByText('Công việc được giao');
    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu tất cả đã đọc' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Đánh dấu tất cả' }));
    const cancel = new Event('cancel', { cancelable: true });
    fireEvent(dialog, cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect((within(dialog).getByRole('button', { name: 'Hủy' }) as HTMLButtonElement).disabled).toBe(true);
    expect(notificationsService.markAllRead).toHaveBeenCalledTimes(1);
    data = data.map(n => ({ ...n, isRead: true }));
    await act(async () => { gate.resolve(1); });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it.each([403, 404])('clears private content and the shared count on a denied read (%s)', async code => {
    vi.mocked(notificationsService.markRead).mockRejectedValueOnce(fail(code));
    render(<App />);
    await screen.findByRole('link', { name: 'Thông báo, 1 chưa đọc' });
    fireEvent.click(readButton());
    await waitFor(() => expect(screen.queryByText('Công việc được giao')).toBeNull());
    expect(screen.queryByText('Thông báo đã xem')).toBeNull();
    expect(screen.queryByText('Chưa có thông báo')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('link', { name: 'Thông báo, chưa cập nhật số chưa đọc' })).toBeTruthy();
  });

  it('does not confuse an initial list error with an empty inbox, and retries', async () => {
    vi.mocked(notificationsService.list).mockRejectedValueOnce(fail());
    render(<App />);
    await screen.findByText('Mạng tạm thời gián đoạn.');
    expect(screen.queryByText('Chưa có thông báo')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await screen.findByText('Công việc được giao');
  });

  it('offers a helpful genuine empty All state without an enabled bulk action', async () => {
    data = [];
    render(<App />);
    await screen.findByText('Chưa có thông báo');
    expect(screen.getByText('Những cập nhật về công việc và nhóm sẽ xuất hiện ở đây.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Đánh dấu tất cả đã đọc' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('does not present a failed count as zero and allows a separate count retry', async () => {
    vi.mocked(notificationsService.unreadCount).mockRejectedValueOnce(fail());
    render(<App />);
    await screen.findByText('Chưa làm mới được số chưa đọc.');
    expect(screen.queryByText('0 thông báo chưa đọc')).toBeNull();
    expect(screen.getByText('Công việc được giao')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại số chưa đọc' }));
    await screen.findByText('1 thông báo chưa đọc');
  });

  it('keeps a late prior-user list from exposing content after the account key changes', async () => {
    const old = deferred<NotificationDto[]>();
    vi.mocked(notificationsService.list).mockReturnValueOnce(old.promise).mockResolvedValueOnce([]);
    const { rerender } = render(<App />);
    await waitFor(() => expect(notificationsService.list).toHaveBeenCalledTimes(1));
    userId = 'another-user';
    rerender(<App />);
    await screen.findByText('Chưa có thông báo');
    await act(async () => { old.resolve(data); });
    expect(screen.queryByText('Công việc được giao')).toBeNull();
    expect(screen.queryByText('Thông báo đã xem')).toBeNull();
  });

  it('deduplicates focus and visibility refresh while the list is in flight', async () => {
    const pending = deferred<NotificationDto[]>();
    vi.mocked(notificationsService.list).mockReturnValueOnce(pending.promise);
    render(<App />);
    await waitFor(() => expect(notificationsService.list).toHaveBeenCalledTimes(1));
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(notificationsService.list).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve(data); });
    await screen.findByText('Công việc được giao');
  });

  it('makes the entire long body available with explicit expansion and no nested controls', async () => {
    setHeights(240, 72); // overflow -> toggle appears
    data = [notification({ body: 'Nội dung đầy đủ. '.repeat(30) + 'KẾT THÚC' })];
    render(<App />);
    const expand = await screen.findByRole('button', { name: 'Xem thêm' });
    const body = document.getElementById(expand.getAttribute('aria-controls')!);
    expect(body?.textContent).toBe(data[0].body);
    expect(body?.classList.contains('line-clamp-3')).toBe(true);
    fireEvent.click(expand);
    expect(expand.getAttribute('aria-expanded')).toBe('true');
    expect(body?.classList.contains('line-clamp-3')).toBe(false);
    expect(document.querySelector('a button, button a, button button, a a')).toBeNull();
  });

  it('a long body that actually fits gets NO Xem thêm toggle', async () => {
    setHeights(48, 48); // no overflow even though >200 chars
    data = [notification({ body: 'Nội dung dài nhưng hiển thị vừa. '.repeat(8) })];
    render(<App />);
    await screen.findByText(/Nội dung dài/);
    expect(screen.queryByRole('button', { name: 'Xem thêm' })).toBeNull();
  });

  it('a resize that creates overflow reveals the toggle', async () => {
    setHeights(48, 48);
    data = [notification({ body: 'Nội dung. '.repeat(20) })];
    render(<App />);
    await screen.findByText(/Nội dung/);
    expect(screen.queryByRole('button', { name: 'Xem thêm' })).toBeNull();
    setHeights(240, 72); // now overflows
    act(() => { roCb?.(); });
    expect(await screen.findByRole('button', { name: 'Xem thêm' })).toBeTruthy();
  });

  it('discloses the cap without inventing a load-more action', async () => {
    data = Array.from({ length: 100 }, (_, index) => notification({ id: `id-${index}`, title: `Thông báo ${index}` }));
    render(<App />);
    await screen.findByText(/Hiển thị tối đa 100 thông báo/);
    expect(document.querySelectorAll('[data-notification-id]')).toHaveLength(100);
    expect(screen.queryByRole('button', { name: /Tải thêm/ })).toBeNull();
  });

  it('opens the real supported task route with exact notification filter return state', async () => {
    render(<App entry="/notifications?source=bell&unread=1" />);
    const link = await screen.findByRole('link', { name: 'Xem công việc' });
    expect(link.getAttribute('href')).toBe(`/tasks/${ID}`);
    fireEvent.click(link);
    const state = JSON.parse(screen.getByTestId('notification-destination').textContent!);
    expect(state).toEqual({ navigationSection: '/notifications', returnTo: '/notifications?source=bell&unread=1' });
  });
});
