import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../ui/Icon';
import Button from '../ui/Button';


export function Breadcrumb({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Đường dẫn" className="flex flex-wrap items-center gap-1.5 text-sm">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5 min-w-0">
          {i > 0 && <Icon name="chevron-right" size={14} className="text-slate-500" />}
          {it.to
            ? <Link to={it.to} className="min-h-9 inline-flex items-center text-primary-700 font-medium hover:underline">{it.label}</Link>
            : <span className="text-slate-600 [overflow-wrap:anywhere]" aria-current="page">{it.label}</span>}
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
        <div className="h-8 w-56 rounded bg-slate-100" />
        <div className="grid gap-4 sm:grid-cols-2">{[0, 1, 2, 3].map(i => <div key={i} className="h-24 rounded-2xl bg-slate-100" />)}</div>
      </div>
    </>
  );
}

export function ErrorState({ message, onRetry, backTo, backLabel }: { message: string; onRetry: () => void; backTo?: string; backLabel?: string }) {
  return (
    <div>
      <p role="alert" className="text-sm text-danger-700 [overflow-wrap:anywhere]">{message}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button variant="secondary" className="min-h-11" onClick={onRetry}>Thử lại</Button>
        {backTo && <Link to={backTo} className="min-h-11 inline-flex items-center text-primary-700 font-medium hover:underline">{backLabel ?? 'Quay lại'}</Link>}
      </div>
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="py-8 text-center">
      <p className="font-medium text-slate-900">{title}</p>
      <p className="mt-1 text-sm text-slate-600">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
