import { z } from 'zod';
import {
  RecipeSchema,
  RecipeSummarySchema,
  TagListSchema,
  type RecipeInput,
  type RecipeListQuery,
} from '@meal-planner/shared';
import { apiClient, type ApiClient } from '../lib/api-client';
import { toQueryString } from '../lib/query-string';

/** Talks to the recipe endpoints. Components use this through query hooks. */
export function createRecipeService(client: ApiClient = apiClient) {
  return {
    list: (query: RecipeListQuery = {}) =>
      client.get(z.array(RecipeSummarySchema), `/api/recipes${toQueryString(query)}`),
    get: (id: string) => client.get(RecipeSchema, `/api/recipes/${id}`),
    create: (input: RecipeInput) => client.post(RecipeSchema, '/api/recipes', input),
    replace: (id: string, input: RecipeInput) =>
      client.put(RecipeSchema, `/api/recipes/${id}`, input),
    setArchived: (id: string, archived: boolean) =>
      client.post(RecipeSchema, `/api/recipes/${id}/${archived ? 'archive' : 'restore'}`),
    remove: (id: string) => client.del(z.undefined(), `/api/recipes/${id}`),
    listTags: () => client.get(TagListSchema, '/api/tags'),
  };
}

export const recipeService = createRecipeService();
