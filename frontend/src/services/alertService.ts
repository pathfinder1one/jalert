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
  async resolve(alertId: string) {
    const { data } = await http.patch<Alert>(`/alerts/${alertId}/resolve`);
    return data;
  },
};
