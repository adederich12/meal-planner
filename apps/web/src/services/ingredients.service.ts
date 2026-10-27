import { z } from 'zod';
import {
  IngredientDetailSchema,
  IngredientListItemSchema,
  IngredientSchema,
  type IngredientInput,
  type IngredientListQuery,
} from '@meal-planner/shared';
import { apiClient, type ApiClient } from '../lib/api-client';
import { toQueryString } from '../lib/query-string';

/** Talks to the ingredient catalog endpoints. Components use this through query hooks. */
export function createIngredientService(client: ApiClient = apiClient) {
  return {
    list: (query: IngredientListQuery = {}) =>
      client.get(z.array(IngredientListItemSchema), `/api/ingredients${toQueryString(query)}`),
    get: (id: string) => client.get(IngredientDetailSchema, `/api/ingredients/${id}`),
    create: (input: IngredientInput) => client.post(IngredientSchema, '/api/ingredients', input),
    replace: (id: string, input: IngredientInput) =>
      client.put(IngredientSchema, `/api/ingredients/${id}`, input),
    setArchived: (id: string, archived: boolean) =>
      client.post(IngredientSchema, `/api/ingredients/${id}/${archived ? 'archive' : 'restore'}`),
    remove: (id: string) => client.del(z.undefined(), `/api/ingredients/${id}`),
  };
}

export const ingredientService = createIngredientService();
