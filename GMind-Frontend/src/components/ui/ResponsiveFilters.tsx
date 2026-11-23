import { useId, useState, type ReactNode } from 'react';
import Icon from './Icon';
import { buttonClasses } from './Button';

export default function ResponsiveFilters({ search, children, activeCount = 0 }: {
  search: ReactNode; children: ReactNode; activeCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">{search}</div>
        <button type="button" onClick={() => setOpen(v => !v)}
          aria-expanded={open} aria-controls={panelId}
          className={buttonClasses({ variant: 'secondary', className: 'min-w-11 shrink-0 gap-1 md:hidden' })}>
          Bộ lọc{activeCount > 0 ? ` (${activeCount})` : ''}
          <Icon name="chevron-down" size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      <div id={panelId} className={open ? '' : 'hidden md:block'}>{children}</div>
    </div>
  );
}
