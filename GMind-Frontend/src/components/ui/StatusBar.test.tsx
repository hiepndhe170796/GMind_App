// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import StatusBar from './StatusBar';

afterEach(cleanup);

describe('StatusBar', () => {
  it('sizes segments proportionally to counts', () => {
    const { container } = render(<StatusBar counts={{ ToDo: 1, Completed: 3 }} />);
    const segments = container.querySelectorAll('[role="img"] > span');
    expect(segments).toHaveLength(2);
    expect((segments[0] as HTMLElement).style.width).toBe('25%');
    expect((segments[1] as HTMLElement).style.width).toBe('75%');
  });

  it('summarises counts in the aria-label in Vietnamese', () => {
    render(<StatusBar counts={{ ToDo: 2, InProgress: 1, Completed: 3 }} />);
    const bar = screen.getByRole('img');
    const label = bar.getAttribute('aria-label')!;
    expect(label).toContain('2 Cần làm');
    expect(label).toContain('1 Đang làm');
    expect(label).toContain('3 Hoàn thành');
    expect(label).not.toContain('Chờ duyệt');
  });

  it('shows the empty state', () => {
    render(<StatusBar counts={{}} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Chưa có công việc');
    expect(screen.getByText('Chưa có công việc')).toBeTruthy();
  });

  it('shows the overdue pill only when overdue > 0', () => {
    const { rerender } = render(<StatusBar counts={{ ToDo: 1 }} overdue={2} />);
    expect(screen.getByText('2 quá hạn')).toBeTruthy();
    rerender(<StatusBar counts={{ ToDo: 1 }} overdue={0} />);
    expect(screen.queryByText(/quá hạn/)).toBeNull();
  });

  it('can hide the legend', () => {
    render(<StatusBar counts={{ ToDo: 2 }} showLegend={false} />);
    expect(screen.queryByText('Cần làm')).toBeNull();
  });
});
