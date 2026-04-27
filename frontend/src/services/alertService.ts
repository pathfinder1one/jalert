import { http } from './http';
import type { Alert, AlertStatus, AlertSeverity, AlertType, ManualAlertPayload } from '../types/api';

export const alertService = {
  async list(filters: {
    village_id?: string;
    severity?: AlertSeverity | '';
    alert_type?: AlertType | '';
    status?: AlertStatus | '';
    limit?: number;
    offset?: number;
  }) {
    const { data } = await http.get<Alert[]>('/alerts/', { params: filters });
    return data;
  },
  async createManual(payload: ManualAlertPayload) {
    const { data } = await http.post<Alert>('/alerts/manual', payload);
    return data;
  },
  async acknowledge(alertId: string, note?: string) {
    const { data } = await http.patch<Alert>(`/alerts/${alertId}/acknowledge`, { note });
    return data;
  },
  async assign(alertId: string, assigned_to_user_id: string, note?: string) {
    const { data } = await http.patch<Alert>(`/alerts/${alertId}/assign`, {
      assigned_to_user_id,
      note,
    });
    return data;
  },
  async escalate(alertId: string, escalation_level: number, reason: string) {
    const { data } = await http.patch<Alert>(`/alerts/${alertId}/escalate`, {
      escalation_level,
      reason,
    });
    return data;
  },
  async resolve(alertId: string, resolution_note?: string) {
    const { data } = await http.patch<Alert>(`/alerts/${alertId}/resolve`, { resolution_note });
    return data;
  },
};
