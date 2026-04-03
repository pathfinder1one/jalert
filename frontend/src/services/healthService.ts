import { http } from './http';
import type { HealthClusterSummary, HealthReport, HealthReportPayload } from '../types/api';

export const healthService = {
  async createReport(payload: HealthReportPayload) {
    const { data } = await http.post<HealthReport>('/health/report', payload);
    return data;
  },
  async listReports(villageId: string, days = 14, limit = 50) {
    const { data } = await http.get<HealthReport[]>(`/health/reports/${villageId}`, {
      params: { days, limit },
    });
    return data;
  },
  async getClusters(villageId: string, days = 7) {
    const { data } = await http.get<HealthClusterSummary>(`/health/clusters/${villageId}`, {
      params: { days },
    });
    return data;
  },
  async assignReport(reportId: string, workerId: string) {
    const { data } = await http.patch(`/health/report/${reportId}/assign`, undefined, {
      params: { worker_id: workerId },
    });
    return data;
  },
  async resolveReport(reportId: string) {
    const { data } = await http.patch(`/health/report/${reportId}/resolve`);
    return data;
  },
};
