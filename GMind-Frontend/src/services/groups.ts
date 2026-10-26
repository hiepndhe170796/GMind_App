import api from './api';

export interface GroupDto { id: string; name: string; description?: string; memberCount: number; myRole: string; createdAt: string }
export interface GroupMemberDto { userId: string; displayName: string; avatarUrl?: string | null; role: string; joinedAt: string }
export interface GroupDetailDto extends GroupDto { members: GroupMemberDto[] }

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
  async get(id: string): Promise<GroupDetailDto> {
    const res = await api.get(`/api/groups/${id}`);
    return res.data.data;
  },
  async createInvite(id: string) {
    const res = await api.post(`/api/groups/${id}/invites`, {});
    return res.data.data;
  },
  async activity(id: string): Promise<ActivityDto[]> {
    return (await api.get(`/api/groups/${id}/activity`)).data.data;
  },
};

export interface ActivityDto { id: string; actorName: string; action: string; entityType: string; summary: string; createdAt: string }
