import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../ui/Icon';
import Button from '../ui/Button';
import Illustration, { type IllustrationName } from '../ui/Illustration';


export function Breadcrumb({ items, hideCurrentBelowSm = false }: { items: { label: string; to?: string }[]; hideCurrentBelowSm?: boolean }) {
  return (
    <nav aria-label="Đường dẫn" className="flex flex-wrap items-center gap-1.5 text-sm">
      {items.map((it, i) => (
        <span key={i} className={`flex items-center gap-1.5 min-w-0${hideCurrentBelowSm && i === items.length - 1 ? ' max-sm:hidden' : ''}`}>
          {i > 0 && <Icon name="chevron-right" size={14} className="text-ink-muted" />}
          {it.to
            ? <Link to={it.to} className="min-h-9 max-sm:min-h-11 inline-flex items-center text-primary-700 font-medium hover:underline">{it.label}</Link>
            : <span className="text-ink-muted [overflow-wrap:anywhere]" aria-current="page">{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export function Skeleton({ label }: { label: string }) {
  return (
    <>
      <p role="status" className="sr-only">{label}</p>
      <div aria-hidden="true" className="space-y-4 motion-safe:animate-pulse">
        <div className="h-8 w-56 rounded bg-surface-subtle" />
        <div className="grid gap-4 sm:grid-cols-2">{[0, 1, 2, 3].map(i => <div key={i} className="h-24 rounded-2xl bg-surface-subtle" />)}</div>
      </div>
    </>
  );
}

export function ErrorState({ message, onRetry, backTo, backLabel }: { message: string; onRetry?: () => void; backTo?: string; backLabel?: string }) {
  return (
    <div>
      <p role="alert" className="flex items-start gap-1.5 text-sm text-danger-700 [overflow-wrap:anywhere]"><Icon name="alert" size={16} className="mt-0.5 shrink-0" />{message}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {onRetry && <Button variant="secondary" className="min-h-11" onClick={onRetry}>Thử lại</Button>}
        {backTo && <Link to={backTo} className="min-h-11 inline-flex items-center text-primary-700 font-medium hover:underline">{backLabel ?? 'Quay lại'}</Link>}
      </div>
    </div>
  );
}

export function EmptyState({ title, body, action, illustration }: { title: string; body: string; action?: ReactNode; illustration?: IllustrationName }) {
  return (
    <div className="py-8 text-center">
      {illustration && <Illustration name={illustration} className="mx-auto h-[88px] w-[120px]" />}
      <p className="mt-2 text-body font-semibold text-ink">{title}</p>
      <p className="mt-1 text-small text-ink-secondary mx-auto max-w-[46ch]">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
