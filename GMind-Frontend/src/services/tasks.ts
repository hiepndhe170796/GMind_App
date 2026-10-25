import api from './api';

export interface TaskDto {
  id: string; projectId: string; parentTaskId?: string; title: string; description?: string;
  assigneeUserId?: string; assigneeName?: string; status: string; priority: string;
  deadlineAt?: string; estimateHours?: number; points?: number; progressPercent: number;
  createdByUserId: string; createdAt: string; submittedAt?: string; completedAt?: string;
}

// Status enum values matching backend TaskStatus
export const TaskStatus = { ToDo: 1, InProgress: 2, Submitted: 3, ChangesRequested: 4, Completed: 5 } as const;

export const tasksService = {
  async list(projectId: string): Promise<TaskDto[]> {
    return (await api.get(`/api/projects/${projectId}/tasks`)).data.data;
  },
  async create(projectId: string, data: {
    title: string; description?: string; assigneeUserId?: string; parentTaskId?: string;
    priority?: number; deadlineAt?: string; estimateHours?: number; points?: number;
  }): Promise<TaskDto> {
    return (await api.post(`/api/projects/${projectId}/tasks`, data)).data.data;
  },
  async update(id: string, data: { title: string; description?: string; priority?: number; deadlineAt?: string; estimateHours?: number; points?: number }): Promise<TaskDto> {
    return (await api.patch(`/api/tasks/${id}`, data)).data.data;
  },
  async assign(id: string, assigneeUserId?: string): Promise<TaskDto> {
    return (await api.post(`/api/tasks/${id}/assign`, { assigneeUserId })).data.data;
  },
  async changeStatus(id: string, status: number): Promise<TaskDto> {
    return (await api.post(`/api/tasks/${id}/status`, { status })).data.data;
  },
  async remove(id: string) {
    return (await api.delete(`/api/tasks/${id}`)).data;
  },
};
