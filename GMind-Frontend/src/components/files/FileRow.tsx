import Icon from '../ui/Icon';
import { useFileObjectUrl } from '../../hooks/use-file-object-url';
import { fileIconFor } from '../../utils/file-rules';
import { formatBytes, formatDateTime } from '../../utils/presentation';
import type { FileDto } from '../../services/files';

export default function FileRow({ file, busy, onDownload, onDelete }: {
  file: FileDto; busy?: boolean;
  onDownload: (file: FileDto) => void;
  onDelete?: (file: FileDto) => void;
}) {
  const { url, isError } = useFileObjectUrl(file.isImage ? file.id : null);
  return (
    <li className="flex items-center gap-3 py-2.5 min-w-0">
      {file.isImage && url && !isError ? (
        <img src={url} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-subtle text-ink-muted">
          <Icon name={fileIconFor(file.extension)} size={18} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-small font-medium text-ink" title={file.name}>{file.name}</p>
        <p className="truncate text-caption text-ink-muted">
          {formatBytes(file.sizeBytes)} · {file.uploadedByName} · {formatDateTime(file.createdAt)}
        </p>
      </div>
      <button type="button" aria-label={`Tải xuống ${file.name}`} disabled={busy}
        onClick={() => onDownload(file)}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-subtle hover:text-primary-700 disabled:opacity-50">
        <Icon name="download" size={17} />
      </button>
      {onDelete && file.canDelete && (
        <button type="button" aria-label={`Xóa tệp ${file.name}`} disabled={busy}
          onClick={() => onDelete(file)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-danger-50 hover:text-danger-600 disabled:opacity-50">
          <Icon name="close" size={16} />
        </button>
      )}
    </li>
  );
}
