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
  async contributions(id: string): Promise<ProjectContributions> {
    return (await api.get(`/api/projects/${id}/contributions`)).data.data;
  },
};

export interface MemberContribution { userId: string; displayName: string; creditedPoints: number; plannedPoints: number; percent: number }
export interface ProjectContributions { projectId: string; totalCredited: number; totalPlanned: number; isLeader: boolean; members: MemberContribution[] }

// Project-level document links (M2 A7)
export const projectLinks = {
  async links(projectId: string): Promise<import('./tasks').LinkDto[]> {
    return (await api.get(`/api/projects/${projectId}/links`)).data.data;
  },
  async addLink(projectId: string, url: string, displayName?: string, type?: string): Promise<import('./tasks').LinkDto> {
    return (await api.post(`/api/projects/${projectId}/links`, { url, displayName, type })).data.data;
  },
};

// Phase 3 additive wrappers
export const projectsManage = {
  async update(id: string, data: { name: string; description?: string; subject?: string; deadlineAt?: string }): Promise<ProjectDto> {
    return (await api.patch(`/api/projects/${id}`, data)).data.data;
  },
  async archive(id: string) {
    return (await api.post(`/api/projects/${id}/archive`, {})).data;
  },
  async restore(id: string) {
    return (await api.post(`/api/projects/${id}/restore`, {})).data;
  },
  async archived(groupId: string) {
    return (await api.get(`/api/groups/${groupId}/projects/archived`)).data.data;
  },
};
