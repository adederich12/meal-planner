import { HealthResponseSchema } from '@meal-planner/shared';
import { apiClient, type ApiClient } from '../lib/api-client';

/** Talks to the API's system endpoints. Components use this through query hooks. */
export function createSystemService(client: ApiClient = apiClient) {
  return {
    getHealth: () => client.get(HealthResponseSchema, '/api/health'),
  };
}

export const systemService = createSystemService();
