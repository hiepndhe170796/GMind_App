import api from './api';

export interface TaskSummaryDto {
  id: string; projectId: string; parentTaskId?: string | null; title: string;
  assigneeUserId?: string | null; assigneeName?: string | null; status: string; priority: string;
  deadlineAt?: string | null; canViewDetails: boolean;
}
export interface TaskDetailDto extends TaskSummaryDto {
  canViewDetails: true; description?: string | null; estimateHours?: number | null; points?: number | null;
  progressPercent: number; createdByUserId: string; createdAt: string;
  submittedAt?: string | null; completedAt?: string | null;
}
export type TaskDto = TaskSummaryDto | TaskDetailDto;
export function hasTaskDetails(task: TaskDto): task is TaskDetailDto {
  return task.canViewDetails && 'progressPercent' in task;
}

// Status enum values matching backend TaskStatus
export const TaskStatus = { ToDo: 1, InProgress: 2, Submitted: 3, ChangesRequested: 4, Completed: 5 } as const;

export const tasksService = {
  async list(projectId: string): Promise<TaskSummaryDto[]> {
    return (await api.get(`/api/projects/${projectId}/tasks`)).data.data;
  },
  async create(projectId: string, data: {
    title: string; description?: string; assigneeUserId?: string; parentTaskId?: string;
    priority?: number; deadlineAt?: string; estimateHours?: number; points?: number;
  }): Promise<TaskDetailDto> {
    return (await api.post(`/api/projects/${projectId}/tasks`, data)).data.data;
  },
  async update(id: string, data: { title: string; description?: string; priority?: number; deadlineAt?: string; estimateHours?: number; points?: number }): Promise<TaskDetailDto> {
    return (await api.patch(`/api/tasks/${id}`, data)).data.data;
  },
  async assign(id: string, assigneeUserId?: string): Promise<TaskDetailDto> {
    return (await api.post(`/api/tasks/${id}/assign`, { assigneeUserId })).data.data;
  },
  async changeStatus(id: string, status: number, comment?: string): Promise<TaskDetailDto> {
    return (await api.post(`/api/tasks/${id}/status`, { status, comment })).data.data;
  },
  async get(id: string): Promise<TaskDto> {
    return (await api.get(`/api/tasks/${id}`)).data.data;
  },
  async comments(taskId: string): Promise<CommentDto[]> {
    return (await api.get(`/api/tasks/${taskId}/comments`)).data.data;
  },
  async addComment(taskId: string, body: string): Promise<CommentDto> {
    return (await api.post(`/api/tasks/${taskId}/comments`, { body })).data.data;
  },
  async deleteComment(commentId: string) {
    return (await api.delete(`/api/comments/${commentId}`)).data;
  },
  async links(taskId: string): Promise<LinkDto[]> {
    return (await api.get(`/api/tasks/${taskId}/links`)).data.data;
  },
  async addLink(taskId: string, url: string, displayName?: string): Promise<LinkDto> {
    return (await api.post(`/api/tasks/${taskId}/links`, { url, displayName })).data.data;
  },
  async reviews(taskId: string): Promise<ReviewDto[]> {
    return (await api.get(`/api/tasks/${taskId}/reviews`)).data.data;
  },
  async remove(id: string) {
    return (await api.delete(`/api/tasks/${id}`)).data;
  },
};

export interface CommentDto { id: string; taskId: string; authorUserId: string; authorName: string; body: string; createdAt: string; isMine: boolean }
export interface LinkDto { id: string; taskId: string; url: string; displayName?: string; type?: string; createdAt: string }
export interface ReviewDto { id: string; reviewerName: string; decision: string; comment?: string; submissionVersion: number; createdAt: string }
