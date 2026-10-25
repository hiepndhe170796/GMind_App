import api from './api';

export interface NotificationDto {
  id: string; type: string; title: string; body: string;
  relatedEntityType?: string; relatedEntityId?: string; isRead: boolean; createdAt: string;
}

export const notificationsService = {
  async list(unreadOnly = false): Promise<NotificationDto[]> {
    return (await api.get('/api/notifications', { params: { unreadOnly } })).data.data;
  },
  async unreadCount(): Promise<number> {
    return (await api.get('/api/notifications/unread-count')).data.data.count;
  },
  async markRead(id: string) {
    return (await api.post(`/api/notifications/${id}/read`)).data;
  },
  async markAllRead(): Promise<number> {
    return (await api.post('/api/notifications/read-all')).data.data.count;
  },
};
