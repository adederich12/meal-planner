/**
 * Private-network guard (DESIGN §9). Defense in depth behind the router and
 * Windows Firewall: even if the server were somehow reachable from outside,
 * it answers only requests that come from this machine or the home network,
 * and that are addressed to it by a local name.
 */
import { isIP } from 'node:net';
import { hostname } from 'node:os';
import type { FastifyInstance } from 'fastify';

/**
 * True for loopback and private-network addresses:
 * IPv4 127/8, 10/8, 172.16/12, 192.168/16, 169.254/16 (link-local);
 * IPv6 ::1, fe80::/10 (link-local), fc00::/7 (unique local).
 */
export function isPrivateAddress(address: string): boolean {
  let ip = address.toLowerCase();
  // IPv4 clients on a dual-stack socket show up as ::ffff:192.168.1.5.
  if (ip.startsWith('::ffff:') && isIP(ip.slice(7)) === 4) ip = ip.slice(7);

  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number) as [number, number];
    return (
      a === 127 ||
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    );
  }
  if (isIP(ip) === 6) {
    return ip === '::1' || /^fe[89ab]/.test(ip) || /^f[cd]/.test(ip);
  }
  return false;
}

/** Suffixes home routers and mDNS give machine names (dadlaptop.local, dadlaptop.lan). */
const LOCAL_SUFFIXES = ['.local', '.lan', '.home', '.internal', '.home.arpa'];

/**
 * True when the Host header names this server in a way only a local client
 * would: localhost, a private IP, this machine's name, or an allowed extra.
 * Rejecting anything else blocks DNS rebinding, where a website points its own
 * domain at a LAN address so the visitor's browser calls this app for it.
 */
export function isAllowedHost(
  hostHeader: string | undefined,
  machineName: string,
  extraAllowed: readonly string[] = [],
): boolean {
  if (!hostHeader) return false;
  let host = hostHeader.trim().toLowerCase();
  // Strip the port: "[::1]:3002" → "::1", "dadlaptop:3002" → "dadlaptop".
  host = host.startsWith('[') ? host.slice(1, host.indexOf(']')) : host.replace(/:\d+$/, '');
  host = host.replace(/\.$/, '');

  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (isIP(host)) return isPrivateAddress(host);

  const machine = machineName.toLowerCase();
  if (host === machine || LOCAL_SUFFIXES.some((s) => host === machine + s)) return true;
  return extraAllowed.includes(host);
}

/** Adds the guard to every request on the app. */
export function registerLanGuard(
  app: FastifyInstance,
  { allowedHosts, machineName = hostname() }: { allowedHosts: string[]; machineName?: string },
): void {
  app.addHook('onRequest', async (request, reply) => {
    if (!isPrivateAddress(request.ip)) {
      request.log.warn({ ip: request.ip }, 'Blocked request from outside the home network');
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'Only available on the home network' },
      });
    }
    if (!isAllowedHost(request.headers.host, machineName, allowedHosts)) {
      request.log.warn({ host: request.headers.host }, 'Blocked request with unknown Host header');
      return reply.status(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Unknown host name. Add it to ALLOWED_HOSTS in .env if this is your network.',
        },
      });
    }
  });
}
