import api from './api';

export interface MarketplaceDto {
  id: string; requestType: string; status: string; taskTitle: string; taskId: string;
  requestedByName: string; targetName?: string; reason: string;
  reviewComment?: string; createdAt: string; reviewedAt?: string;
  requestedByUserId: string; targetUserId?: string; relatedTaskId?: string; relatedTaskTitle?: string;
}

// MarketplaceRequestType: NeedHelp=1, Transfer=2, Swap=3
export const marketplaceService = {
  async list(groupId: string, status?: string): Promise<MarketplaceDto[]> {
    return (await api.get(`/api/groups/${groupId}/marketplace-requests`, { params: { status } })).data.data;
  },
  async create(groupId: string, data: { requestType: number; taskId: string; targetUserId?: string; relatedTaskId?: string; reason: string }): Promise<MarketplaceDto> {
    return (await api.post(`/api/groups/${groupId}/marketplace-requests`, data)).data.data;
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
