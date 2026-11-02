import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Icon from '../ui/Icon';
import type { MyTaskDto } from '../../services/dashboard';
import { dayKey } from '../../utils/presentation';
import { calendarDeadlineCounts } from './dashboard-model';

const WEEK = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

const key = (d: Date) => d.toISOString().slice(0, 10);

export default function MiniCalendar({ tasks, selectedDate, onSelect, today }: {
  tasks: MyTaskDto[]; selectedDate: string | null; onSelect: (key: string | null) => void; today?: string;
}) {
  const [fallbackToday] = useState(() => dayKey(new Date().toISOString()));
  const todayKey = today ?? fallbackToday;
  const [view, setView] = useState(() => {
    const [baseYear, baseMonth] = (selectedDate ?? todayKey).split('-').map(Number);
    const d = new Date();
    return { y: baseYear || d.getFullYear(), m: (baseMonth || d.getMonth() + 1) - 1 };
  });
  const [focusedDate, setFocusedDate] = useState<string>(selectedDate ?? todayKey);
  const focusRequested = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const helpId = useId();

  const [prevSelected, setPrevSelected] = useState(selectedDate);
  if (prevSelected !== selectedDate) {
    setPrevSelected(selectedDate);
    if (selectedDate) {
      const [y, m] = selectedDate.split('-').map(Number);
      setView({ y, m: m - 1 });
      setFocusedDate(selectedDate);
    }
  }

  const counts = useMemo(() => calendarDeadlineCounts(tasks), [tasks]);

  const cells = useMemo(() => {
    const first = new Date(Date.UTC(view.y, view.m, 1));
    const offset = (first.getUTCDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, i) => new Date(Date.UTC(view.y, view.m, 1 - offset + i)));
  }, [view]);

  const goMonth = (n: number) => {
    const m = view.m + n;
    const y = view.y + Math.floor(m / 12);
    const mm = ((m % 12) + 12) % 12;
    setView({ y, m: mm });
    setFocusedDate(`${y}-${String(mm + 1).padStart(2, '0')}-01`);
  };

  const select = (k: string, inMonth: boolean) => {
    const [y, m] = k.split('-').map(Number);
    if (!inMonth) setView({ y, m: m - 1 });
    setFocusedDate(k);
    onSelect(selectedDate === k ? null : k);
  };

  useEffect(() => {
    if (focusRequested.current) {
      focusRequested.current = false;
      gridRef.current?.querySelector<HTMLElement>(`[data-date="${focusedDate}"]`)?.focus();
    }
  }, [focusedDate, view]);

  const onKeyDown = (e: React.KeyboardEvent, d: Date) => {
    const offset = (d.getUTCDay() + 6) % 7;
    const deltas: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -offset, End: 6 - offset };
    let target: Date | null = null;
    if (e.key in deltas) {
      target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + deltas[e.key]));
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      const m = d.getUTCMonth() + (e.key === 'PageUp' ? -1 : 1);
      const base = new Date(Date.UTC(d.getUTCFullYear(), m, 1));
      const last = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
      base.setUTCDate(Math.min(d.getUTCDate(), last));
      target = base;
    } else return;
    e.preventDefault();
    const k = key(target);
    setView({ y: target.getUTCFullYear(), m: target.getUTCMonth() });
    setFocusedDate(k);
    focusRequested.current = true;
  };

  const monthLabel = `Tháng ${view.m + 1}, ${view.y}`;
  const dayLabel = (d: Date, n: number) =>
    new Intl.DateTimeFormat('vi-VN', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(d)
    + (n > 0 ? `, ${n} công việc đến hạn` : '');

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mb-3">
        <span className="whitespace-nowrap text-sm font-semibold" aria-live="polite">{monthLabel}</span>
        <div className="ml-auto flex shrink-0 gap-1">
          <button onClick={() => goMonth(-1)} aria-label="Tháng trước" className="min-h-11 min-w-11 rounded-lg text-slate-600 hover:bg-slate-100 flex items-center justify-center"><Icon name="chevron-left" size={18} /></button>
          <button onClick={() => { setView({ y: Number(todayKey.slice(0, 4)), m: Number(todayKey.slice(5, 7)) - 1 }); setFocusedDate(todayKey); onSelect(todayKey); }} className="min-h-11 whitespace-nowrap rounded-lg px-2 text-sm font-medium text-slate-600 hover:bg-slate-100">Hôm nay</button>
          <button onClick={() => goMonth(1)} aria-label="Tháng sau" className="min-h-11 min-w-11 rounded-lg text-slate-600 hover:bg-slate-100 flex items-center justify-center"><Icon name="chevron-right" size={18} /></button>
        </div>
      </div>
      <p id={helpId} className="sr-only">Dùng phím mũi tên để di chuyển giữa các ngày.</p>
      <div ref={gridRef} role="group" aria-label="Chọn ngày đến hạn" aria-describedby={helpId} className="grid grid-cols-7 gap-1 text-center">
        {WEEK.map(d => <span key={d} className="text-[11px] font-medium text-slate-500 py-1">{d}</span>)}
        {cells.map((d) => {
          const k = key(d);
          const inMonth = d.getUTCMonth() === view.m;
          const isToday = k === todayKey;
          const selected = k === selectedDate;
          const n = counts.get(k) ?? 0;
          return (
            <button key={k} type="button" data-date={k} tabIndex={k === focusedDate ? 0 : -1}
              aria-label={dayLabel(d, n)} aria-pressed={selected} aria-current={isToday ? 'date' : undefined}
              onClick={() => select(k, inMonth)} onKeyDown={e => onKeyDown(e, d)}
              className={`relative min-h-10 rounded-lg text-sm transition-colors ${selected ? 'bg-primary-600 text-white' : isToday ? 'bg-primary-50 text-primary-700 font-semibold ring-1 ring-inset ring-primary-600' : inMonth ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-500 hover:bg-slate-50'}`}>
              {d.getUTCDate()}
              {n > 0 && <span aria-hidden="true" className={`absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${selected ? 'bg-white' : 'bg-primary-600'}`} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
