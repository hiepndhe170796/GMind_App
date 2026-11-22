import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Icon from './Icon';

export type ToastTone = 'success' | 'error' | 'info';
export interface ToastAction { label: string; onAction: () => void }
export interface ToastOptions { title?: string; action?: ToastAction }
export interface ToastApi {
  success(message: string, options?: ToastOptions): void;
  error(message: string, options?: ToastOptions): void;
  info(message: string, options?: ToastOptions): void;
}

interface ToastItem { id: number; tone: ToastTone; title?: string; message: string; action?: ToastAction }

const ToastContext = createContext<ToastApi | null>(null);
const MAX_VISIBLE = 3;
const AUTO_DISMISS_MS = 5_000;

const toneClasses: Record<ToastTone, { icon: 'check' | 'alert' | 'bell'; iconClass: string; border: string }> = {
  success: { icon: 'check', iconClass: 'text-success-600', border: 'border-success-500/40' },
  error: { icon: 'alert', iconClass: 'text-danger-600', border: 'border-danger-500/40' },
  info: { icon: 'bell', iconClass: 'text-primary-600', border: 'border-primary-500/40' },
};

// eslint-disable-next-line react/only-export-components -- spec-mandated co-export of the useToast hook
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used within <ToastProvider>.');
  return api;
}

function ToastCard({ toast, onClose }: { toast: ToastItem; onClose: (id: number) => void }) {
  const remainingRef = useRef(AUTO_DISMISS_MS);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  const start = useCallback(() => {
    if (timerRef.current != null || remainingRef.current <= 0) return;
    startedAtRef.current = Date.now();
    timerRef.current = window.setTimeout(() => onClose(toast.id), remainingRef.current);
  }, [onClose, toast.id]);

  const pause = useCallback(() => {
    if (timerRef.current == null) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
    remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedAtRef.current));
  }, []);

  useEffect(() => {
    start();
    return () => { if (timerRef.current != null) window.clearTimeout(timerRef.current); };
  }, [start]);

  const tone = toneClasses[toast.tone];
  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      onMouseEnter={pause} onMouseLeave={start}
      onFocus={pause} onBlur={start}
      className={`motion-safe:animate-dialog-in pointer-events-auto flex w-full items-start gap-3 rounded-xl border bg-surface p-3 shadow-overlay ${tone.border}`}
    >
      <Icon name={tone.icon} size={18} className={`mt-0.5 shrink-0 ${tone.iconClass}`} />
      <div className="min-w-0 flex-1">
        {toast.title && <p className="text-small font-semibold text-ink">{toast.title}</p>}
        <p className="text-small text-ink-secondary">{toast.message}</p>
        {toast.action && (
          <button
            type="button"
            onClick={() => { toast.action!.onAction(); onClose(toast.id); }}
            className="mt-1.5 min-h-9 rounded-lg px-2 -ml-2 text-small font-semibold text-primary-700 hover:bg-primary-50"
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        aria-label="Đóng thông báo"
        onClick={() => onClose(toast.id)}
        className="shrink-0 rounded-md p-1 text-ink-muted hover:bg-surface-subtle hover:text-ink"
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}

/**
 * Global toast region — fixed bottom-right (full-width on mobile). Set the
 * `--gm-toast-offset` CSS var (e.g. by a page's sticky action bar) to lift the
 * region above overlapping chrome.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const close = useCallback((id: number) => {
    setToasts(list => list.filter(t => t.id !== id));
  }, []);

  const push = useCallback((tone: ToastTone, message: string, options?: ToastOptions) => {
    setToasts(list => [...list.slice(-(MAX_VISIBLE - 1)), { id: nextId.current++, tone, title: options?.title, message, action: options?.action }]);
  }, []);

  const api = useMemo<ToastApi>(() => ({
    success: (message, options) => push('success', message, options),
    error: (message, options) => push('error', message, options),
    info: (message, options) => push('info', message, options),
  }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-label="Thông báo"
        aria-live="polite"
        aria-relevant="additions"
        className="pointer-events-none fixed inset-x-4 z-[70] flex flex-col gap-2 sm:inset-x-auto sm:right-4 sm:w-96"
        style={{ bottom: 'calc(1rem + var(--gm-toast-offset, 0px))' }}
      >
        {toasts.map(t => <ToastCard key={t.id} toast={t} onClose={close} />)}
      </div>
    </ToastContext.Provider>
  );
}
