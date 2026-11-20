import api from './api';

export interface MarketplaceDto {
  id: string; requestType: string; status: string; taskTitle: string; taskId: string;
  requestedByName: string; targetName?: string; reason: string;
  reviewComment?: string; createdAt: string; reviewedAt?: string;
  requestedByUserId: string; targetUserId?: string; relatedTaskId?: string; relatedTaskTitle?: string;
  canReview?: boolean;
  // M4 additive fields
  groupId?: string; groupName?: string; projectId?: string | null; projectName?: string | null;
  helpScope?: string | null; recipientComment?: string | null;
  respondedAt?: string | null; claimedAt?: string | null;
  taskDeadlineAt?: string | null; relatedTaskDeadlineAt?: string | null; reviewerName?: string | null;
  requesterOpenTasks?: number | null; targetOpenTasks?: number | null;
  canReject?: boolean; canRespond?: boolean; canClaim?: boolean; canCancel?: boolean;
}

export interface SwapCandidateDto { id: string; title: string; projectName: string; deadlineAt?: string | null; status: string }

// MarketplaceRequestType: NeedHelp=1, Transfer=2, Swap=3
export const marketplaceService = {
  async list(groupId: string, status?: string): Promise<MarketplaceDto[]> {
    return (await api.get(`/api/groups/${groupId}/marketplace-requests`, { params: { status } })).data.data;
  },
  async create(groupId: string, data: { requestType: number; taskId: string; targetUserId?: string; relatedTaskId?: string; reason: string; helpScope?: string | null }): Promise<MarketplaceDto> {
    return (await api.post(`/api/groups/${groupId}/marketplace-requests`, data)).data.data;
  },
  async incoming(): Promise<MarketplaceDto[]> {
    return (await api.get('/api/marketplace-requests/incoming')).data.data;
  },
  async swapCandidates(groupId: string, userId: string): Promise<SwapCandidateDto[]> {
    return (await api.get(`/api/groups/${groupId}/marketplace/swap-candidates/${userId}`)).data.data;
  },
  async respond(id: string, accept: boolean, comment?: string): Promise<MarketplaceDto> {
    return (await api.post(`/api/marketplace-requests/${id}/respond`, { accept, comment })).data.data;
  },
  async claim(id: string, note?: string): Promise<MarketplaceDto> {
    return (await api.post(`/api/marketplace-requests/${id}/claim`, { note })).data.data;
  },
  async approve(id: string, comment?: string) {
    return (await api.post(`/api/marketplace-requests/${id}/approve`, { comment })).data.data;
  },
  async reject(id: string, comment: string) {
    return (await api.post(`/api/marketplace-requests/${id}/reject`, { comment })).data.data;
  },
  async cancel(id: string) {
    return (await api.post(`/api/marketplace-requests/${id}/cancel`)).data;
  },
};
