import { useState } from 'react';
import Icon from '../ui/Icon';
import UserAvatar from '../account/UserAvatar';
import ActionMenu from '../ui/ActionMenu';
import Button from '../ui/Button';
import ConfirmationDialog from '../workspace/ConfirmationDialog';
import { useFileObjectUrl } from '../../hooks/use-file-object-url';
import { filesService, type FileDto } from '../../services/files';
import { fileIconFor } from '../../utils/file-rules';
import { formatBytes } from '../../utils/presentation';
import type { MessageDto } from '../../services/discussion';
import { excerpt, highlightSegments, vnMsgFull, vnMsgTime } from './discussion-model';
import { useToast } from '../ui/Toast';

const errMsg = (e: unknown, fb: string) =>
  typeof (e as { message?: unknown })?.message === 'string' && (e as { message: string }).message ? (e as { message: string }).message : fb;

function AttachmentThumb({ file }: { file: FileDto }) {
  const { url, isError } = useFileObjectUrl(file.id);
  const [open, setOpen] = useState(false);
  const [small, setSmall] = useState(false);
  const toast = useToast();
  const download = async () => {
    try { await filesService.downloadFile(file); }
    catch (e) { toast.error(errMsg(e, 'Không tải được tệp.')); }
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`Xem ảnh ${file.name}`}
        className="block overflow-hidden rounded-lg border border-line">
        {url && !isError ? (
          <span className="flex h-[120px] w-[160px] items-center justify-center bg-surface-subtle">
            <img src={url} alt={file.name}
              onLoad={e => setSmall(e.currentTarget.naturalWidth <= 160 && e.currentTarget.naturalHeight <= 120)}
              className={`h-[120px] w-[160px] ${small ? 'object-contain' : 'object-cover'}`} />
          </span>
        ) : (
          <span className="flex h-[120px] w-[160px] items-center justify-center bg-surface-subtle text-ink-muted">
            <Icon name="photo" size={20} />
          </span>
        )}
      </button>
      <ConfirmationDialog open={open} title={file.name} onClose={() => setOpen(false)} size="lg">
        <div className="flex max-h-[70dvh] items-center justify-center overflow-auto">
          {url && <img src={url} alt={file.name} className="max-h-[68dvh] max-w-full object-contain" />}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => void download()} className="gap-1.5">
            <Icon name="download" size={15} />Tải xuống
          </Button>
          <Button onClick={() => setOpen(false)}>Đóng</Button>
        </div>
      </ConfirmationDialog>
    </>
  );
}

function AttachmentRow({ file }: { file: FileDto }) {
  const toast = useToast();
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 min-w-0">
      <Icon name={fileIconFor(file.extension)} size={15} className="shrink-0 text-ink-muted" />
      <span className="min-w-0 flex-1 truncate text-small text-ink" title={file.name}>{file.name}</span>
      <span className="shrink-0 text-caption tabular-nums text-ink-muted">{formatBytes(file.sizeBytes)}</span>
      <button type="button" aria-label={`Tải xuống ${file.name}`}
        onClick={async () => { try { await filesService.downloadFile(file); } catch (e) { toast.error(errMsg(e, 'Không tải được tệp.')); } }}
        className="flex h-9 w-9 max-sm:h-11 max-sm:w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-subtle hover:text-primary-700">
        <Icon name="download" size={15} />
      </button>
    </div>
  );
}

export default function MessageItem({ msg, meId, runStart, editing, onReply, onEdit, onDelete, renderEdit }: {
  msg: MessageDto; meId: string; runStart: boolean; editing: boolean;
  onReply: (m: MessageDto) => void;
  onEdit: (m: MessageDto) => void;
  onDelete: (m: MessageDto) => void;
  /** Renders the inline editor (DiscussionComposer in edit mode). */
  renderEdit?: () => React.ReactNode;
}) {
  if (msg.isDeleted) {
    return (
      <li data-message-id={msg.id} className={`${runStart ? 'mt-3' : 'mt-0.5'} pl-10 text-small italic text-ink-muted`}>
        Tin nhắn đã bị xóa
      </li>
    );
  }
  const scrollToReply = () => {
    const el = document.querySelector(`[data-message-id="${msg.replyTo?.id}"]`);
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.add('msg-highlight');
      window.setTimeout(() => el.classList.remove('msg-highlight'), 1200);
    }
  };
  const originalLoaded = !msg.replyTo || !!document.querySelector(`[data-message-id="${msg.replyTo.id}"]`);
  return (
    <li data-message-id={msg.id} className={`group ${runStart ? 'mt-3' : 'mt-0.5'} rounded-lg transition-colors`}>
      {runStart && (
        <div className="flex items-baseline gap-2 min-w-0">
          <UserAvatar name={msg.authorName} url={msg.authorAvatarUrl} size={32} />
          <span className="min-w-0 flex-1 truncate text-small font-semibold text-ink">{msg.authorName}</span>
          <time dateTime={msg.createdAt} title={vnMsgFull(msg.createdAt)} className="shrink-0 text-caption text-ink-muted">{vnMsgTime(msg.createdAt)}</time>
        </div>
      )}
      <div className="flex items-start gap-2 min-w-0 pl-10">
        <div className="min-w-0 flex-1">
          {msg.replyTo && (
            <button type="button" onClick={scrollToReply}
              title={originalLoaded ? undefined : 'Tin nhắn gốc chưa được tải'}
              className="mb-1 block w-full rounded-md border-l border-line bg-surface-subtle/60 px-2.5 py-1.5 text-left text-small text-ink-secondary hover:bg-surface-subtle">
              <span className="font-medium">{msg.replyTo.isDeleted ? 'Tin nhắn đã bị xóa' : msg.replyTo.authorName}</span>
              {!msg.replyTo.isDeleted && <span className="block truncate text-ink-muted">{excerpt(msg.replyTo.excerpt)}</span>}
            </button>
          )}
          {editing ? renderEdit?.() : (
            <>
              <p className="whitespace-pre-wrap text-body text-ink [overflow-wrap:anywhere]">
                {highlightSegments(msg.body, msg.mentions, meId).map((s, i) =>
                  s.type === 'mention' ? (
                    <span key={i} className={s.isMe
                      ? 'rounded bg-primary-100 px-0.5 font-medium text-primary-800'
                      : 'rounded bg-accent-50 px-0.5 font-medium text-accent-700'}>{s.text}</span>
                  ) : <span key={i}>{s.text}</span>)}
              </p>
              {msg.updatedAt && <span className="text-caption text-ink-muted">đã sửa</span>}
              {msg.attachments.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {msg.attachments.map(f => f.isImage
                    ? <AttachmentThumb key={f.id} file={f} />
                    : <AttachmentRow key={f.id} file={f} />)}
                </div>
              )}
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!runStart && (
            <time dateTime={msg.createdAt} title={vnMsgFull(msg.createdAt)}
              className="text-caption text-ink-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100">
              {vnMsgTime(msg.createdAt)}
            </time>
          )}
          {!editing && (
            <span className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100">
              <ActionMenu chevron={false} ariaLabel="Thao tác tin nhắn" label={<Icon name="more-horizontal" size={16} />}
                triggerClassName="!min-h-11 !min-w-11 sm:!min-h-9 sm:!min-w-9 !px-0 rounded-lg text-ink-muted"
                items={[
                  { label: 'Trả lời', onSelect: () => onReply(msg) },
                  ...(msg.canEdit ? [{ label: 'Sửa', onSelect: () => onEdit(msg) }] : []),
                  ...(msg.canDelete ? [{ label: 'Xóa', danger: true, onSelect: () => onDelete(msg) }] : []),
                ]} />
            </span>
          )}
        </div>
      </div>
    </li>
  );
}
