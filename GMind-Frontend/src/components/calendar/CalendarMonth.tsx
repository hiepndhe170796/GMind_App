import { useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { buildMonthCells, moveDate, isDay, type CalTask } from './calendar-model';
import { STATUS_LABEL } from '../../utils/presentation';

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const MAX_PREVIEW = 2;
const VN_DATE = (date: string) =>
  new Intl.DateTimeFormat('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${date}T00:00:00Z`));

export default function CalendarMonth({ month, selected, today, byDate, onSelect, navState }: {
  month: string; selected: string; today: string;
  byDate: Map<string, CalTask[]>; onSelect: (date: string) => void;
  navState: { navigationSection: string; returnTo: string };
}) {
  const cells = buildMonthCells(month);
  const gridRef = useRef<HTMLDivElement>(null);
  const focusTarget = useRef('');

  useLayoutEffect(() => {
    const target = focusTarget.current;
    if (!target) return;
    const el = gridRef.current?.querySelector<HTMLButtonElement>(`[data-cal-date="${selected}"]`);
    if (el && document.activeElement !== el) el.focus();
    if (document.activeElement === el) focusTarget.current = '';
  }, [selected]);

  const onKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const base = e.currentTarget.dataset.calDate!;
    const next = moveDate(base, e.key);
    if (next !== base && isDay(next)) {
      e.preventDefault();
      focusTarget.current = next;
      onSelect(next);
    }
  };

  return (
    <div role="group" aria-label={`Chọn ngày đến hạn, tháng ${+month.slice(5)}/${month.slice(0, 4)}`}
      data-calendar-month={month}>
      <div className="gcal-grid" ref={gridRef}>
        {WEEKDAYS.map((w, i) => (
          <div key={i} aria-hidden="true"
            className={`border-b border-r border-slate-200 bg-slate-50/70 py-1.5 text-center text-xs font-semibold text-slate-600 ${i === 6 ? 'border-r-0' : ''}`}>{w}</div>
        ))}
        {cells.map(({ date, inMonth }, ci) => {
          if (!isDay(date)) return <div key={date} className="gcal-cell" aria-hidden="true" />;
          const tasks = byDate.get(date) ?? [];
          const isSel = date === selected, isToday = date === today;
          const hasOverdue = tasks.some(t => t.overdue);
          const weekend = ci % 7 >= 5;
          return (
            <div key={date} className="gcal-cell" data-cal-cell={date}
              data-outside={!inMonth || undefined} data-weekend={weekend && inMonth || undefined}
              data-today={isToday || undefined} data-selected={isSel || undefined}>
              <button type="button" tabIndex={isSel ? 0 : -1}
                data-cal-date={date} data-today={isToday || undefined} data-selected={isSel || undefined}
                aria-label={`${VN_DATE(date)} — ${tasks.length ? `${tasks.length} công việc${hasOverdue ? ', có quá hạn' : ''}` : 'không có công việc'}`}
                aria-current={isToday ? 'date' : undefined} aria-pressed={isSel}
                onClick={() => onSelect(date)} onKeyDown={onKey}
                className="gcal-day-btn">
                <span className="gcal-date-pill">{+date.slice(8)}</span>
              </button>
              {tasks.length > 0 && (
                <span className="gcal-dots" aria-hidden="true">
                  <span className="cal-count">{tasks.length}</span>
                  {tasks.slice(0, 3).map(t => <i key={t.id} data-overdue={t.overdue || undefined} />)}
                </span>
              )}
              <div className="gcal-events">
                {tasks.slice(0, MAX_PREVIEW).map(t => (
                  <Link key={t.id} to={`/tasks/${t.id}`} state={navState}
                    data-event-id={t.id} data-status={t.status} data-overdue={t.overdue || undefined}
                    aria-label={`${t.title} — ${STATUS_LABEL[t.status] ?? t.status}${t.overdue ? ' — quá hạn' : ''}`}
                    className="gcal-event" title={`${t.title} — ${STATUS_LABEL[t.status] ?? t.status}${t.overdue ? ' — quá hạn' : ''}`}>
                    <span className="min-w-0 truncate">{t.title}</span>
                  </Link>
                ))}
                {tasks.length > MAX_PREVIEW && (
                  <button type="button" data-cal-overflow={date} onClick={() => onSelect(date)}
                    aria-label={`${VN_DATE(date)} — xem ${tasks.length} công việc`}
                    className="gcal-overflow">+{tasks.length - MAX_PREVIEW} nữa</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
