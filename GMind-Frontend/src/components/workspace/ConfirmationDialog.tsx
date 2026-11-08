import { useEffect, useId, useRef, type ReactNode } from 'react';

export default function ConfirmationDialog({ open, title, children, onClose, busy }: {
  open: boolean; title: string; children: ReactNode; onClose: () => void; busy?: boolean;
}) {
  const busyRef = useRef(busy);
  const onCloseRef = useRef(onClose);
  useEffect(() => { busyRef.current = busy; onCloseRef.current = onClose; });
  if (!open) return null;
  return (
    <DialogShell title={title} busyRef={busyRef} onCloseRef={onCloseRef}>{children}</DialogShell>
  );
}

function DialogShell({ title, children, busyRef, onCloseRef }: {
  title: string; children: ReactNode;
  busyRef: { current: boolean | undefined };
  onCloseRef: { current: () => void };
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const prevOverflow = document.body.style.overflow;
    dlg.showModal();
    document.body.style.overflow = 'hidden';
    const onCancel = (e: Event) => { if (busyRef.current) e.preventDefault(); else onCloseRef.current(); };
    const onClick = (e: MouseEvent) => { if (e.target === dlg && !busyRef.current) onCloseRef.current(); };
    dlg.addEventListener('cancel', onCancel);
    dlg.addEventListener('click', onClick);
    return () => {
      dlg.removeEventListener('cancel', onCancel);
      dlg.removeEventListener('click', onClick);
      document.body.style.overflow = prevOverflow;
      if (dlg.open) dlg.close();
      if (returnTo?.isConnected) returnTo.focus();
    };
    // mount-only: captures once per open interval, restores on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <dialog ref={ref} aria-labelledby={titleId} className="bg-white">
      <div className="p-5 sm:p-6 overflow-y-auto max-h-[calc(100dvh-2rem)]">
        <h3 id={titleId} className="text-lg font-semibold text-slate-900">{title}</h3>
        <div className="mt-3 text-sm text-slate-700">{children}</div>
      </div>
    </dialog>
  );
}
