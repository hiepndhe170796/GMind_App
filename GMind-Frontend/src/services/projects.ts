import api from './api';

export interface ProjectDto {
  id: string; groupId: string; name: string; description?: string; subject?: string;
  deadlineAt?: string; status: string; taskCount: number; completedCount: number; createdAt: string;
}

export const projectsService = {
  async list(groupId: string): Promise<ProjectDto[]> {
    return (await api.get(`/api/groups/${groupId}/projects`)).data.data;
  },
  async create(groupId: string, name: string, description?: string, subject?: string, deadlineAt?: string): Promise<ProjectDto> {
    return (await api.post(`/api/groups/${groupId}/projects`, { name, description, subject, deadlineAt })).data.data;
  },
  async get(id: string): Promise<ProjectDto> {
    return (await api.get(`/api/projects/${id}`)).data.data;
  },
};
