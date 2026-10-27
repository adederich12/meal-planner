import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, type App } from './app.js';
import { isAllowedHost, isPrivateAddress } from './lan-guard.js';
import { createTestDeps, testConfig } from './test/helpers.js';

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.5',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.20',
    '169.254.10.10',
    '::1',
    '::ffff:192.168.1.20',
    'fe80::1',
    'fd12:3456::1',
  ])('%s is private', (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each([
    '8.8.8.8',
    '172.15.0.1',
    '172.32.0.1',
    '192.169.1.1',
    '2607:f8b0::1',
    '::ffff:8.8.8.8',
    'not-an-ip',
  ])('%s is public', (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });
});

describe('isAllowedHost', () => {
  const machine = 'DadLaptop';

  it.each([
    'localhost:5174',
    'LOCALHOST',
    '127.0.0.1:3002',
    '192.168.1.20:3002',
    '[::1]:3002',
    'dadlaptop:3002',
    'DadLaptop.local',
    'dadlaptop.lan:3002',
    'dadlaptop.home.arpa',
    'kitchen.example:3002',
  ])('%s is allowed', (host) => {
    expect(isAllowedHost(host, machine, ['kitchen.example'])).toBe(true);
  });

  it.each([
    undefined,
    '',
    'evil.example.com',
    'dadlaptop.evil.com',
    '8.8.8.8',
    'localhost.evil.com',
  ])('%s is rejected', (host) => {
    expect(isAllowedHost(host, machine)).toBe(false);
  });
});

describe('guard on the app', () => {
  let app: App;
  let cleanup: () => void;

  afterEach(async () => {
    await app.close();
    cleanup();
  });

  async function start() {
    const deps = createTestDeps();
    cleanup = deps.cleanup;
    app = await buildApp(testConfig, deps);
  }

  it('allows a phone on the home network', async () => {
    await start();
    const res = await app.inject({
      url: '/api/health',
      remoteAddress: '192.168.1.42',
      headers: { host: '192.168.1.10:3002' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('blocks a public client address', async () => {
    await start();
    const res = await app.inject({ url: '/api/health', remoteAddress: '203.0.113.9' });
    expect(res.statusCode).toBe(403);
  });

  it('blocks a foreign Host header (DNS rebinding)', async () => {
    await start();
    const res = await app.inject({
      url: '/api/health',
      remoteAddress: '192.168.1.42',
      headers: { host: 'attacker.example.com' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });
});
