import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  ApiErrorSchema,
  IngredientDetailSchema,
  IngredientInputSchema,
  IngredientListItemSchema,
  IngredientListQuerySchema,
  IngredientSchema,
} from '@meal-planner/shared';
import type { AppDeps } from '../app.js';
import { createIngredientService } from '../services/ingredients.service.js';

const IdParams = z.object({ id: z.uuid() });

export function ingredientRoutes(deps: AppDeps): FastifyPluginAsyncZod {
  const service = createIngredientService(deps);
  const tags = ['ingredients'];

  return async (app) => {
    app.get(
      '/ingredients',
      {
        schema: {
          tags,
          summary: 'List the ingredient catalog',
          querystring: IngredientListQuerySchema,
          response: { 200: z.array(IngredientListItemSchema) },
        },
      },
      async (req) => service.list(req.query),
    );

    app.get(
      '/ingredients/:id',
      {
        schema: {
          tags,
          summary: 'Get an ingredient and the recipes that use it',
          params: IdParams,
          response: { 200: IngredientDetailSchema, 404: ApiErrorSchema },
        },
      },
      async (req) => service.get(req.params.id),
    );

    app.post(
      '/ingredients',
      {
        schema: {
          tags,
          summary: 'Add an ingredient',
          body: IngredientInputSchema,
          response: { 201: IngredientSchema, 409: ApiErrorSchema },
        },
      },
      async (req, reply) => reply.status(201).send(service.create(req.body)),
    );

    app.put(
      '/ingredients/:id',
      {
        schema: {
          tags,
          summary: 'Replace an ingredient',
          params: IdParams,
          body: IngredientInputSchema,
          response: { 200: IngredientSchema, 404: ApiErrorSchema, 409: ApiErrorSchema },
        },
      },
      async (req) => service.replace(req.params.id, req.body),
    );

    app.post(
      '/ingredients/:id/archive',
      {
        schema: {
          tags,
          summary: 'Archive an ingredient (hide it from pickers)',
          params: IdParams,
          response: { 200: IngredientSchema, 404: ApiErrorSchema },
        },
      },
      async (req) => service.setArchived(req.params.id, true),
    );

    app.post(
      '/ingredients/:id/restore',
      {
        schema: {
          tags,
          summary: 'Restore an archived ingredient',
          params: IdParams,
          response: { 200: IngredientSchema, 404: ApiErrorSchema },
        },
      },
      async (req) => service.setArchived(req.params.id, false),
    );

    app.delete(
      '/ingredients/:id',
      {
        schema: {
          tags,
          summary: 'Delete an unused ingredient',
          description:
            'Fails with 409 INGREDIENT_IN_USE if any recipe uses it; archive it instead.',
          params: IdParams,
          response: { 204: z.null(), 404: ApiErrorSchema, 409: ApiErrorSchema },
        },
      },
      async (req, reply) => {
        service.remove(req.params.id);
        return reply.status(204).send(null);
      },
    );
  };
}
