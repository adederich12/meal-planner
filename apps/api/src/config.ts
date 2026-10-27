import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Both src/ (dev) and dist/ (build) sit at apps/api/<dir>, so the repo root is three levels up.
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3002),
  // 127.0.0.1 = this computer only. 0.0.0.0 = home network too (DESIGN §9).
  HOST: z.string().default('127.0.0.1'),
  ALLOWED_HOSTS: z.string().default(''),
  DATA_DIR: z.string().default('./data'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // Enables recipe import (DESIGN §6). Never sent to the browser.
  ANTHROPIC_API_KEY: z.string().trim().optional(),
});

export interface AppConfig {
  port: number;
  host: string;
  /** Extra Host header names the private-network guard accepts. */
  allowedHosts: string[];
  dataDir: string;
  env: 'development' | 'production' | 'test';
  /** Claude API key for recipe import; undefined disables the feature. */
  anthropicApiKey: string | undefined;
  /** Built web app to serve as static files, if it exists. */
  webDistDir: string | undefined;
}

/** Reads .env from the repo root (if present) and validates the environment. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const envFile = resolve(REPO_ROOT, '.env');
  if (env === process.env && existsSync(envFile)) {
    // Built into Node 20.12+, so no dotenv dependency is needed.
    process.loadEnvFile(envFile);
  }

  const parsed = EnvSchema.parse(env);
  const webDistDir = resolve(REPO_ROOT, 'apps/web/dist');

  return {
    port: parsed.PORT,
    host: parsed.HOST,
    allowedHosts: parsed.ALLOWED_HOSTS.split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
    dataDir: resolve(REPO_ROOT, parsed.DATA_DIR),
    env: parsed.NODE_ENV,
    anthropicApiKey: parsed.ANTHROPIC_API_KEY || undefined,
    webDistDir: existsSync(resolve(webDistDir, 'index.html')) ? webDistDir : undefined,
  };
}
