import { useEffect, useId, useRef, useState } from 'react';
import Button from '../ui/Button';
import Icon from '../ui/Icon';
import { ACCEPT, FILE_RULES, validateClientFile } from '../../utils/file-rules';
import { formatBytes } from '../../utils/presentation';
import type { MessageDto } from '../../services/discussion';
import { activeMentionQuery, excerpt, liveMentionIds, mentionCompleted, mentionListVisible, mentionMatches } from './discussion-model';

export interface ComposerMember { userId: string; displayName: string }
export interface ComposerSubmit { body: string; mentionUserIds: string[]; files: File[] }

const coarsePointer = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

/** Message composer: autosizing textarea, @mention combobox, reply chip, attachments. */
export default function DiscussionComposer({ members, meId, replyTo, onClearReply, onSubmit, editing, initial, onCancelEdit, externalError }: {
  members: ComposerMember[]; meId: string;
  replyTo?: MessageDto | null; onClearReply?: () => void;
  onSubmit: (input: ComposerSubmit, helpers: { onProgress: (p: number) => void }) => Promise<void>;
  editing?: boolean;
  initial?: { body: string; mentions: { userId: string; displayName: string }[] };
  onCancelEdit?: () => void;
  externalError?: string | null;
}) {
  const [body, setBody] = useState(initial?.body ?? '');
  const [mentions, setMentions] = useState(initial?.mentions ?? []);
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [caret, setCaret] = useState(0);
  const bodyId = useId();
  const coarseRef = useRef(coarsePointer());

  const rawMq = open ? activeMentionQuery(body, caret) : null;
  // A '@' that begins a completed picked mention is not a live query.
  const mq = rawMq && !mentionCompleted(body, rawMq.start, mentions) ? rawMq : null;
  const options = mq ? mentionMatches(members, mq.query, meId).slice(0, 6) : [];
  const showList = mq !== null && mentionListVisible(mq.query, options.length);

  const autosize = () => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 6 * 24)}px`;
  };
  useEffect(autosize, [body]);

  const onBodyChange = (v: string, pos: number) => {
    setBody(v); setCaret(pos);
    const q = activeMentionQuery(v, pos);
    setOpen(q !== null);
    setActive(0);
    if (error) setError('');
  };

  const pickMention = (m: ComposerMember) => {
    const q = activeMentionQuery(body, caret);
    if (!q) return;
    const next = `${body.slice(0, q.start)}@${m.displayName} ${body.slice(caret)}`;
    const pos = q.start + m.displayName.length + 2;
    setBody(next); setCaret(pos);
    setMentions(prev => prev.some(x => x.userId === m.userId) ? prev : [...prev, m]);
    setOpen(false);
    requestAnimationFrame(() => {
      const el = areaRef.current;
      el?.focus(); el?.setSelectionRange(pos, pos);
    });
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setFileError('');
    const incoming = [...list];
    if (files.length + incoming.length > FILE_RULES.MAX_ATTACHMENTS) {
      setFileError('Mỗi tin nhắn đính kèm tối đa 5 tệp.');
      return;
    }
    for (const f of incoming) {
      const err = validateClientFile(f);
      if (err) { setFileError(`${f.name}: ${err}`); return; }
    }
    setFiles(prev => [...prev, ...incoming]);
  };

  const send = async () => {
    if (sending) return;
    const text = body.trim();
    if (!editing && !text && files.length === 0) return;
    setSending(true); setError(''); setProgress(0);
    try {
      await onSubmit({ body: text, mentionUserIds: liveMentionIds(text, mentions), files },
        { onProgress: setProgress });
      if (!editing) { setBody(''); setMentions([]); setFiles([]); setFileError(''); onClearReply?.(); }
    } catch (e) {
      setError(typeof (e as { message?: unknown })?.message === 'string' ? (e as { message: string }).message : 'Không gửi được tin nhắn.');
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showList) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, options.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); return; }
      if ((e.key === 'Enter' || e.key === 'Tab') && options[active]) {
        e.preventDefault(); pickMention(options[active]); return;
      }
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false); return; }
    }
    if (e.key === 'Escape' && editing) { e.preventDefault(); onCancelEdit?.(); return; }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !coarseRef.current) {
      e.preventDefault();
      void send();
    }
  };

  const shownError = error || externalError || '';
  const canSend = editing ? !sending : !sending && (body.trim().length > 0 || files.length > 0);

  return (
    <div className="min-w-0">
      {replyTo && !editing && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-surface-subtle px-3 py-2 text-small min-w-0">
          <span className="min-w-0 flex-1 truncate text-ink-secondary">
            Đang trả lời <span className="font-semibold text-ink">{replyTo.authorName}</span>
            {replyTo.body && <span className="text-ink-muted"> · {excerpt(replyTo.body, 80)}</span>}
          </span>
          <button type="button" aria-label="Hủy trả lời" onClick={onClearReply}
            className="flex h-9 w-9 max-sm:h-11 max-sm:w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-white">
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
      {files.length > 0 && !editing && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-1.5 rounded-lg border border-line px-2 py-1 text-small min-w-0">
              <Icon name="file" size={13} className="shrink-0 text-ink-muted" />
              <span className="max-w-40 truncate" title={f.name}>{f.name}</span>
              <span className="shrink-0 text-caption tabular-nums text-ink-muted">{formatBytes(f.size)}</span>
              <button type="button" aria-label={`Bỏ tệp ${f.name}`} onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                className="flex h-7 w-7 max-sm:h-11 max-sm:w-11 items-center justify-center rounded-md text-ink-muted hover:bg-surface-subtle">
                <Icon name="close" size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {fileError && <p role="alert" className="mb-2 text-small text-danger-700">{fileError}</p>}
      <div className="relative">
        <div className="flex items-end gap-2">
          {!editing && (
            <>
              <button type="button" aria-label="Đính kèm tệp" disabled={sending}
                onClick={() => fileRef.current?.click()}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-muted hover:bg-surface-subtle hover:text-primary-700 disabled:opacity-50">
                <Icon name="paperclip" size={18} />
              </button>
              <input ref={fileRef} type="file" multiple accept={ACCEPT} className="hidden" aria-hidden="true" tabIndex={-1}
                onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
            </>
          )}
          <div className="relative min-w-0 flex-1">
            <label htmlFor={bodyId} className="sr-only">Tin nhắn</label>
            <textarea id={bodyId} ref={areaRef} rows={1} maxLength={4000} value={body}
              role="combobox" aria-autocomplete="list" aria-expanded={showList}
              aria-controls={showList ? listId : undefined}
              aria-activedescendant={showList && options[active] ? `${listId}-${active}` : undefined}
              placeholder="Nhập tin nhắn… Gõ @ để nhắc tên"
              disabled={sending}
              onChange={e => onBodyChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
              onSelect={e => setCaret((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
              onKeyDown={onKeyDown}
              className="w-full resize-none rounded-xl border border-line bg-white px-3 py-2.5 text-body disabled:opacity-60" />
            {showList && (
              <ul id={listId} role="listbox" aria-label="Gợi ý thành viên"
                className="absolute bottom-full left-0 z-20 mb-1 max-h-56 w-64 overflow-auto rounded-xl border border-line bg-white py-1 shadow-lg">
                {options.length === 0 ? (
                  <li className="px-3 py-2 text-small text-ink-muted" aria-disabled="true">Không có thành viên phù hợp</li>
                ) : options.map((m, i) => (
                  <li key={m.userId} id={`${listId}-${i}`} role="option" aria-selected={i === active}
                    onMouseDown={e => { e.preventDefault(); pickMention(m); }}
                    onMouseEnter={() => setActive(i)}
                    className={`cursor-pointer px-3 py-2 text-small ${i === active ? 'bg-primary-50 text-primary-700' : 'text-ink'}`}>
                    {m.displayName}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {editing ? (
            <div className="flex shrink-0 gap-2">
              <Button variant="secondary" className="min-h-11" disabled={sending} onClick={onCancelEdit}>Hủy</Button>
              <Button className="min-h-11" isLoading={sending} disabled={!body.trim() || sending} onClick={() => void send()}>Lưu</Button>
            </div>
          ) : (
            <button type="button" aria-label="Gửi" disabled={!canSend} onClick={() => void send()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-40">
              <Icon name="send" size={18} />
            </button>
          )}
        </div>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        {shownError ? <p role="alert" className="text-small text-danger-700">{shownError}</p> : <span />}
        {body.length >= 3800 && <span className="text-caption tabular-nums text-ink-muted">{body.length}/4000</span>}
      </div>
      {sending && files.length > 0 && (
        <div role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Đang tải tệp đính kèm"
          className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-subtle">
          <div className="h-full rounded-full bg-primary-500 transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
}
