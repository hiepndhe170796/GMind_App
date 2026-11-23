// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import DevMailbox from './DevMailbox';
import { authService, type MailboxMetaDto } from '../services/auth';
import { createQueryClient } from '../services/query-client';

const mail = (overrides: Partial<MailboxMetaDto> = {}): MailboxMetaDto => ({
  id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  to: 'a@x.dev', subject: 'Đặt lại mật khẩu GMind', createdAt: '2026-11-20T10:00:00Z',
  links: [{ label: 'Đặt lại mật khẩu', url: 'http://localhost:5173/reset-password#token=t' }], ...overrides,
});

function mount() {
  return render(<QueryClientProvider client={createQueryClient()}>
    <MemoryRouter><DevMailbox /></MemoryRouter>
  </QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('/dev/mailbox', () => {
  it('lists messages with their action links and a sandboxed iframe on expand', async () => {
    vi.spyOn(authService, 'devMailbox').mockResolvedValue([mail()]);
    const detail = vi.spyOn(authService, 'devMailboxMessage').mockResolvedValue({
      meta: { ...mail(), textBody: null }, html: '<b>HTML body</b>',
    });
    mount();
    const link = await screen.findByRole('link', { name: 'Đặt lại mật khẩu' });
    expect(link.getAttribute('href')).toContain('/reset-password#token=');
    expect(screen.getByText('a@x.dev', { exact: false })).toBeTruthy();
    fireEvent.click(screen.getByText('Xem nội dung'));
    const iframe = await screen.findByTitle('Nội dung thư') as HTMLIFrameElement;
    expect(detail).toHaveBeenCalledWith(mail().id);
    expect(iframe.getAttribute('sandbox')).toBe('');
    expect(iframe.srcdoc).toBe('<b>HTML body</b>');
  });

  it('shows the empty state and the Development error copy', async () => {
    const list = vi.spyOn(authService, 'devMailbox').mockResolvedValueOnce([]);
    mount();
    expect(await screen.findByText('Chưa có thư nào.')).toBeTruthy();
    list.mockRejectedValue({ status: 404 });
    cleanup();
    mount();
    expect((await screen.findByRole('alert')).textContent).toContain('Không đọc được hộp thư dev. Kiểm tra API đang chạy ở môi trường Development.');
  });
});
