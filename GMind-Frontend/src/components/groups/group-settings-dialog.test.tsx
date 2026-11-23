// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GroupSettingsDialog from './GroupSettingsDialog';
import { ToastProvider } from '../ui/Toast';
import { groupsService, type GroupSettingsDto } from '../../services/groups';
import { clearSession } from '../../services/session';

vi.mock('../../hooks/use-current-user-id', () => ({ useCurrentUserId: () => 'u1' }));

// jsdom lacks dialog.showModal/close
if (typeof HTMLDialogElement !== 'undefined') {
  (HTMLDialogElement.prototype).showModal ??= function () { this.setAttribute('open', ''); };
  (HTMLDialogElement.prototype).close ??= function () { this.removeAttribute('open'); };
}

const custom: GroupSettingsDto = {
  riskHoursBeforeDeadline: 12, riskProgressBelowPercent: 50, staleAfterHours: 48,
  updatedAt: '2026-11-19T10:00:00Z', updatedByName: 'M3 Truong', isDefault: false,
};
const defaults: GroupSettingsDto = { ...custom, riskHoursBeforeDeadline: 8, riskProgressBelowPercent: 70, staleAfterHours: 24, updatedAt: null, updatedByName: null, isDefault: true };

const renderDialog = (onSaved = vi.fn()) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <GroupSettingsDialog groupId="g1" open onClose={vi.fn()} onSaved={onSaved} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return qc;
};

afterEach(() => { cleanup(); vi.restoreAllMocks(); clearSession(); });

describe('GroupSettingsDialog', () => {
  it('loads values into fields, shows live sentence + updated footer when not default', async () => {
    vi.spyOn(groupsService, 'getSettings').mockResolvedValue(custom);
    renderDialog();
    const h = await screen.findByLabelText(/Cảnh báo trước hạn/) as HTMLInputElement;
    expect(h.value).toBe('12');
    expect((await screen.findByLabelText(/Khi tiến độ dưới/) as HTMLInputElement).value).toBe('50');
    expect((await screen.findByLabelText(/Đình trệ sau/) as HTMLInputElement).value).toBe('48');
    expect(screen.getByText(/Công việc bị đánh dấu có nguy cơ khi còn dưới 12 giờ đến hạn và tiến độ dưới 50%\./)).toBeTruthy();
    expect(screen.getByText(/Cập nhật lần cuối bởi M3 Truong lúc/)).toBeTruthy();
  });

  it('defaults: no footer; hints visible', async () => {
    vi.spyOn(groupsService, 'getSettings').mockResolvedValue(defaults);
    renderDialog();
    await screen.findByLabelText(/Cảnh báo trước hạn/);
    expect(screen.queryByText(/Cập nhật lần cuối bởi/)).toBeNull();
    expect(screen.getByText('Mặc định 8 giờ.')).toBeTruthy();
    expect(screen.getByText('Mặc định 70%.')).toBeTruthy();
    expect(screen.getByText('Mặc định 24 giờ.')).toBeTruthy();
  });

  it('validates integer/range inline and blocks save', async () => {
    vi.spyOn(groupsService, 'getSettings').mockResolvedValue(defaults);
    const save = vi.spyOn(groupsService, 'updateSettings');
    renderDialog();
    const h = await screen.findByLabelText(/Cảnh báo trước hạn/) as HTMLInputElement;
    fireEvent.change(h, { target: { value: '0' } });
    const p = screen.getByLabelText(/Khi tiến độ dưới/) as HTMLInputElement;
    fireEvent.change(p, { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0);
    expect(screen.getByText('Từ 1 đến 168.')).toBeTruthy();
    expect(screen.getByText('Nhập một số nguyên.')).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
  });

  it('Khôi phục mặc định fills 8/70/24 without saving', async () => {
    vi.spyOn(groupsService, 'getSettings').mockResolvedValue(custom);
    const save = vi.spyOn(groupsService, 'updateSettings');
    renderDialog();
    await screen.findByLabelText(/Cảnh báo trước hạn/);
    fireEvent.click(screen.getByRole('button', { name: 'Khôi phục mặc định' }));
    expect((screen.getByLabelText(/Cảnh báo trước hạn/) as HTMLInputElement).value).toBe('8');
    expect((screen.getByLabelText(/Khi tiến độ dưới/) as HTMLInputElement).value).toBe('70');
    expect((screen.getByLabelText(/Đình trệ sau/) as HTMLInputElement).value).toBe('24');
    expect(save).not.toHaveBeenCalled();
  });

  it('save → toast + onSaved + invalidates settings/leaderQueue/myTasks/group keys', async () => {
    vi.spyOn(groupsService, 'getSettings').mockResolvedValue(defaults);
    const save = vi.spyOn(groupsService, 'updateSettings').mockResolvedValue({ ...defaults, isDefault: false });
    const onSaved = vi.fn();
    const qc = renderDialog(onSaved);
    const spy = vi.spyOn(qc, 'invalidateQueries');
    await screen.findByLabelText(/Cảnh báo trước hạn/);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await screen.findByText('Đã lưu cài đặt cảnh báo.');
    expect(save).toHaveBeenCalledWith('g1', { riskHoursBeforeDeadline: 8, riskProgressBelowPercent: 70, staleAfterHours: 24 });
    expect(onSaved).toHaveBeenCalled();
    const keys = spy.mock.calls.map(c => JSON.stringify(c[0]?.queryKey));
    expect(keys.some(k => k.includes('settings'))).toBe(true);
    expect(keys.some(k => k.includes('leader-queue'))).toBe(true);
    expect(keys.some(k => k.includes('my-tasks'))).toBe(true);
  });

  it('closing without saving resets the form to server values on reopen', async () => {
    vi.spyOn(groupsService, 'getSettings').mockResolvedValue(custom);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const ui = (open: boolean) => (
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <GroupSettingsDialog groupId="g1" open={open} onClose={vi.fn()} onSaved={vi.fn()} />
        </ToastProvider>
      </QueryClientProvider>);
    const { rerender } = render(ui(true));
    const h = await screen.findByLabelText(/Cảnh báo trước hạn/) as HTMLInputElement;
    expect(h.value).toBe('12');
    fireEvent.change(h, { target: { value: '99' } });
    rerender(ui(false));
    rerender(ui(true));
    expect((await screen.findByLabelText(/Cảnh báo trước hạn/) as HTMLInputElement).value).toBe('12');
  });

  it('live sentence shows … for out-of-range or non-integer values', async () => {
    vi.spyOn(groupsService, 'getSettings').mockResolvedValue(defaults);
    renderDialog();
    const h = await screen.findByLabelText(/Cảnh báo trước hạn/) as HTMLInputElement;
    fireEvent.change(h, { target: { value: '0' } });
    expect(screen.getByText(/còn dưới … giờ đến hạn/)).toBeTruthy();
    fireEvent.change(h, { target: { value: 'abc' } });
    expect(screen.getByText(/còn dưới … giờ đến hạn/)).toBeTruthy();
  });

  it('server 400 shows the message inline', async () => {
    vi.spyOn(groupsService, 'getSettings').mockResolvedValue(defaults);
    vi.spyOn(groupsService, 'updateSettings').mockRejectedValue({ status: 400, message: 'Ngưỡng không hợp lệ.' });
    renderDialog();
    await screen.findByLabelText(/Cảnh báo trước hạn/);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(await screen.findByText('Ngưỡng không hợp lệ.')).toBeTruthy();
  });
});
