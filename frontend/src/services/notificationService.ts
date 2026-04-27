import { http } from './http';
import type { Notification } from '../types/api';

export const notificationService = {
  async list(params?: { unread_only?: boolean; limit?: number }) {
    const { data } = await http.get<Notification[]>('/notifications/', {
      params: {
        unread_only: params?.unread_only || undefined,
        limit: params?.limit ?? 50,
      },
    });
    return data;
  },
  async markRead(notificationId: string) {
    const { data } = await http.patch<Notification>(`/notifications/${notificationId}/read`);
    return data;
  },
  async markAllRead() {
    const { data } = await http.post<{ updated: number }>('/notifications/read-all');
    return data;
  },
};
