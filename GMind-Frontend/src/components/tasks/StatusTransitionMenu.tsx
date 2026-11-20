import { useEffect, useRef, useState } from 'react';
import Icon from '../ui/Icon';
import { buttonClasses } from '../ui/Button';

/** Vietnamese label for a target status given the task's current status. */
// eslint-disable-next-line react/only-export-components -- spec-mandated co-export of the label helper
export function transitionLabel(current: string, target: string): string {
  switch (target) {
    case 'InProgress':
      return current === 'ChangesRequested' ? 'Làm lại' : current === 'Completed' ? 'Mở lại' : 'Bắt đầu';
    case 'Submitted': return 'Nộp để duyệt';
    case 'ChangesRequested': return 'Yêu cầu chỉnh sửa';
    case 'Completed': return current === 'Submitted' ? 'Duyệt' : 'Hoàn thành';
    case 'ToDo': return 'Về Cần làm';
    default: return target;
  }
}

/**
 * Accessible alternative to drag-and-drop: lists the task's allowed target
 * statuses in a menu. The server-provided allowedTransitions drives the items.
 */
export default function StatusTransitionMenu({ current, targets, busy, onChoose, align = 'right' }: {
  current: string;
  targets: string[];
  busy?: boolean;
  onChoose: (target: string) => void;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick); };
  }, [open]);

  if (targets.length === 0) return null;
  return (
    <div ref={rootRef} className="relative">
      <button type="button" disabled={busy} aria-haspopup="menu" aria-expanded={open}
        aria-label="Chuyển trạng thái"
        onClick={() => setOpen(v => !v)}
        className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'min-h-11 min-w-11 justify-center gap-1 px-0 sm:min-h-9 sm:min-w-0 sm:px-3' })}>
        <Icon name="swap" size={16} className="sm:hidden" />
        <span className="hidden sm:inline">Chuyển trạng thái</span>
        <Icon name="chevron-down" size={14} className="hidden sm:inline" />
      </button>
      {open && (
        <div role="menu" aria-label="Chuyển trạng thái"
          className={`absolute z-40 mt-1 min-w-44 rounded-xl border border-line bg-white p-1 shadow-overlay ${align === 'right' ? 'right-0' : 'left-0'}`}>
          {targets.map(t => (
            <button key={t} type="button" role="menuitem" disabled={busy}
              onClick={() => { setOpen(false); onChoose(t); }}
              className="block w-full rounded-lg px-3 py-2 text-left text-small font-medium text-ink hover:bg-surface-subtle focus-visible:bg-surface-subtle focus-visible:outline-none">
              {transitionLabel(current, t)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
