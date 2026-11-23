import api from './api';

export interface MyTaskDto {
  id: string; projectId: string; projectName: string; title: string; status: string; priority: string;
  deadlineAt?: string | null; parentTaskId?: string | null; parentTitle?: string | null;
  groupName?: string | null; groupId?: string; progressPercent?: number | null;
  updatedAt?: string | null; completedAt?: string | null;
  permissions?: import('./tasks').TaskPermissionsDto | null;
  isAtRisk?: boolean; isStale?: boolean;
}
export interface MemberProgress {
  userId: string; displayName: string; total: number; inProgress: number; submitted: number; completed: number;
  changesRequested: number; overdue: number; isActiveMember: boolean; atRisk: number;
}
export interface GroupProgress { groupId: string; totalTasks: number; completedTasks: number; percentComplete: number; unassignedTasks: number; members: MemberProgress[] }

export type LeaderQueueKind = 'Review' | 'Marketplace' | 'Overdue' | 'AtRisk' | 'Stale' | 'Unassigned';
export interface LeaderQueueCounts { toDo: number; inProgress: number; submitted: number; changesRequested: number; completed: number }
export interface LeaderQueueGroup { groupId: string; groupName: string; counts: LeaderQueueCounts; overdue: number; atRisk: number; stale: number; unassigned: number; pendingRequests: number }
export interface LeaderQueueItem {
  kind: LeaderQueueKind; taskId?: string | null; requestId?: string | null; title: string;
  projectId?: string | null; projectName?: string | null; groupId: string; groupName: string;
  assigneeName?: string | null; deadlineAt?: string | null; progressPercent?: number | null;
  updatedAt?: string | null; requestType?: string | null; requestedByName?: string | null;
}
export interface LeaderQueueTotals { review: number; marketplace: number; overdue: number; atRisk: number; stale: number; unassigned: number }
export interface LeaderQueue { groups: LeaderQueueGroup[]; items: LeaderQueueItem[]; totals: LeaderQueueTotals }

export const dashboardService = {
  async myTasks(includeCompleted = false): Promise<MyTaskDto[]> {
    return (await api.get('/api/dashboard/my-tasks', { params: { includeCompleted } })).data.data;
  },
  async groupProgress(groupId: string): Promise<GroupProgress> {
    return (await api.get(`/api/groups/${groupId}/progress`)).data.data;
  },
  async leaderQueue(): Promise<LeaderQueue> {
    return (await api.get('/api/dashboard/leader-queue')).data.data;
  },
  async helping(): Promise<import('./groups').HelpingTaskDto[]> {
    return (await api.get('/api/dashboard/helping')).data.data;
  },
};
