import { describe, expect, it } from 'vitest';
import { formatHeaderDate } from './presentation';

describe('formatHeaderDate', () => {
  it('renders "weekday, day tháng month, year" with lowercase tháng', () => {
    // 2026-11-20 is a Friday in VN time
    expect(formatHeaderDate(new Date('2026-11-20T05:00:00Z'))).toBe('Thứ Sáu, 20 tháng 11, 2026');
  });
});
