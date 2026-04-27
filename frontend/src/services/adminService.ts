import { http } from './http';
import type {
  AdminUserPasswordResetPayload,
  AdminUserUpdatePayload,
  AuditLog,
  User,
} from '../types/api';

export const adminService = {
  async listUsers(includeInactive = true) {
    const { data } = await http.get<User[]>('/admin/users', {
      params: { include_inactive: includeInactive },
    });
    return data;
  },
  async updateUser(userId: string, payload: AdminUserUpdatePayload) {
    const { data } = await http.patch<User>(`/admin/users/${userId}`, payload);
    return data;
  },
  async setUserPassword(userId: string, payload: AdminUserPasswordResetPayload) {
    const { data } = await http.post<{ status: string }>(`/admin/users/${userId}/set-password`, payload);
    return data;
  },
  async listAudit(params?: { limit?: number; action?: string; user_id?: string }) {
    const { data } = await http.get<AuditLog[]>('/admin/audit', {
      params: {
        limit: params?.limit ?? 100,
        action: params?.action || undefined,
        user_id: params?.user_id || undefined,
      },
    });
    return data;
  },
};
