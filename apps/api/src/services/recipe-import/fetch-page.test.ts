import { describe, expect, it } from 'vitest';
import { fetchPage, isBlockedAddress } from './fetch-page.js';

describe('isBlockedAddress', () => {
  it.each([
    ['127.0.0.1', true],
    ['10.0.0.5', true],
    ['192.168.1.1', true],
    ['172.20.0.1', true],
    ['169.254.169.254', true],
    ['0.0.0.0', true],
    ['100.64.0.1', true],
    ['224.0.0.1', true],
    ['::1', true],
    ['::', true],
    ['fd12::1', true],
    ['::ffff:192.168.0.10', true],
    ['not-an-ip', true],
    ['93.184.215.14', false],
    ['8.8.8.8', false],
    ['2606:4700::1111', false],
  ])('%s → %s', (ip, expected) => {
    expect(isBlockedAddress(ip)).toBe(expected);
  });
});

describe('fetchPage refuses the home network', () => {
  it.each([
    'http://127.0.0.1:3002/api/health',
    'http://192.168.1.1/',
    'http://[::1]/',
    // Resolves to 127.0.0.1, so it's caught in the DNS lookup.
    'http://localhost:3002/',
  ])('%s', async (url) => {
    await expect(fetchPage(url)).rejects.toMatchObject({ code: 'IMPORT_URL_BLOCKED' });
  });

  it('refuses non-web schemes', async () => {
    await expect(fetchPage('file:///etc/passwd')).rejects.toMatchObject({
      code: 'IMPORT_URL_BLOCKED',
    });
  });
});
