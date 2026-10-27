/** CLI: apply pending migrations to the database in DATA_DIR. (`npm run db:migrate`) */
import { loadConfig } from '../config.js';
import { dbFilePath, openDb, runMigrations } from './client.js';

const config = loadConfig();
const file = dbFilePath(config.dataDir);
const db = openDb(file);

runMigrations(db);
db.$client.close();

console.log(`Migrations applied to ${file}`);
