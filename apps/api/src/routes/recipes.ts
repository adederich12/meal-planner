import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  ApiErrorSchema,
  RecipeInputSchema,
  RecipeListQuerySchema,
  RecipeSchema,
  RecipeSummarySchema,
  TagListSchema,
} from '@meal-planner/shared';
import type { AppDeps } from '../app.js';
import { createRecipeService } from '../services/recipes.service.js';

const IdParams = z.object({ id: z.uuid() });

export function recipeRoutes(deps: AppDeps): FastifyPluginAsyncZod {
  const service = createRecipeService(deps);
  const tags = ['recipes'];

  return async (app) => {
    app.get(
      '/recipes',
      {
        schema: {
          tags,
          summary: 'List recipes',
          description: 'Filter by name (`q`), tag, or an ingredient the recipe uses.',
          querystring: RecipeListQuerySchema,
          response: { 200: z.array(RecipeSummarySchema) },
        },
      },
      async (req) => service.list(req.query),
    );

    app.get(
      '/recipes/:id',
      {
        schema: {
          tags,
          summary: 'Get a recipe with its ingredient lines',
          params: IdParams,
          response: { 200: RecipeSchema, 404: ApiErrorSchema },
        },
      },
      async (req) => service.get(req.params.id),
    );

    app.post(
      '/recipes',
      {
        schema: {
          tags,
          summary: 'Add a recipe',
          body: RecipeInputSchema,
          response: { 201: RecipeSchema, 400: ApiErrorSchema },
        },
      },
      async (req, reply) => reply.status(201).send(service.create(req.body)),
    );

    app.put(
      '/recipes/:id',
      {
        schema: {
          tags,
          summary: 'Replace a recipe, including its ingredient lines and tags',
          params: IdParams,
          body: RecipeInputSchema,
          response: { 200: RecipeSchema, 400: ApiErrorSchema, 404: ApiErrorSchema },
        },
      },
      async (req) => service.replace(req.params.id, req.body),
    );

    app.post(
      '/recipes/:id/archive',
      {
        schema: {
          tags,
          summary: 'Archive a recipe',
          params: IdParams,
          response: { 200: RecipeSchema, 404: ApiErrorSchema },
        },
      },
      async (req) => service.setArchived(req.params.id, true),
    );

    app.post(
      '/recipes/:id/restore',
      {
        schema: {
          tags,
          summary: 'Restore an archived recipe',
          params: IdParams,
          response: { 200: RecipeSchema, 404: ApiErrorSchema },
        },
      },
      async (req) => service.setArchived(req.params.id, false),
    );

    app.delete(
      '/recipes/:id',
      {
        schema: {
          tags,
          summary: 'Delete a recipe',
          params: IdParams,
          response: { 204: z.null(), 404: ApiErrorSchema },
        },
      },
      async (req, reply) => {
        service.remove(req.params.id);
        return reply.status(204).send(null);
      },
    );

    app.get(
      '/tags',
      {
        schema: {
          tags,
          summary: 'List the tags recipes use',
          response: { 200: TagListSchema },
        },
      },
      async () => service.listTags(),
    );
  };
}
