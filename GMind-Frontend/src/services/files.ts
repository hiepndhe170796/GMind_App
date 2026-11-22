import api from './api';
import { AxiosError } from 'axios';
import type { ApiError } from './api-errors';

export interface FileDto {
  id: string; kind: 'project' | 'task' | 'message' | 'avatar';
  projectId?: string | null; taskId?: string | null; messageId?: string | null;
  name: string; extension: string; contentType: string; sizeBytes: number;
  uploadedByUserId: string; uploadedByName: string; createdAt: string;
  isImage: boolean; canDelete: boolean;
}

export interface UploadOpts { onProgress?: (pct: number) => void; signal?: AbortSignal }

const unwrap = (d: unknown) => (d as { data: unknown }).data;

async function blobError(error: unknown): Promise<never> {
  // Downloads respond as blob — on error the envelope JSON is inside the blob.
  const err = error as AxiosError;
  const data = err?.response?.data;
  let message = 'Không tải được tệp.';
  let status = err?.response?.status;
  try {
    if (data instanceof Blob) {
      const parsed = JSON.parse(await data.text());
      if (typeof parsed?.message === 'string') message = parsed.message;
    } else if (typeof (data as { message?: unknown })?.message === 'string') {
      message = (data as { message: string }).message;
    }
  } catch { /* keep default */ }
  throw { message, status } as ApiError;
}

export const filesService = {
  async listProjectFiles(projectId: string): Promise<FileDto[]> {
    return unwrap((await api.get(`/api/projects/${projectId}/files`)).data) as FileDto[];
  },
  async listTaskFiles(taskId: string): Promise<FileDto[]> {
    return unwrap((await api.get(`/api/tasks/${taskId}/files`)).data) as FileDto[];
  },
  async uploadProjectFile(projectId: string, file: File, { onProgress, signal }: UploadOpts = {}): Promise<FileDto> {
    const fd = new FormData();
    fd.append('file', file, file.name);
    return unwrap((await api.post(`/api/projects/${projectId}/files`, fd, {
      signal,
      onUploadProgress: e => onProgress?.(e.total ? Math.round((e.loaded / e.total) * 100) : 0),
    })).data) as FileDto;
  },
  async uploadTaskFile(taskId: string, file: File, { onProgress, signal }: UploadOpts = {}): Promise<FileDto> {
    const fd = new FormData();
    fd.append('file', file, file.name);
    return unwrap((await api.post(`/api/tasks/${taskId}/files`, fd, {
      signal,
      onUploadProgress: e => onProgress?.(e.total ? Math.round((e.loaded / e.total) * 100) : 0),
    })).data) as FileDto;
  },
  async deleteFile(id: string): Promise<void> {
    await api.delete(`/api/files/${id}`);
  },
  async fetchFileBlob(id: string): Promise<Blob> {
    try {
      return (await api.get(`/api/files/${id}/content`, { responseType: 'blob' })).data as Blob;
    } catch (e) {
      await blobError(e);
      throw e;
    }
  },
  async downloadFile(file: { id: string; name: string }): Promise<void> {
    const blob = await this.fetchFileBlob(file.id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Safari/Firefox cancel a download whose URL is revoked on the same tick.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
