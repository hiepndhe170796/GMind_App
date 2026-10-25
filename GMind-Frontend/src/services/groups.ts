import api from './api';

export interface GroupDto { id: string; name: string; description?: string; memberCount: number; myRole: string; createdAt: string }

export const groupsService = {
  async myGroups(): Promise<GroupDto[]> {
    const res = await api.get('/api/groups');
    return res.data.data;
  },
  async create(name: string, description?: string): Promise<GroupDto> {
    const res = await api.post('/api/groups', { name, description });
    return res.data.data;
  },
  async join(code: string): Promise<GroupDto> {
    const res = await api.post('/api/groups/join', { code });
    return res.data.data;
  },
  async get(id: string) {
    const res = await api.get(`/api/groups/${id}`);
    return res.data.data;
  },
  async createInvite(id: string) {
    const res = await api.post(`/api/groups/${id}/invites`, {});
    return res.data.data;
  },
};
