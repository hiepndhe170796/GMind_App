import api from './api';
import type { FileDto } from './files';

export interface MentionDto { userId: string; displayName: string }
export interface MessageReplyDto { id: string; authorName: string; excerpt: string | null; isDeleted: boolean }
export interface MessageDto {
  id: string; projectId: string; authorUserId: string; authorName: string;
  authorAvatarUrl?: string | null; body: string | null;
  createdAt: string; updatedAt?: string | null; isDeleted: boolean;
  replyTo?: MessageReplyDto | null; mentions: MentionDto[]; attachments: FileDto[];
  isMine: boolean; canEdit: boolean; canDelete: boolean;
}
export interface MessagePageDto { items: MessageDto[]; nextCursor: string | null }

export interface SendMessageInput {
  body?: string;
  replyToMessageId?: string;
  mentionUserIds?: string[];
  files?: File[];
}

const unwrap = (d: unknown) => (d as { data: unknown }).data;

export const discussionService = {
  async page(projectId: string, cursor?: string | null, take = 30): Promise<MessagePageDto> {
    return unwrap((await api.get(`/api/projects/${projectId}/messages`, {
      params: { take, cursor: cursor ?? undefined },
    })).data) as MessagePageDto;
  },
  async send(projectId: string, input: SendMessageInput,
    { onProgress, signal }: { onProgress?: (pct: number) => void; signal?: AbortSignal } = {}): Promise<MessageDto> {
    const fd = new FormData();
    if (input.body != null) fd.append('body', input.body);
    if (input.replyToMessageId) fd.append('replyToMessageId', input.replyToMessageId);
    for (const m of input.mentionUserIds ?? []) fd.append('mentionUserIds', m);
    for (const f of input.files ?? []) fd.append('files', f, f.name);
    return unwrap((await api.post(`/api/projects/${projectId}/messages`, fd, {
      signal,
      onUploadProgress: e => onProgress?.(e.total ? Math.round((e.loaded / e.total) * 100) : 0),
    })).data) as MessageDto;
  },
  async update(id: string, input: { body: string; mentionUserIds?: string[] }): Promise<MessageDto> {
    return unwrap((await api.patch(`/api/messages/${id}`, {
      body: input.body, mentionUserIds: input.mentionUserIds ?? [],
    })).data) as MessageDto;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/api/messages/${id}`);
  },
};
