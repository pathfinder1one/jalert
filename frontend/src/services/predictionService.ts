import { http } from './http';
import type { Prediction, PredictionExplanation } from '../types/api';

export const predictionService = {
  async run(villageId: string, forceRefresh = true) {
    const { data } = await http.post<Prediction>(`/predictions/${villageId}`, undefined, {
      params: { force_refresh: forceRefresh },
    });
    return data;
  },
  async latest(villageId: string) {
    const { data } = await http.get<Prediction>(`/predictions/${villageId}/latest`);
    return data;
  },
  async history(villageId: string, limit = 30) {
    const { data } = await http.get<Prediction[]>(`/predictions/${villageId}/history`, {
      params: { limit },
    });
    return data;
  },
  async explain(villageId: string) {
    const { data } = await http.get<PredictionExplanation>(`/predictions/${villageId}/explain`);
    return data;
  },
};
