import { http } from './http';
import type {
  CitizenRequest,
  CitizenRequestPayload,
  CitizenRequestStatusPayload,
  VillageCatalog,
  VillageComparisonResponse,
  VillageIntelligenceProfile,
  VillageMapOverview,
} from '../types/api';

export const villageIntelligenceService = {
  async catalog() {
    const { data } = await http.get<VillageCatalog>('/village-intelligence/catalog');
    return data;
  },
  async profile(villageId: string) {
    const { data } = await http.get<VillageIntelligenceProfile>(`/village-intelligence/${villageId}`);
    return data;
  },
  async contaminants(villageId: string) {
    const { data } = await http.get(`/village-intelligence/${villageId}/contaminants`);
    return data as Pick<VillageIntelligenceProfile, 'village' | 'contaminants' | 'family_actions' | 'transparency'>;
  },
  async compare(villageId: string, compareWith: string[]) {
    const { data } = await http.get<VillageComparisonResponse>(`/village-intelligence/${villageId}/compare`, {
      params: { compare_with: compareWith },
      paramsSerializer: { indexes: null },
    });
    return data;
  },
  async mapOverview(params?: {
    state?: string;
    district?: string;
    contaminant?: string;
    season?: string;
  }) {
    const { data } = await http.get<VillageMapOverview>('/village-intelligence/map-overview', {
      params: {
        state: params?.state || undefined,
        district: params?.district || undefined,
        contaminant: params?.contaminant || undefined,
        season: params?.season || undefined,
      },
    });
    return data;
  },
  async listCitizenRequests(villageId?: string) {
    const { data } = await http.get<CitizenRequest[]>('/village-intelligence/citizen-requests', {
      params: { village_id: villageId || undefined },
    });
    return data;
  },
  async createCitizenRequest(payload: CitizenRequestPayload) {
    const { data } = await http.post<CitizenRequest>('/village-intelligence/citizen-requests', payload);
    return data;
  },
  async updateCitizenRequest(requestId: string, payload: CitizenRequestStatusPayload) {
    const { data } = await http.patch<CitizenRequest>(`/village-intelligence/citizen-requests/${requestId}`, payload);
    return data;
  },
};
