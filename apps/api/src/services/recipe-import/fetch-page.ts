/**
 * Fetches a recipe page for import, refusing anything on the home network.
 *
 * Why: once a server fetches URLs that users type, a link like
 * http://192.168.1.1/admin would make the server request the router's admin
 * page on the user's behalf. That's server-side request forgery (SSRF). The
 * check runs inside the DNS lookup used for the connection itself, so a
 * hostname can't pass the check and then resolve somewhere else (DNS
 * rebinding), and it runs again on every redirect.
 */
import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import type { Readable } from 'node:stream';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import { AppError, BadRequestError } from '../../errors.js';
import { isPrivateAddress } from '../../lan-guard.js';

export interface FetchedPage {
  /** Final URL, after redirects. */
  url: string;
  html: string;
}

export type PageFetcher = (url: string) => Promise<FetchedPage>;

const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;
const USER_AGENT = 'Mozilla/5.0 (compatible; MealPlanner/0.1; personal recipe import)';

/** Addresses an outgoing request must never reach: this machine, the LAN, and non-routable ranges. */
export function isBlockedAddress(address: string): boolean {
  if (isPrivateAddress(address)) return true;
  let ip = address.toLowerCase();
  if (ip.startsWith('::ffff:') && isIP(ip.slice(7)) === 4) ip = ip.slice(7);
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number) as [number, number];
    return (
      a === 0 || // "this network"
      (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
      a >= 224 // multicast and reserved
    );
  }
  if (isIP(ip) === 6) return ip === '::' || ip.startsWith('ff');
  return true;
}

class BlockedAddressError extends Error {
  readonly code = 'EBLOCKED';
}

/** dns.lookup that fails when any address for the name is blocked. */
function safeLookup(
  hostname: string,
  options: LookupOptions,
  callback: (
    err: NodeJS.ErrnoException | null,
    address: string | LookupAddress[],
    family?: number,
  ) => void,
): void {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, '');
    if (addresses.length === 0 || addresses.some((a) => isBlockedAddress(a.address))) {
      return callback(new BlockedAddressError(hostname), '');
    }
    if (options.all) return callback(null, addresses);
    const first = addresses[0]!;
    callback(null, first.address, first.family);
  });
}

function blocked(): AppError {
  return new BadRequestError(
    'IMPORT_URL_BLOCKED',
    'That address is on this computer or the home network, so it can’t be imported.',
  );
}

function fetchFailed(message: string): AppError {
  return new AppError(502, 'IMPORT_FETCH_FAILED', message);
}

export const fetchPage: PageFetcher = async (startUrl) => {
  let url = new URL(startUrl);
  for (let redirects = 0; ; redirects++) {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw blocked();
    // IP literals skip DNS, so check them directly.
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (isIP(host) && isBlockedAddress(host)) throw blocked();

    const res = await request(url);
    const status = res.statusCode ?? 0;
    if (status >= 300 && status < 400 && res.headers.location) {
      res.resume();
      if (redirects >= MAX_REDIRECTS) throw fetchFailed('The page redirected too many times.');
      url = new URL(res.headers.location, url);
      continue;
    }
    if (status !== 200) {
      res.resume();
      throw fetchFailed(
        status === 403 || status === 429
          ? `The site refused the request (HTTP ${status}). Some sites block automated readers.`
          : `The site returned HTTP ${status}.`,
      );
    }
    const type = String(res.headers['content-type'] ?? '');
    if (!/text\/html|application\/xhtml\+xml/i.test(type)) {
      res.resume();
      throw fetchFailed('That link isn’t a web page.');
    }
    const body = await readBody(res);
    return { url: url.toString(), html: decode(body, type) };
  }
};

function request(url: URL): Promise<http.IncomingMessage> {
  const get = url.protocol === 'https:' ? https.get : http.get;
  return new Promise((resolve, reject) => {
    const req = get(
      url,
      {
        lookup: safeLookup,
        timeout: TIMEOUT_MS,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Encoding': 'gzip, deflate, br',
        },
      },
      resolve,
    );
    req.on('timeout', () => req.destroy(fetchFailed('The site took too long to respond.')));
    req.on('error', (err) => {
      if (err instanceof AppError) reject(err);
      else if (err instanceof BlockedAddressError) reject(blocked());
      else
        reject(
          fetchFailed(
            `Couldn’t reach the site (${(err as NodeJS.ErrnoException).code ?? err.message}).`,
          ),
        );
    });
  });
}

async function readBody(res: http.IncomingMessage): Promise<Buffer> {
  const encoding = String(res.headers['content-encoding'] ?? '').toLowerCase();
  let stream: Readable = res;
  if (encoding === 'gzip') stream = res.pipe(createGunzip());
  else if (encoding === 'deflate') stream = res.pipe(createInflate());
  else if (encoding === 'br') stream = res.pipe(createBrotliDecompress());

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    size += (chunk as Buffer).length;
    if (size > MAX_BYTES) {
      res.destroy();
      throw fetchFailed('The page is too large to import.');
    }
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

function decode(body: Buffer, contentType: string): string {
  const charset = /charset=["']?([\w-]+)/i.exec(contentType)?.[1] ?? 'utf-8';
  try {
    return new TextDecoder(charset).decode(body);
  } catch {
    return new TextDecoder('utf-8').decode(body);
  }
}
