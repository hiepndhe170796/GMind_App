import { useCallback, useRef, useState, type ChangeEvent } from 'react';
import Button from '../ui/Button';
import Icon from '../ui/Icon';
import { useToast } from '../ui/Toast';
import { ACCEPT, validateClientFile } from '../../utils/file-rules';

interface QueueRow {
  id: number; name: string; file: File;
  status: 'queued' | 'uploading' | 'error';
  progress: number; message?: string;
  abort: AbortController;
}

export type UploadFn = (file: File, opts: { onProgress?: (pct: number) => void; signal?: AbortSignal }) => Promise<unknown>;

/** Dropzone + sequential upload queue with per-file progress, abort and errors. */
export default function FileUploader({ upload, onUploaded, busy }: {
  upload: UploadFn; onUploaded: () => void; busy?: boolean;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const rowsRef = useRef<QueueRow[]>([]);
  const queueRef = useRef<QueueRow[]>([]);
  const workingRef = useRef(false);
  const doneCountRef = useRef(0);
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [rejects, setRejects] = useState<{ id: number; name: string; message: string }[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [sending, setSending] = useState(false);
  const idRef = useRef(0);

  const sync = () => setRows([...rowsRef.current]);
  const patch = (id: number, p: Partial<QueueRow>) => {
    const row = rowsRef.current.find(r => r.id === id);
    if (row) Object.assign(row, p);
    sync();
  };

  // One worker drains the queue; files added while it runs are picked up next.
  const pump = useCallback(async () => {
    if (workingRef.current) return;
    workingRef.current = true;
    setSending(true);
    while (queueRef.current.length > 0) {
      const row = queueRef.current.shift()!;
      patch(row.id, { status: 'uploading' });
      try {
        await upload(row.file, {
          signal: row.abort.signal,
          onProgress: pct => patch(row.id, { progress: pct }),
        });
        rowsRef.current = rowsRef.current.filter(r => r.id !== row.id);
        doneCountRef.current++;
        sync();
      } catch (e) {
        patch(row.id, {
          status: 'error',
          message: row.abort.signal.aborted ? 'Đã hủy tải lên.'
            : (typeof (e as { message?: unknown })?.message === 'string' ? (e as { message: string }).message : 'Không tải lên được tệp.'),
        });
      }
    }
    workingRef.current = false;
    setSending(false);
    const done = doneCountRef.current;
    doneCountRef.current = 0;
    if (done > 0) { toast.success(`Đã tải lên ${done} tệp.`); onUploaded(); }
  }, [upload, onUploaded, toast]);

  const enqueue = useCallback((files: File[]) => {
    if (!files.length) return;
    const good: QueueRow[] = [];
    for (const f of files) {
      const err = validateClientFile(f);
      if (err) setRejects(r => [...r, { id: ++idRef.current, name: f.name, message: err }]);
      else good.push({ id: ++idRef.current, name: f.name, file: f, status: 'queued', progress: 0, abort: new AbortController() });
    }
    queueRef.current.push(...good);
    rowsRef.current = [...rowsRef.current, ...good];
    sync();
    void pump();
  }, [pump]);

  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files ? [...e.target.files] : [];
    e.target.value = '';
    enqueue(list);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (busy) return;
    enqueue([...e.dataTransfer.files]);
  };
  const cancelRow = (row: QueueRow) => {
    if (row.status === 'queued') {
      queueRef.current = queueRef.current.filter(r => r.id !== row.id);
      rowsRef.current = rowsRef.current.filter(r => r.id !== row.id);
      sync();
    } else if (row.status === 'uploading') {
      row.abort.abort();
    }
  };

  return (
    <div className="mt-4 border-t border-line pt-4">
      <div
        role="region" aria-label="Tải tệp lên"
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`hidden rounded-xl border-2 border-dashed px-4 py-6 text-center text-small transition-colors sm:block
          ${dragOver ? 'border-primary-500 bg-primary-50' : 'border-line bg-surface-subtle/40'}`}>
        <Icon name="upload" size={22} className="mx-auto text-ink-muted" />
        <p className="mt-2 text-ink-secondary">
          Kéo thả tệp vào đây hoặc{' '}
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
            className="font-medium text-primary-700 underline underline-offset-2 hover:text-primary-600 min-h-11">
            chọn tệp
          </button>{' '}
          · tối đa 10 MB mỗi tệp
        </p>
      </div>
      <div className="sm:hidden">
        <Button type="button" variant="secondary" className="w-full min-h-11 gap-1.5"
          disabled={busy} onClick={() => inputRef.current?.click()}>
          <Icon name="upload" size={16} />Tải tệp lên
        </Button>
      </div>
      <input ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden" aria-hidden="true" tabIndex={-1} onChange={pick} />

      {rejects.length + rows.length > 0 && (
        <ul className="mt-3 space-y-2">
          {rejects.map(r => (
            <li key={`rej-${r.id}`} role="alert" className="flex items-center gap-2 rounded-lg bg-danger-50 px-3 py-2 text-small text-danger-700 min-w-0">
              <span className="min-w-0 flex-1"><span className="font-medium">{r.name}</span> — {r.message}</span>
              <button type="button" aria-label={`Bỏ qua ${r.name}`} onClick={() => setRejects(x => x.filter(y => y.id !== r.id))}
                className="flex h-9 w-9 max-sm:h-11 max-sm:w-11 shrink-0 items-center justify-center rounded-lg hover:bg-danger-100">
                <Icon name="close" size={14} />
              </button>
            </li>
          ))}
          {rows.map(r => (
            <li key={r.id} className="min-w-0">
              <div className="flex items-center gap-2 text-small min-w-0">
                <Icon name="file" size={15} className="shrink-0 text-ink-muted" />
                <span className="min-w-0 flex-1 truncate text-ink" title={r.name}>{r.name}</span>
                {r.status === 'error' ? (
                  <button type="button" aria-label={`Đóng lỗi tải ${r.name}`}
                    onClick={() => { rowsRef.current = rowsRef.current.filter(x => x.id !== r.id); sync(); }}
                    className="flex h-9 w-9 max-sm:h-11 max-sm:w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-subtle">
                    <Icon name="close" size={14} />
                  </button>
                ) : (
                  <button type="button" onClick={() => cancelRow(r)}
                    className="min-h-9 max-sm:min-h-11 max-sm:-my-1 rounded-lg px-2 text-small font-medium text-ink-secondary hover:bg-surface-subtle">
                    Hủy
                  </button>
                )}
              </div>
              {r.status === 'uploading' && (
                <div role="progressbar" aria-valuenow={r.progress} aria-valuemin={0} aria-valuemax={100}
                  aria-label={`Đang tải ${r.name}`}
                  className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-subtle">
                  <div className="h-full rounded-full bg-primary-500 transition-[width]" style={{ width: `${r.progress}%` }} />
                </div>
              )}
              {r.status === 'error' && <p className="mt-0.5 text-caption text-danger-700">{r.message}</p>}
            </li>
          ))}
        </ul>
      )}
      <span className="hidden">{sending ? '' : ''}</span>
    </div>
  );
}
