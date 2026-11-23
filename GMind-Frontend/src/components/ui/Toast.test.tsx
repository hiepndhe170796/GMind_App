// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast } from './Toast';

afterEach(cleanup);
beforeEach(() => vi.useFakeTimers());

function Trigger({ tone = 'success' as 'success' | 'error' | 'info', message = 'Lưu thành công', title }: { tone?: 'success' | 'error' | 'info'; message?: string; title?: string }) {
  const toast = useToast();
  return <button onClick={() => toast[tone](message, title ? { title } : undefined)}>fire</button>;
}

const app = (node: React.ReactNode) => render(<ToastProvider>{node}</ToastProvider>);

describe('Toast', () => {
  it('shows a success toast with role=status and auto-dismisses after 5s', () => {
    app(<Trigger />);
    fireEvent.click(screen.getByText('fire'));
    const toast = screen.getByRole('status');
    expect(toast.textContent).toContain('Lưu thành công');
    act(() => vi.advanceTimersByTime(5_100));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('uses role=alert for errors', () => {
    app(<Trigger tone="error" message="Xóa thất bại" />);
    fireEvent.click(screen.getByText('fire'));
    expect(screen.getByRole('alert').textContent).toContain('Xóa thất bại');
  });

  it('pauses auto-dismiss while hovered and resumes on leave', () => {
    app(<Trigger />);
    fireEvent.click(screen.getByText('fire'));
    const toast = screen.getByRole('status');
    fireEvent.mouseEnter(toast);
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByRole('status')).toBeTruthy();
    fireEvent.mouseLeave(toast);
    act(() => vi.advanceTimersByTime(5_100));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('closes via the Đóng thông báo button', () => {
    app(<Trigger />);
    fireEvent.click(screen.getByText('fire'));
    fireEvent.click(screen.getByRole('button', { name: 'Đóng thông báo' }));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('keeps at most 3 toasts visible', () => {
    function Many() {
      const t = useToast();
      return <button onClick={() => { t.info('a'); t.info('b'); t.info('c'); t.info('d'); }}>x4</button>;
    }
    app(<Many />);
    fireEvent.click(screen.getByText('x4'));
    expect(screen.getAllByRole('status')).toHaveLength(3);
    expect(screen.queryByText('a')).toBeNull();
    expect(screen.getByText('d')).toBeTruthy();
  });
});
