import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Button from '../ui/Button';
import ConfirmationDialog from '../workspace/ConfirmationDialog';
import DocumentsCard from '../files/DocumentsCard';
import { useToast } from '../ui/Toast';
import { qk } from '../../services/query-keys';
import { filesService, type FileDto } from '../../services/files';
import { projectLinks } from '../../services/projects';
import { tasksService, type LinkDto } from '../../services/tasks';
import type { UploadFn } from '../files/FileUploader';

const errMsg = (e: unknown, fb: string) =>
  typeof (e as { message?: unknown })?.message === 'string' && (e as { message: string }).message ? (e as { message: string }).message : fb;

/** Project documents tab: shared links + uploaded files in one merged card. */
export default function ProjectDocuments({ projectId, uid, canAdd, busy }: {
  projectId: string; uid: string; canAdd: boolean; busy?: boolean;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [confirmLink, setConfirmLink] = useState<LinkDto | null>(null);
  const [confirmFile, setConfirmFile] = useState<FileDto | null>(null);

  const linksQ = useQuery({
    queryKey: qk.projectLinks(uid, projectId), queryFn: () => projectLinks.links(projectId),
    enabled: !!uid && !!projectId,
  });
  const filesQ = useQuery({
    queryKey: qk.projectFiles(uid, projectId), queryFn: () => filesService.listProjectFiles(projectId),
    enabled: !!uid && !!projectId,
  });
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: qk.projectLinks(uid, projectId) });
    void qc.invalidateQueries({ queryKey: qk.projectFiles(uid, projectId) });
  };

  const addLinkM = useMutation({
    mutationFn: ({ url, name }: { url: string; name?: string }) => projectLinks.addLink(projectId, url, name),
    onSuccess: () => { invalidate(); toast.success('Đã thêm tài liệu.'); },
    onError: e => { toast.error(errMsg(e, 'Không thêm được tài liệu.')); throw e; },
  });
  const deleteLinkM = useMutation({
    mutationFn: (linkId: string) => tasksService.deleteLink(linkId),
    onSuccess: () => { setConfirmLink(null); invalidate(); toast.success('Đã xóa tài liệu.'); },
    onError: e => toast.error(errMsg(e, 'Không xóa được tài liệu.')),
  });
  const deleteFileM = useMutation({
    mutationFn: (fileId: string) => filesService.deleteFile(fileId),
    onSuccess: () => { setConfirmFile(null); invalidate(); toast.success('Đã xóa tệp.'); },
    onError: e => toast.error(errMsg(e, 'Không xóa được tệp.')),
  });

  const uploadFn: UploadFn = (file, opts) => filesService.uploadProjectFile(projectId, file, opts);

  const loading = linksQ.isPending || filesQ.isPending;
  const loadError = linksQ.error ?? filesQ.error;

  if (loading) {
    return (
      <div className="rounded-2xl border border-line bg-white p-4 sm:p-6">
        <p role="status" className="text-small text-ink-muted">Đang tải tài liệu…</p>
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="rounded-2xl border border-line bg-white p-4 sm:p-6">
        <p role="alert" className="text-small text-danger-700">{errMsg(loadError, 'Không tải được tài liệu.')}</p>
        <Button variant="secondary" size="sm" className="mt-2" onClick={invalidate}>Thử lại</Button>
      </div>
    );
  }

  return (
    <>
      <DocumentsCard
        title="Tài liệu dự án"
        links={linksQ.data ?? []}
        files={filesQ.data ?? []}
        canAdd={canAdd}
        busy={busy}
        uploadFn={uploadFn}
        onAddLink={canAdd ? async (url, name) => { await addLinkM.mutateAsync({ url, name }); } : undefined}
        onDeleteLink={setConfirmLink}
        onDeleteFile={setConfirmFile}
        onFilesChanged={invalidate}
        emptyText="Chưa có tài liệu nào. Tải tệp lên hoặc thêm liên kết dùng chung cho dự án."
      />
      <ConfirmationDialog open={!!confirmLink} title="Xóa tài liệu" busy={deleteLinkM.isPending} onClose={() => setConfirmLink(null)}>
        <p>Xóa liên kết “{confirmLink?.displayName || confirmLink?.url}”?</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" disabled={deleteLinkM.isPending} onClick={() => setConfirmLink(null)}>Hủy</Button>
          <Button variant="danger" isLoading={deleteLinkM.isPending}
            onClick={() => confirmLink && deleteLinkM.mutate(confirmLink.id)}>Xóa</Button>
        </div>
      </ConfirmationDialog>
      <ConfirmationDialog open={!!confirmFile} title="Xóa tệp" busy={deleteFileM.isPending} onClose={() => setConfirmFile(null)}>
        <p>Xóa tệp “{confirmFile?.name}”?</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" disabled={deleteFileM.isPending} onClick={() => setConfirmFile(null)}>Hủy</Button>
          <Button variant="danger" isLoading={deleteFileM.isPending}
            onClick={() => confirmFile && deleteFileM.mutate(confirmFile.id)}>Xóa</Button>
        </div>
      </ConfirmationDialog>
    </>
  );
}
