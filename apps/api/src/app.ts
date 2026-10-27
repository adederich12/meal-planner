import Fastify, { type FastifyError } from 'fastify';
import fastifyStatic from '@fastify/static';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { ApiError } from '@meal-planner/shared';
import type { AppConfig } from './config.js';
import type { Db } from './db/client.js';
import { AppError } from './errors.js';
import { registerLanGuard } from './lan-guard.js';
import { ingredientRoutes } from './routes/ingredients.js';
import { recipeRoutes } from './routes/recipes.js';
import { systemRoutes } from './routes/system.js';
import pkg from '../package.json' with { type: 'json' };

/** Everything the app needs from the outside world, passed in so tests can swap it. */
export interface AppDeps {
  db: Db;
  /** The clock. Tests can pass a fixed time; defaults to the real one. */
  now?: () => Date;
}

/**
 * Builds the Fastify app without starting it, so tests can call app.inject()
 * against it with no network port.
 */
export async function buildApp(config: AppConfig, deps: AppDeps) {
  const app = Fastify({
    logger:
      config.env === 'test'
        ? false
        : config.env === 'development'
          ? { transport: { target: 'pino-pretty', options: { ignore: 'pid,hostname' } } }
          : true,
  }).withTypeProvider<ZodTypeProvider>();

  // First thing on every request: home network only (DESIGN §9).
  registerLanGuard(app, { allowedHosts: config.allowedHosts });

  // Zod schemas validate requests and serialize responses.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // OpenAPI spec generated from the route schemas.
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Meal Planner API',
        description: 'Recipes, weekly meal plans, and combined shopping lists.',
        version: pkg.version,
      },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  app.setErrorHandler((error: FastifyError & { details?: unknown }, request, reply) => {
    if (error.validation) {
      return reply.status(400).send(errorBody('VALIDATION_ERROR', error.message, error.validation));
    }
    const status = error.statusCode ?? 500;
    if (status >= 500) request.log.error(error);
    // Our own AppErrors carry messages written for the user. Any other 5xx is
    // unexpected: hide the details.
    if (status >= 500 && !(error instanceof AppError)) {
      return reply.status(500).send(errorBody('INTERNAL_ERROR', 'Internal server error'));
    }
    return reply
      .status(status)
      .send(errorBody(error.code ?? 'ERROR', error.message, error.details));
  });

  await app.register(systemRoutes(deps), { prefix: '/api' });
  await app.register(ingredientRoutes(deps), { prefix: '/api' });
  await app.register(recipeRoutes(deps), { prefix: '/api' });

  // In production-style runs, serve the built React app from the same port.
  if (config.webDistDir) {
    await app.register(fastifyStatic, { root: config.webDistDir, wildcard: false });
  }

  app.setNotFoundHandler((request, reply) => {
    const isApi = request.url.startsWith('/api/') || request.url === '/api';
    if (!isApi && config.webDistDir && request.method === 'GET') {
      // Client-side routes (e.g. /recipes/123) are handled by the React router.
      return reply.sendFile('index.html');
    }
    return reply
      .status(404)
      .send(errorBody('NOT_FOUND', `Route ${request.method} ${request.url} not found`));
  });

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;

function errorBody(code: string, message: string, details?: unknown): ApiError {
  return { error: { code, message, ...(details === undefined ? {} : { details }) } };
}
