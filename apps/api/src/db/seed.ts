/** CLI: add the starter ingredient catalog (`npm run db:seed`). Safe to re-run. */
import { loadConfig } from '../config.js';
import { dbFilePath, openDb, runMigrations } from './client.js';
import { SEED_INGREDIENTS, seedIngredients } from './seed-ingredients.js';

const config = loadConfig();
const file = dbFilePath(config.dataDir);
const db = openDb(file);
runMigrations(db);
const added = seedIngredients(db);
db.$client.close();

console.log(
  `Added ${added} of ${SEED_INGREDIENTS.length} starter ingredients to ${file}` +
    (added < SEED_INGREDIENTS.length ? ' (the rest already existed)' : ''),
);
