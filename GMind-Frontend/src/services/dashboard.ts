import api from './api';

export interface MyTaskDto { id: string; projectId: string; projectName: string; title: string; status: string; priority: string; deadlineAt?: string }
export interface MemberProgress { userId: string; displayName: string; total: number; inProgress: number; submitted: number; completed: number }
export interface GroupProgress { groupId: string; totalTasks: number; completedTasks: number; percentComplete: number; members: MemberProgress[] }

export const dashboardService = {
  async myTasks(): Promise<MyTaskDto[]> {
    return (await api.get('/api/dashboard/my-tasks')).data.data;
  },
  async groupProgress(groupId: string): Promise<GroupProgress> {
    return (await api.get(`/api/groups/${groupId}/progress`)).data.data;
  },
};
