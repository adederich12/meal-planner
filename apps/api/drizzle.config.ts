import { defineConfig } from 'drizzle-kit';

// Used by drizzle-kit only (generate migrations, studio). The app applies
// migrations itself on startup; see src/db/client.ts.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: '../../data/meal-planner.db',
  },
  strict: true,
  verbose: true,
});
