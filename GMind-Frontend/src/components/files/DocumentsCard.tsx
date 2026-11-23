import { useId, useRef, useState } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Icon from '../ui/Icon';
import { useToast } from '../ui/Toast';
import FileRow from './FileRow';
import FileUploader, { type UploadFn } from './FileUploader';
import { filesService, type FileDto } from '../../services/files';
import { formatDateTime } from '../../utils/presentation';
import type { LinkDto } from '../../services/tasks';

const hostname = (u: string) => { try { return new URL(u).hostname; } catch { return u; } };
const httpUrl = (v: string): string | null => {
  const t = v.trim();
  if (!/^https?:\/\//i.test(t)) return null;
  try { const p = new URL(t); return p.protocol === 'http:' || p.protocol === 'https:' ? t : null; }
  catch { return null; }
};
const errMsg = (e: unknown, fb: string) =>
  typeof (e as { message?: unknown })?.message === 'string' && (e as { message: string }).message ? (e as { message: string }).message : fb;

export default function DocumentsCard({ title, links, files, canAdd, uploadFn, onAddLink, onDeleteLink, onDeleteFile, emptyText, busy, onFilesChanged }: {
  title: string;
  links: LinkDto[];
  files: FileDto[];
  canAdd: boolean;
  uploadFn: UploadFn;
  onAddLink?: (url: string, name?: string) => Promise<void> | void;
  onDeleteLink?: (link: LinkDto) => void;
  onDeleteFile?: (file: FileDto) => void;
  emptyText: string;
  busy?: boolean;
  /** Called after uploads complete (parent invalidates). */
  onFilesChanged?: () => void;
}) {
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [linkError, setLinkError] = useState('');
  const [addingLink, setAddingLink] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const urlRef = useRef<HTMLInputElement>(null);
  const formId = useId();
  const merged = [...links.map(l => ({ t: 'link' as const, l, at: l.createdAt })),
    ...files.map(f => ({ t: 'file' as const, f, at: f.createdAt }))]
    .sort((a, b) => b.at.localeCompare(a.at));

  const download = async (file: FileDto) => {
    try {
      await filesService.downloadFile(file);
    } catch (e) {
      toast.error(errMsg(e, 'Không tải được tệp.'));
    }
  };

  const submitLink = async () => {
    if (addingLink || !onAddLink) return;
    if (!httpUrl(url)) { setLinkError('Liên kết phải bắt đầu bằng http:// hoặc https://.'); urlRef.current?.focus(); return; }
    setAddingLink(true);
    try {
      await onAddLink(url.trim(), name.trim() || undefined);
      setUrl(''); setName(''); setLinkError(''); setLinkOpen(false);
    } catch (e) {
      setLinkError(errMsg(e, 'Không thể thêm liên kết.'));
      urlRef.current?.focus();
    } finally {
      setAddingLink(false);
    }
  };

  return (
    <Card className="p-4 sm:p-6">
      <h3 className="text-section font-semibold text-ink">{title}</h3>
      {merged.length === 0 ? (
        <p className="mt-3 text-small text-ink-muted">{emptyText}</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {merged.map(item => item.t === 'link' ? (() => {
            const l = item.l;
            const safe = httpUrl(l.url);
            return (
              <li key={`link-${l.id}`} className="flex items-center gap-3 py-2.5 min-w-0">
                <Icon name="link" size={16} className="shrink-0 text-ink-muted" />
                <div className="min-w-0 flex-1">
                  {safe ? (
                    <a href={safe} target="_blank" rel="noopener noreferrer"
                      className="block truncate max-sm:py-[13px] max-sm:-my-3 text-small font-medium text-primary-700 hover:underline">
                      {l.displayName || l.url}<span className="sr-only"> (mở tab mới)</span>
                    </a>
                  ) : <span className="block truncate text-small text-ink-muted">{l.displayName || l.url}</span>}
                  <p className="truncate text-caption text-ink-muted">
                    {safe && l.displayName ? `${hostname(l.url)} · ` : ''}{l.createdByName ? `${l.createdByName} · ` : ''}{formatDateTime(l.createdAt)}
                  </p>
                </div>
                {onDeleteLink && l.canDelete && (
                  <button type="button" aria-label={`Xóa tài liệu ${l.displayName || l.url}`} disabled={busy}
                    onClick={() => onDeleteLink(l)}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-danger-50 hover:text-danger-600 disabled:opacity-50">
                    <Icon name="close" size={16} />
                  </button>
                )}
              </li>
            );
          })() : (
            <FileRow key={`file-${item.f.id}`} file={item.f} busy={busy}
              onDownload={download} onDelete={onDeleteFile} />
          ))}
        </ul>
      )}
      {canAdd && (
        <>
          <FileUploader upload={uploadFn} busy={busy} onUploaded={() => onFilesChanged?.()} />
          {onAddLink && (
            <div className="mt-3">
              <Button type="button" variant="secondary" size="sm" aria-expanded={linkOpen} aria-controls={formId}
                onClick={() => { setLinkOpen(o => !o); if (!linkOpen) requestAnimationFrame(() => urlRef.current?.focus()); }}>
                Thêm liên kết
              </Button>
              {linkOpen && (
                <form id={formId} noValidate className="mt-3"
                  onSubmit={e => { e.preventDefault(); void submitLink(); }}>
                  <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                    <Input id="doc-link-name" label="Tên hiển thị" placeholder="Tên tài liệu (không bắt buộc)" maxLength={200}
                      value={name} disabled={busy || addingLink} onChange={e => setName(e.target.value)} />
                    <Input id="doc-link-url" ref={urlRef} label="Liên kết" type="url" placeholder="https://..." maxLength={2000}
                      value={url} disabled={busy || addingLink} error={linkError}
                      onChange={e => { setUrl(e.target.value); if (linkError) setLinkError(''); }} />
                    <Button type="submit" variant="secondary" disabled={busy} isLoading={addingLink}>Thêm tài liệu</Button>
                  </div>
                </form>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
