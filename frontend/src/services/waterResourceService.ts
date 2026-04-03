import { http } from './http';
import type { WaterResourceResponse } from '../types/api';

export const waterResourceService = {
  list: async (params?: {
    query?: string;
    state?: string;
    resourceType?: string;
    limit?: number;
  }) => {
    const response = await http.get<WaterResourceResponse>('/water-resources/', {
      params: {
        query: params?.query || undefined,
        state: params?.state || undefined,
        resource_type: params?.resourceType || undefined,
        limit: params?.limit ?? 200,
      },
    });
    return response.data;
  },
};
