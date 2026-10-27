import { sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { HealthResponseSchema } from '@meal-planner/shared';
import type { AppDeps } from '../app.js';
import pkg from '../../package.json' with { type: 'json' };

export function systemRoutes({ db }: AppDeps): FastifyPluginAsyncZod {
  return async (app) => {
    app.get(
      '/health',
      {
        schema: {
          tags: ['system'],
          summary: 'Health check',
          response: { 200: HealthResponseSchema },
        },
      },
      async () => {
        // Fails (500) if the database is unreachable.
        db.get(sql`select 1`);
        return {
          status: 'ok' as const,
          version: pkg.version,
          uptimeSeconds: Math.round(process.uptime()),
        };
      },
    );
  };
}
