import { useMemo, useState } from 'react';
import Icon from '../ui/Icon';
import type { MyTaskDto } from '../../services/dashboard';
import { dayKey } from '../../utils/presentation';

const WEEK = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export default function MiniCalendar({ tasks, selectedDate, onSelect }: {
  tasks: MyTaskDto[]; selectedDate: string | null; onSelect: (key: string | null) => void;
}) {
  const today = dayKey(new Date().toISOString());
  const [year, month] = (selectedDate ?? today).split('-').map(Number);
  const [view, setView] = useState({ y: year || new Date().getFullYear(), m: (month || new Date().getMonth() + 1) - 1 });

  const dots = useMemo(() => new Set(tasks.map(t => t.deadlineAt ? dayKey(t.deadlineAt) : '').filter(Boolean)), [tasks]);

  const cells = useMemo(() => {
    const first = new Date(Date.UTC(view.y, view.m, 1));
    const offset = (first.getUTCDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, i) => new Date(Date.UTC(view.y, view.m, 1 - offset + i)));
  }, [view]);

  const key = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  const shift = (n: number) => setView(v => { const m = v.m + n; return { y: v.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 }; });
  const monthLabel = new Intl.DateTimeFormat('vi-VN', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(Date.UTC(view.y, view.m, 1)));
  const dayLabel = (d: Date) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(d);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold capitalize">{monthLabel}</span>
        <div className="flex gap-1">
          <button onClick={() => shift(-1)} aria-label="Tháng trước" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><Icon name="chevron-left" size={16} /></button>
          <button onClick={() => shift(1)} aria-label="Tháng sau" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><Icon name="chevron-right" size={16} /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEK.map(d => <span key={d} className="text-[11px] font-medium text-slate-400 py-1">{d}</span>)}
        {cells.map((d, i) => {
          const k = key(d);
          const inMonth = d.getUTCMonth() === view.m;
          const isToday = k === today;
          const selected = k === selectedDate;
          return (
            <button key={i} aria-label={dayLabel(d)} aria-pressed={selected} aria-current={isToday ? 'date' : undefined} onClick={() => onSelect(selected ? null : k)}
              className={`relative aspect-square rounded-lg text-sm transition-colors ${selected ? 'bg-primary-500 text-white' : isToday ? 'bg-primary-50 text-primary-700 font-semibold' : inMonth ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-300 hover:bg-slate-50'}`}>
              {d.getUTCDate()}
              {dots.has(k) && <span className={`absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${selected ? 'bg-white' : 'bg-primary-500'}`} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
