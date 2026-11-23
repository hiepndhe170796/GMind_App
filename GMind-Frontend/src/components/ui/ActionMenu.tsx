import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import Icon from './Icon';
import { buttonClasses } from './Button';

export interface ActionMenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Explains a disabled item (title + aria-disabled hint). */
  disabledReason?: string;
}

/**
 * Accessible dropdown menu: aria-haspopup/expanded, role=menu/menuitem,
 * ArrowUp/Down/Home/End navigation, Enter/Space select, Esc returns focus
 * to the trigger, click-outside closes.
 */
export default function ActionMenu({ label, items, triggerClassName, align = 'end', chevron = true, ariaLabel }: {
  label: ReactNode;
  items: ActionMenuItem[];
  triggerClassName?: string;
  align?: 'start' | 'end';
  /** Set false for icon-only triggers (e.g. a "more" dots button). */
  chevron?: boolean;
  /** Accessible name for icon-only triggers. */
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const close = (focusTrigger = true) => {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const enabledIndex = (from: number, dir: 1 | -1) => {
    for (let i = 0; i < items.length; i++) {
      const idx = (from + dir * (i + 1) + items.length * (i + 1)) % items.length;
      if (!items[idx].disabled) return idx;
    }
    return from;
  };
  const focusItem = (idx: number) => { setActive(idx); itemRefs.current[idx]?.focus(); };

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); focusItem(enabledIndex(active, 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusItem(enabledIndex(active, -1)); }
    else if (e.key === 'Home') { e.preventDefault(); const i = items.findIndex(x => !x.disabled); if (i >= 0) focusItem(i); }
    else if (e.key === 'End') { e.preventDefault(); for (let i = items.length - 1; i >= 0; i--) if (!items[i].disabled) { focusItem(i); break; } }
    else if (e.key === 'Tab') close(false);
  };

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={ariaLabel}
        className={triggerClassName ?? buttonClasses({ variant: 'secondary', className: 'min-h-11 gap-1' })}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) {
            const first = items.findIndex(x => !x.disabled);
            setActive(first >= 0 ? first : 0);
          }
        }}
        onKeyDown={e => {
          if ((e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') && !open) {
            e.preventDefault();
            const first = e.key === 'ArrowUp'
              ? (() => { for (let i = items.length - 1; i >= 0; i--) if (!items[i].disabled) return i; return 0; })()
              : items.findIndex(x => !x.disabled);
            setOpen(true);
            setActive(first >= 0 ? first : 0);
          }
        }}
      >
        {label}
        {chevron && <Icon name="chevron-down" size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />}
      </button>
      {open && (
        <ul
          id={menuId}
          role="menu"
          className={`absolute z-40 mt-1 min-w-52 rounded-xl border border-line bg-surface p-1 shadow-lg ${align === 'end' ? 'right-0' : 'left-0'}`}
          onKeyDown={onMenuKeyDown}
        >
          {items.map((item, i) => (
            <li key={item.label} role="none">
              <button
                ref={el => { itemRefs.current[i] = el; }}
                type="button"
                role="menuitem"
                tabIndex={i === active ? 0 : -1}
                disabled={item.disabled}
                aria-disabled={item.disabled || undefined}
                title={item.disabled ? item.disabledReason : undefined}
                className={`flex w-full min-h-10 max-sm:min-h-11 items-center rounded-lg px-3 py-2 text-left text-sm font-medium
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600
                  ${item.danger ? 'text-danger-700 hover:bg-danger-50' : 'text-ink hover:bg-surface-subtle'}
                  disabled:cursor-not-allowed disabled:opacity-50`}
                onClick={() => { close(); item.onSelect(); }}
              >
                {item.label}
                {item.disabled && item.disabledReason && (
                  <span className="sr-only"> — {item.disabledReason}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
