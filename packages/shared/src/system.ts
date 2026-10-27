import { z } from 'zod';

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  version: z.string(),
  uptimeSeconds: z.number().nonnegative(),
  /** Optional features that depend on configuration (e.g. an API key). */
  features: z.object({ recipeImport: z.boolean() }),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
