import { http } from './http';
import type { Village, VillageDashboard } from '../types/api';

export const villageService = {
  async list() {
    const { data } = await http.get<Village[]>('/villages/');
    return data;
  },
  async get(id: string) {
    const { data } = await http.get<Village>(`/villages/${id}`);
    return data;
  },
  async getDashboard(id: string) {
    const { data } = await http.get<VillageDashboard>(`/villages/${id}/dashboard`);
    return data;
  },
};
