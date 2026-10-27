import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  ApiErrorSchema,
  RecipeImportDraftSchema,
  RecipeImportRequestSchema,
} from '@meal-planner/shared';
import type { AppDeps } from '../app.js';
import { createRecipeImportService } from '../services/recipe-import/recipe-import.service.js';

export function recipeImportRoutes(deps: AppDeps): FastifyPluginAsyncZod {
  const service = createRecipeImportService(deps);

  return async (app) => {
    app.post(
      '/recipes/import',
      {
        schema: {
          tags: ['recipes'],
          summary: 'Read a recipe from a web page',
          description:
            'Returns a draft for the recipe form. Nothing is saved. Uses the page’s schema.org Recipe data when present, and Claude to split ingredient lines and match them to the catalog.',
          body: RecipeImportRequestSchema,
          response: {
            200: RecipeImportDraftSchema,
            400: ApiErrorSchema,
            422: ApiErrorSchema,
            502: ApiErrorSchema,
            503: ApiErrorSchema,
          },
        },
      },
      async (req) => service.importFromUrl(req.body.url),
    );
  };
}
