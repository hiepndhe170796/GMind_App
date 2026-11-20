import { useRef, useState } from 'react';
import ConfirmationDialog from '../workspace/ConfirmationDialog';
import Button from '../ui/Button';

export function SubmitTaskDialog({ busy, blockedReason, onClose, onSubmit }: {
  busy: boolean;
  /** When set, submission is disabled and this reason is shown (e.g. open subtasks). */
  blockedReason?: string;
  onClose: () => void;
  onSubmit: (note: string) => void;
}) {
  const [note, setNote] = useState('');
  const sentRef = useRef(false);
  const submit = () => {
    if (sentRef.current || blockedReason) return;
    sentRef.current = true;
    onSubmit(note.trim());
  };
  return (
    <ConfirmationDialog open title="Nộp công việc để duyệt" busy={busy} onClose={onClose}>
      <p>Kiểm tra tài liệu đính kèm trước khi nộp. Trưởng nhóm sẽ được thông báo để duyệt công việc.</p>
      {blockedReason && (
        <p role="alert" className="mt-3 rounded-xl bg-warning-50 px-3 py-2 text-small text-warning-700">{blockedReason}</p>
      )}
      <label htmlFor="submit-note" className="mt-4 block text-small font-semibold text-ink-secondary">Ghi chú bàn giao (không bắt buộc)</label>
      <textarea id="submit-note" rows={3} maxLength={2000} value={note} disabled={busy || !!blockedReason} onChange={e => setNote(e.target.value)}
        placeholder="Ví dụ: đã hoàn thành phần A, link demo ở tài liệu đính kèm…"
        className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-body" />
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" disabled={busy} onClick={onClose}>Hủy</Button>
        <Button isLoading={busy} disabled={!!blockedReason} onClick={submit}>Nộp để duyệt</Button>
      </div>
    </ConfirmationDialog>
  );
}

export function RequestChangesDialog({ busy, onClose, onSubmit }: {
  busy: boolean;
  onClose: () => void;
  onSubmit: (comment: string) => void;
}) {
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const sentRef = useRef(false);
  const submit = () => {
    if (sentRef.current) return;
    if (!comment.trim()) { setError('Hãy nhập nhận xét để người phụ trách biết cần chỉnh gì.'); return; }
    sentRef.current = true;
    onSubmit(comment.trim());
  };
  return (
    <ConfirmationDialog open title="Yêu cầu chỉnh sửa" busy={busy} onClose={onClose}>
      <p>Nhận xét sẽ được gửi tới người phụ trách để họ chỉnh sửa và nộp lại.</p>
      <label htmlFor="changes-comment" className="mt-4 block text-small font-semibold text-ink-secondary">Nhận xét <span aria-hidden="true" className="text-danger-600">*</span></label>
      <textarea id="changes-comment" rows={3} maxLength={2000} value={comment} disabled={busy} aria-invalid={!!error}
        aria-describedby={error ? 'changes-comment-error' : undefined}
        onChange={e => { setComment(e.target.value); if (error) setError(''); }}
        placeholder="Ví dụ: bổ sung phần kiểm thử và cập nhật tài liệu…"
        className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-body" />
      {error && <p id="changes-comment-error" role="alert" className="mt-1 text-small text-danger-700">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" disabled={busy} onClick={onClose}>Hủy</Button>
        <Button isLoading={busy} onClick={submit}>Gửi yêu cầu</Button>
      </div>
    </ConfirmationDialog>
  );
}
