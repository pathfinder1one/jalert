import { http } from './http';
import type { AuditLog, ReportUploadResponse } from '../types/api';

export const reportService = {
  async downloadPdf(villageId: string) {
    const response = await http.get(`/reports/${villageId}/pdf`, {
      responseType: 'blob',
    });
    return response.data as Blob;
  },
  async downloadSensorCsv(villageId: string, days = 7) {
    const response = await http.get(`/reports/${villageId}/csv/sensors`, {
      params: { days },
      responseType: 'blob',
    });
    return response.data as Blob;
  },
  async uploadPdf(villageId: string) {
    const { data } = await http.post<ReportUploadResponse>(`/reports/${villageId}/pdf/upload`);
    return data;
  },
  async listActivity(limit = 20) {
    const { data } = await http.get<AuditLog[]>('/reports/activity', {
      params: { limit },
    });
    return data;
  },
};
