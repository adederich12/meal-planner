import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../app.js';
import { createTestDeps, testConfig } from '../test/helpers.js';

describe('system routes', () => {
  let app: App;
  let cleanup: () => void;

  beforeEach(async () => {
    const deps = createTestDeps();
    cleanup = deps.cleanup;
    app = await buildApp(testConfig, deps);
  });

  afterEach(async () => {
    await app.close();
    cleanup();
  });

  it('GET /api/health reports ok', async () => {
    const res = await app.inject({ url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', version: '0.1.0' });
  });

  it('unknown API routes return the standard error shape', async () => {
    const res = await app.inject({ url: '/api/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });
});
