import { STATUS_LABEL } from '../../utils/presentation';

export type TaskStatusName = 'ToDo' | 'InProgress' | 'Submitted' | 'ChangesRequested' | 'Completed';

const ORDER: { key: TaskStatusName; bar: string; dot: string }[] = [
  { key: 'ToDo', bar: 'bg-slate-300', dot: 'bg-slate-300' },
  { key: 'InProgress', bar: 'bg-primary-500', dot: 'bg-primary-500' },
  { key: 'Submitted', bar: 'bg-accent-500', dot: 'bg-accent-500' },
  { key: 'ChangesRequested', bar: 'bg-warning-500', dot: 'bg-warning-500' },
  { key: 'Completed', bar: 'bg-success-600', dot: 'bg-success-600' },
];

export interface StatusBarProps {
  counts: Partial<Record<TaskStatusName, number>>;
  overdue?: number;
  size?: 'sm' | 'md';
  showLegend?: boolean;
}

export default function StatusBar({ counts, overdue = 0, size = 'md', showLegend = true }: StatusBarProps) {
  const total = ORDER.reduce((sum, s) => sum + (counts[s.key] ?? 0), 0);
  const ariaLabel = total === 0
    ? 'Chưa có công việc'
    : `Tiến độ công việc: ${ORDER.filter(s => (counts[s.key] ?? 0) > 0)
        .map(s => `${counts[s.key]} ${STATUS_LABEL[s.key]}`).join(', ')}`;

  return (
    <div className="min-w-0">
      <div
        role="img"
        aria-label={ariaLabel}
        className={`flex w-full overflow-hidden rounded-full bg-surface-subtle ${size === 'sm' ? 'h-1.5' : 'h-2'}`}
      >
        {total > 0 && ORDER.map(s => {
          const count = counts[s.key] ?? 0;
          if (count === 0) return null;
          return (
            <span
              key={s.key}
              className={`${s.bar} h-full`}
              style={{ width: `${(count / total) * 100}%` }}
            />
          );
        })}
      </div>
      {total === 0 ? (
        <p className="mt-1.5 text-caption text-ink-muted">Chưa có công việc</p>
      ) : showLegend ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption tabular-nums text-ink-secondary">
          {ORDER.map(s => {
            const count = counts[s.key] ?? 0;
            if (count === 0) return null;
            return (
              <span key={s.key} className="inline-flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${s.dot}`} aria-hidden="true" />
                {STATUS_LABEL[s.key]} <span className="font-medium text-ink">{count}</span>
              </span>
            );
          })}
          {overdue > 0 && (
            <span className="inline-flex items-center rounded-full bg-danger-50 px-2 py-0.5 font-medium text-danger-700">
              {overdue} quá hạn
            </span>
          )}
        </div>
      ) : overdue > 0 ? (
        <div className="mt-1.5">
          <span className="inline-flex items-center rounded-full bg-danger-50 px-2 py-0.5 text-caption font-medium text-danger-700">
            {overdue} quá hạn
          </span>
        </div>
      ) : null}
    </div>
  );
}
