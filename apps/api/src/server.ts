import { networkInterfaces } from 'node:os';
import Anthropic from '@anthropic-ai/sdk';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { dbFilePath, openDb, runMigrations } from './db/client.js';
import { isPrivateAddress } from './lan-guard.js';
import { createClaudeRecipeAi } from './services/recipe-import/recipe-ai.js';

const config = loadConfig();

const db = openDb(dbFilePath(config.dataDir));
runMigrations(db);

const recipeAi = config.anthropicApiKey
  ? createClaudeRecipeAi(new Anthropic({ apiKey: config.anthropicApiKey }))
  : null;

const app = await buildApp(config, { db, recipeAi });

const shutdown = async (signal: string) => {
  app.log.info(`${signal} received, shutting down`);
  await app.close();
  db.$client.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ port: config.port, host: config.host });
  app.log.info(`API docs at http://localhost:${config.port}/docs`);
  if (config.webDistDir) {
    app.log.info(`App at http://localhost:${config.port}`);
    if (config.host === '0.0.0.0' || config.host === '::') {
      for (const ip of lanAddresses())
        app.log.info(`On the home network: http://${ip}:${config.port}`);
    }
  }
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

/** This machine's private IPv4 addresses (what a phone on the Wi-Fi would use). */
function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal && isPrivateAddress(n.address))
    .map((n) => n!.address);
}
