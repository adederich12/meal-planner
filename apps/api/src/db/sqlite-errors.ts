/**
 * SQLite constraint errors. better-sqlite3 sets `code`; Drizzle may wrap the
 * driver error, so look at `cause` too.
 */
function sqliteCode(err: unknown): string | undefined {
  for (let e: unknown = err; e && typeof e === 'object'; e = (e as { cause?: unknown }).cause) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === 'string' && code.startsWith('SQLITE_')) return code;
  }
  return undefined;
}

export const isUniqueViolation = (err: unknown) => sqliteCode(err) === 'SQLITE_CONSTRAINT_UNIQUE';
