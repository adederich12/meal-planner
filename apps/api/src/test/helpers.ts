import type { AppDeps } from '../app.js';
import type { AppConfig } from '../config.js';
import { IN_MEMORY, openDb, runMigrations } from '../db/client.js';

export const testConfig: AppConfig = {
  port: 0,
  host: '127.0.0.1',
  allowedHosts: [],
  dataDir: '',
  env: 'test',
  webDistDir: undefined,
};

/** A fresh in-memory database with real migrations. */
export function createTestDeps(): AppDeps & { cleanup: () => void } {
  const db = openDb(IN_MEMORY);
  runMigrations(db);
  return {
    db,
    cleanup: () => db.$client.close(),
  };
}
