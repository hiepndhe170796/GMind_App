import { describe, expect, it } from 'vitest';
import { deadlineState } from './task-time';

// Fixed instant: 2026-12-20 10:00 Asia/Ho_Chi_Minh (Sunday, UTC+7)
const NOW = new Date('2026-12-20T03:00:00Z');
const at = (iso: string) => deadlineState(iso, 'InProgress', NOW);

describe('deadlineState', () => {
  it('returns none for completed tasks and missing/invalid deadlines', () => {
    expect(deadlineState('2026-12-19T00:00:00Z', 'Completed', NOW)).toEqual({ kind: 'none', label: '' });
    expect(deadlineState(null, 'InProgress', NOW)).toEqual({ kind: 'none', label: 'Chưa đặt hạn' });
    expect(deadlineState('not-a-date', 'InProgress', NOW).kind).toBe('none');
  });

  it('labels overdue in minutes, hours and days', () => {
    expect(at('2026-12-20T02:30:00Z')).toEqual({ kind: 'overdue', label: 'Quá hạn 30 phút' });
    expect(at('2026-12-20T00:00:00Z')).toEqual({ kind: 'overdue', label: 'Quá hạn 3 giờ' });
    expect(at('2026-12-18T03:00:00Z')).toEqual({ kind: 'overdue', label: 'Quá hạn 2 ngày' });
  });

  it('labels today in minutes/hours, then as clock time', () => {
    expect(at('2026-12-20T03:30:00Z')).toEqual({ kind: 'today', label: 'Còn 30 phút' });
    expect(at('2026-12-20T08:00:00Z')).toEqual({ kind: 'today', label: 'Còn 5 giờ' });
    expect(at('2026-12-20T10:00:00Z')).toEqual({ kind: 'today', label: 'Hôm nay 17:00' });
  });

  it('treats exactly-now as not yet overdue', () => {
    const s = at('2026-12-20T03:00:00Z');
    expect(s.kind).toBe('today');
    expect(s.label).toBe('Còn 1 phút');
  });

  it('labels tomorrow and weekday within 7 VN days', () => {
    expect(at('2026-12-21T02:00:00Z')).toEqual({ kind: 'tomorrow', label: 'Ngày mai 09:00' });
    expect(at('2026-12-23T07:00:00Z')).toEqual({ kind: 'soon', label: 'Thứ Tư 14:00' });
    expect(at('2026-12-27T07:00:00Z').kind).toBe('soon'); // exactly 7 VN days out
  });

  it('labels far deadlines as dd/MM/yyyy', () => {
    expect(at('2027-01-20T00:00:00Z')).toEqual({ kind: 'later', label: '20/01/2027' });
    expect(at('2026-12-28T02:00:00Z').kind).toBe('later'); // 8 VN days out
  });

  it('compares calendar days in VN timezone, not UTC', () => {
    // now 23:30 VN (Dec 20) — a deadline 60 minutes later is already "tomorrow" in VN.
    const late = new Date('2026-12-20T16:30:00Z');
    const s = deadlineState('2026-12-20T17:30:00Z', 'ToDo', late);
    expect(s).toEqual({ kind: 'tomorrow', label: 'Ngày mai 00:30' });
    // and a UTC date boundary without a VN boundary stays "today"
    const early = new Date('2026-12-20T20:00:00Z'); // 03:00 VN Dec 21
    const t = deadlineState('2026-12-21T05:00:00Z', 'ToDo', early); // 12:00 VN same day
    expect(t.kind).toBe('today');
  });
});
