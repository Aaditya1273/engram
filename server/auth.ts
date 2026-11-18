import { db } from './db';

export type Scope = 'read' | 'write';

export interface Principal {
  tokenId: string;
  userId: string;
  kind: 'device' | 'agent';
  scopes: Scope[];
}

const enc = new TextEncoder();

export async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomToken(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return prefix + btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const newId = () => crypto.randomUUID();

/** Tokens are shown once and stored only as SHA-256 hashes. */
export async function issueToken(userId: string, kind: Principal['kind'], name: string, scopes: Scope[]) {
  const q = await db();
  const token = randomToken(kind === 'agent' ? 'atr_agent_' : 'atr_dev_');
  const id = newId();
  await q('insert into tokens (id, user_id, kind, name, scopes, hash) values ($1, $2, $3, $4, $5, $6)', [
    id, userId, kind, name.slice(0, 80), scopes, await sha256(token),
  ]);
  return { id, token };
}

export async function authenticate(req: Request): Promise<Principal | null> {
  const m = req.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i);
  if (!m) return null;
  const q = await db();
  const rows = await q<{ id: string; user_id: string; kind: Principal['kind']; scopes: Scope[] }>(
    'update tokens set last_used_at = now() where hash = $1 and not revoked returning id, user_id, kind, scopes',
    [await sha256(m[1])],
  );
  const r = rows[0];
  return r ? { tokenId: r.id, userId: r.user_id, kind: r.kind, scopes: r.scopes } : null;
}

/**
 * Fixed-window rate limit per token. Returns false when over the limit.
 * ponytail: one row per token per window, old windows never pruned; add a cleanup cron if the table grows.
 */
export async function rateLimit(tokenId: string, limit: number, windowMs = 3_600_000): Promise<boolean> {
  const q = await db();
  const start = Math.floor(Date.now() / windowMs) * windowMs;
  const rows = await q<{ count: number }>(
    `insert into rate_limits (token_id, window_start, count) values ($1, $2, 1)
     on conflict (token_id, window_start) do update set count = rate_limits.count + 1
     returning count`,
    [tokenId, start],
  );
  return rows[0].count <= limit;
}

/** New devices (accounts) per client IP per hour: device tokens are free, so this bounds per-user caps being dodged. */
export const DEVICES_PER_IP_HOUR = 10;

/**
 * The caller's IP as Cloudflare reports it (it can't be spoofed through Cloudflare), hashed so raw IPs are never
 * stored. Null without the header: local dev and tests, where there is nobody to limit.
 */
export async function clientKey(req: Request): Promise<string | null> {
  const ip = req.headers.get('cf-connecting-ip');
  return ip ? `ip:${(await sha256(ip)).slice(0, 24)}` : null;
}

/** Spend that costs real money, capped for the whole deployment per UTC day (env overrides). */
export type CapKind = 'lux3d' | 'stt' | 'agent' | 'draft';
const CAP_DEFAULTS: Record<CapKind, number> = { lux3d: 150, stt: 3000, agent: 300, draft: 600 };
export const capFor = (kind: CapKind) => Number(process.env[`CAP_${kind.toUpperCase()}_DAY`]) || CAP_DEFAULTS[kind];

/** False once the deployment has used today's allowance of this kind. */
export function globalCap(kind: CapKind): Promise<boolean> {
  return rateLimit(`global:${kind}`, capFor(kind), 86_400_000);
}
