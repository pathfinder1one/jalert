import { http } from './http';
import type { Sensor, SensorInventoryResponse, SensorReading } from '../types/api';

export const sensorService = {
  async list(villageId: string) {
    const { data } = await http.get<Sensor[]>(`/sensors/village/${villageId}`);
    return data;
  },
  async readings(villageId: string, hours = 48, limit = 120) {
    const { data } = await http.get<SensorReading[]>(`/sensors/readings/${villageId}`, {
      params: { hours, limit },
    });
    return data;
  },
  async inventory(villageId?: string) {
    const { data } = await http.get<SensorInventoryResponse>('/sensors/inventory', {
      params: { village_id: villageId || undefined },
    });
    return data;
  },
};
