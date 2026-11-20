import api from './api';

export interface GroupDto { id: string; name: string; description?: string; memberCount: number; myRole: string; createdAt: string }
export interface GroupMemberDto { userId: string; displayName: string; avatarUrl?: string | null; role: string; joinedAt: string; openTaskCount?: number | null }
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
  async createInvite(id: string, req?: { label?: string; expiresAt?: string | null; maxUses?: number | null }): Promise<InviteDto> {
    const res = await api.post(`/api/groups/${id}/invites`, req ?? {});
    return res.data.data;
  },
  async listInvites(id: string): Promise<InviteListItemDto[]> {
    return (await api.get(`/api/groups/${id}/invites`)).data.data;
  },
  async archivedGroups(): Promise<ArchivedGroupDto[]> {
    return (await api.get('/api/groups/archived')).data.data;
  },
  async archiveGroup(id: string, confirmName: string): Promise<void> {
    await api.post(`/api/groups/${id}/archive`, { confirmName });
  },
  async restoreGroup(id: string): Promise<void> {
    await api.post(`/api/groups/${id}/restore`, {});
  },
  async activityLog(id: string, params: { actorId?: string; projectId?: string; category?: string; from?: string; to?: string; cursor?: string; take?: number }): Promise<ActivityPageDto> {
    return (await api.get(`/api/groups/${id}/activity-log`, { params })).data.data;
  },
  async activityLogFilters(id: string): Promise<ActivityLogFiltersDto> {
    return (await api.get(`/api/groups/${id}/activity-log/filters`)).data.data;
  },
  async activity(id: string): Promise<ActivityDto[]> {
    return (await api.get(`/api/groups/${id}/activity`)).data.data;
  },
  async getSettings(id: string): Promise<GroupSettingsDto> {
    return (await api.get(`/api/groups/${id}/settings`)).data.data;
  },
  async updateSettings(id: string, settings: { riskHoursBeforeDeadline: number; riskProgressBelowPercent: number; staleAfterHours: number }): Promise<GroupSettingsDto> {
    return (await api.put(`/api/groups/${id}/settings`, settings)).data.data;
  },
  async memberOverview(id: string, memberUserId: string): Promise<MemberOverviewDto> {
    return (await api.get(`/api/groups/${id}/members/${memberUserId}/overview`)).data.data;
  },
};

export interface GroupSettingsDto {
  riskHoursBeforeDeadline: number; riskProgressBelowPercent: number; staleAfterHours: number;
  updatedAt?: string | null; updatedByName?: string | null; isDefault: boolean;
}
export interface MemberOverviewMember { userId: string; displayName: string; avatarUrl?: string | null; role: string; joinedAt: string; isActive: boolean }
export interface MemberOverviewSummary {
  total: number; toDo: number; inProgress: number; submitted: number; changesRequested: number;
  completed: number; overdue: number; atRisk: number; stale: number; completionPercent: number;
}
export interface MemberProjectPoints { projectId: string; projectName: string; memberPoints: number; projectCreditedPoints: number; percent: number }
export interface MemberOverviewPoints { total: number; projects: MemberProjectPoints[] }
export interface MemberOverviewTask {
  id: string; projectId: string; projectName: string; title: string; status: string; priority: string;
  deadlineAt?: string | null; parentTaskId?: string | null; parentTitle?: string | null;
  progressPercent?: number | null; updatedAt?: string | null; completedAt?: string | null;
  isOverdue: boolean; isAtRisk: boolean; isStale: boolean;
  permissions?: import('./tasks').TaskPermissionsDto | null;
}
export interface MemberOverviewDto {
  member: MemberOverviewMember; summary: MemberOverviewSummary; points: MemberOverviewPoints;
  tasks: MemberOverviewTask[]; activity: ActivityDto[];
}

export interface ActivityDto { id: string; actorName: string; action: string; entityType: string; summary: string; createdAt: string; projectId?: string | null }

// M4 additive DTOs
export interface InviteListItemDto {
  id: string; label?: string | null; createdAt: string; createdByName: string;
  expiresAt?: string | null; maxUses?: number | null; usedCount: number;
  revokedAt?: string | null; status: 'Active' | 'Expired' | 'Exhausted' | 'Revoked';
}
export interface ArchivedGroupDto {
  id: string; name: string; description?: string | null; archivedAt?: string | null;
  archivedByName?: string | null; myRole: string; memberCount: number; projectCount: number;
  canRestore: boolean;
}
export interface ArchivedProjectDto {
  id: string; name: string; subject?: string | null; archivedAt?: string | null;
  taskCount: number; completedCount: number; canRestore: boolean;
}
export interface ActivityItemDto {
  id: string; actorUserId: string; actorName: string; action: string; entityType: string;
  entityId?: string | null; category?: string | null; summary: string; createdAt: string;
  projectId?: string | null; projectName?: string | null; taskId?: string | null;
}
export interface ActivityPageDto { items: ActivityItemDto[]; nextCursor?: string | null }
export interface ActivityLogActorDto { userId: string; displayName: string; isActive: boolean }
export interface ActivityLogProjectDto { id: string; name: string; isArchived: boolean }
export interface ActivityLogFiltersDto { actors: ActivityLogActorDto[]; projects: ActivityLogProjectDto[] }
export interface TaskHelperDto {
  id: string; userId: string; displayName: string; avatarUrl?: string | null;
  scope: string; createdAt: string; endedAt?: string | null;
  marketplaceRequestId?: string | null; canEnd: boolean;
}
export interface HelpingTaskDto {
  helperRowId: string; taskId: string; title: string; projectId: string; projectName: string;
  groupId: string; groupName: string; assigneeName?: string | null; status: string;
  deadlineAt?: string | null; scope: string; createdAt: string;
}
export interface SwapCandidateDto { id: string; title: string; projectName: string; deadlineAt?: string | null; status: string }

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
