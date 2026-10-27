import multipart from '@fastify/multipart';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  ApiErrorSchema,
  MAX_SCAN_FILE_BYTES,
  MAX_SCAN_FILES,
  RecipeImportDraftSchema,
  RecipeImportRequestSchema,
} from '@meal-planner/shared';
import type { AppDeps } from '../app.js';
import { BadRequestError } from '../errors.js';
import {
  createRecipeImportService,
  type UploadedScan,
} from '../services/recipe-import/recipe-import.service.js';

const errorResponses = {
  400: ApiErrorSchema,
  413: ApiErrorSchema,
  422: ApiErrorSchema,
  502: ApiErrorSchema,
  503: ApiErrorSchema,
};

export function recipeImportRoutes(deps: AppDeps): FastifyPluginAsyncZod {
  const service = createRecipeImportService(deps);

  return async (app) => {
    // Registered here, not app-wide, so these limits only apply to scan uploads.
    // Going over them is a 413 from the plugin.
    await app.register(multipart, {
      limits: { fileSize: MAX_SCAN_FILE_BYTES, files: MAX_SCAN_FILES, fields: 0 },
    });

    app.post(
      '/recipes/import',
      {
        schema: {
          tags: ['recipes'],
          summary: 'Read a recipe from a web page',
          description:
            'Returns a draft for the recipe form. Nothing is saved. Uses the page’s schema.org Recipe data when present, and Claude to split ingredient lines and match them to the catalog.',
          body: RecipeImportRequestSchema,
          response: { 200: RecipeImportDraftSchema, ...errorResponses },
        },
      },
      async (req) => service.importFromUrl(req.body.url),
    );

    app.post(
      '/recipes/import/scan',
      {
        schema: {
          tags: ['recipes'],
          summary: 'Read a recipe from scans or photos of a paper card',
          description: `multipart/form-data with 1–${MAX_SCAN_FILES} files (PDF, JPEG, PNG, or WebP; up to ${MAX_SCAN_FILE_BYTES / 1024 / 1024} MB each) for one recipe, e.g. the front and back of a card. Returns a draft for the recipe form; nothing is saved.`,
          consumes: ['multipart/form-data'],
          response: { 200: RecipeImportDraftSchema, ...errorResponses },
        },
      },
      async (req) => {
        if (!req.isMultipart()) {
          throw new BadRequestError('EXPECTED_MULTIPART', 'Send the files as multipart/form-data.');
        }
        const uploads: UploadedScan[] = [];
        for await (const part of req.files()) {
          uploads.push({ fileName: part.filename || 'upload', data: await part.toBuffer() });
        }
        if (uploads.length === 0 || uploads.some((u) => u.data.byteLength === 0)) {
          throw new BadRequestError('FILE_REQUIRED', 'Attach a scan or photo of the recipe.');
        }
        return service.importFromScan(uploads);
      },
    );
  };
}
