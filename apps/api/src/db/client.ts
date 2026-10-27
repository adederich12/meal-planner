import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { REPO_ROOT } from '../config.js';
import * as schema from './schema.js';

export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

/** Generated SQL migrations (committed to git). */
export const MIGRATIONS_DIR = resolve(REPO_ROOT, 'apps/api/drizzle');

export const IN_MEMORY = ':memory:';

/**
 * Opens a SQLite database with the settings every connection needs.
 * Pass ':memory:' for a throwaway database (tests).
 */
export function openDb(filePath: string): Db {
  if (filePath !== IN_MEMORY) mkdirSync(dirname(filePath), { recursive: true });

  const sqlite = new Database(filePath);
  // Off by default in SQLite, and must be set per connection.
  sqlite.pragma('foreign_keys = ON');
  // Write-ahead logging: reads don't block while a write is happening.
  if (filePath !== IN_MEMORY) sqlite.pragma('journal_mode = WAL');
  // Wait briefly instead of failing immediately if the database is locked.
  sqlite.pragma('busy_timeout = 5000');

  return drizzle(sqlite, { schema });
}

/** Applies any pending migrations. Safe to run on every startup. */
export function runMigrations(db: Db): void {
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}

export function dbFilePath(dataDir: string): string {
  return resolve(dataDir, 'meal-planner.db');
}
