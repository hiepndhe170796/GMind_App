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
  async createInvite(id: string): Promise<InviteDto> {
    const res = await api.post(`/api/groups/${id}/invites`, {});
    return res.data.data;
  },
  async activity(id: string): Promise<ActivityDto[]> {
    return (await api.get(`/api/groups/${id}/activity`)).data.data;
  },
};

export interface ActivityDto { id: string; actorName: string; action: string; entityType: string; summary: string; createdAt: string; projectId?: string | null }

// Phase 3 additive wrappers
export interface InviteDto { id: string; code: string; inviteLink: string; expiresAt?: string | null; maxUses?: number | null; usedCount: number }

export const groupsManage = {
  async update(groupId: string, name: string, description?: string): Promise<GroupDto> {
    return (await api.patch(`/api/groups/${groupId}`, { name, description })).data.data;
  },
  async revokeInvite(inviteId: string) {
    return (await api.delete(`/api/groups/invites/${inviteId}`)).data;
  },
  async changeRole(groupId: string, userId: string, role: number) {
    return (await api.patch(`/api/groups/${groupId}/members/${userId}`, { role })).data;
  },
  async removeMember(groupId: string, userId: string) {
    return (await api.delete(`/api/groups/${groupId}/members/${userId}`)).data;
  },
  async leave(groupId: string) {
    return (await api.post(`/api/groups/${groupId}/leave`, {})).data;
  },
};
