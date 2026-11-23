import type { ReactNode } from 'react';

/**
 * Accessible toggle: a button with role="switch" whose accessible name is the
 * row label text. 44 px target, visible focus ring, animation reduced-motion aware.
 */
export default function Switch({ checked, onChange, label, description, disabled = false, id }: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <div className="relative flex items-center gap-3 min-h-11">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        aria-describedby={description ? `${id ?? label}-desc` : undefined}
        id={id}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-150 motion-reduce:transition-none
          after:absolute after:inset-0 after:content-['']
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2
          disabled:opacity-50 disabled:cursor-not-allowed ${checked ? 'bg-primary-600' : 'bg-ink-muted/40'}`}
      >
        <span
          aria-hidden="true"
          className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-150 motion-reduce:transition-none ${checked ? 'translate-x-6' : 'translate-x-1'}`}
        />
      </button>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description && <span id={`${id ?? label}-desc`} className="block text-caption text-ink-muted">{description}</span>}
      </span>
    </div>
  );
}
