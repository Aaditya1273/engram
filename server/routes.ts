import { z } from 'zod';
import { authenticate, issueToken, rateLimit, type Principal, type Scope } from './auth';
import { AGENT_WRITES_PER_HOUR, handleMcp } from './mcp';
import { gaps, listDue, readiness } from './knowledge';
import { aiEnabled, mapTwist, MAX_INPUT_CHARS } from './pipeline';
import {
  capture, claimPairing, createGoal, createPairing, createUser, deleteAccount, exportAll, GoalInput, getStreak,
  listAgents, listGoals, listInbox, loadKnowledge, revokeToken, setInboxStatus, sync, SyncInput,
} from './ops';
import { db } from './db';

/** The whole API as one fetch handler: deployed as a single Vercel function, mounted in Vite for dev. */

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });

const MAX_BODY = 2_000_000;

async function body<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  const raw = await req.text();
  if (raw.length > MAX_BODY) throw new HttpError(413, 'Request too large');
  let parsed: unknown;
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
  const r = schema.safeParse(parsed);
  if (!r.success) throw new HttpError(400, r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  return r.data;
}

async function need(req: Request, kind: Principal['kind'] | 'any', scope?: Scope): Promise<Principal> {
  const who = await authenticate(req);
  if (!who) throw new HttpError(401, 'Missing or invalid token');
  if (kind !== 'any' && who.kind !== kind) throw new HttpError(403, `This endpoint needs a ${kind} token`);
  if (scope && !who.scopes.includes(scope)) throw new HttpError(403, `This token lacks the ${scope} scope`);
  return who;
}

const MCP_CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, accept, mcp-session-id, mcp-protocol-version, last-event-id',
  'access-control-expose-headers': 'mcp-session-id',
};

const CaptureInput = z.object({
  text: z.string().trim().min(1).max(MAX_INPUT_CHARS),
  topic: z.string().trim().max(60).optional(),
  goal: z.string().max(80).optional(),
  source: z.enum(['voice', 'phone']).default('phone'),
});

export async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, '');
  const m = req.method;
  try {
    // ---- MCP (agents)
    if (path === '/api/mcp') {
      if (m === 'OPTIONS') return new Response(null, { status: 204, headers: MCP_CORS });
      const who = await authenticate(req);
      if (!who || who.kind !== 'agent') return json({ error: 'Bearer agent key required. Create one in the companion: Connected agents.' }, 401, MCP_CORS);
      const res = await handleMcp(req, who);
      for (const [k, v] of Object.entries(MCP_CORS)) res.headers.set(k, v);
      return res;
    }

    if (path === '/api/health' && m === 'GET') return json({ ok: true, ai: aiEnabled(), db: process.env.DATABASE_URL ? 'postgres' : 'pglite' });

    // ---- devices & pairing
    if (path === '/api/device' && m === 'POST') {
      const { name } = await body(req, z.object({ name: z.string().max(40).default('Headset') }));
      const userId = await createUser();
      const { token } = await issueToken(userId, 'device', name, ['read', 'write']);
      return json({ token, userId }, 201);
    }
    if (path === '/api/pair' && m === 'POST') {
      const who = await need(req, 'device', 'write');
      const code = await createPairing(who.userId);
      const base = process.env.PUBLIC_BASE_URL || url.origin;
      return json({ code, url: `${base}/companion.html?pair=${code}`, expiresInSec: 600 });
    }
    if (path === '/api/pair/claim' && m === 'POST') {
      const { code } = await body(req, z.object({ code: z.string().min(4).max(12) }));
      const userId = await claimPairing(code);
      if (!userId) throw new HttpError(404, 'That code is wrong or expired. Make a new one in the headset.');
      const { token } = await issueToken(userId, 'device', 'Phone', ['read', 'write']);
      return json({ token }, 201);
    }

    // ---- sync & state
    if (path === '/api/sync' && m === 'POST') {
      const who = await need(req, 'device', 'write');
      return json(await sync(who.userId, await body(req, SyncInput)));
    }
    if (path === '/api/me' && m === 'GET') {
      const who = await need(req, 'device');
      const [streak, goals, all] = await Promise.all([getStreak(who.userId), listGoals(who.userId), loadKnowledge(who.userId)]);
      return json({
        streak,
        goals: goals.map((g) => ({ ...g, readiness: readiness(all, g) })),
        due: listDue(all),
        gaps: gaps(all, undefined, 5),
        memories: all.map((s) => ({ ...s.m, gesture: undefined, recall: Math.round(s.r * 100) / 100 })),
        ai: aiEnabled(),
      });
    }

    // ---- inbox & capture
    if (path === '/api/inbox' && m === 'GET') {
      const who = await need(req, 'device');
      return json(await listInbox(who.userId));
    }
    const inboxAction = path.match(/^\/api\/inbox\/([\w-]+)\/(placed|discard)$/);
    if (inboxAction && m === 'POST') {
      const who = await need(req, 'device', 'write');
      const ok = await setInboxStatus(who.userId, inboxAction[1], inboxAction[2] === 'placed' ? 'placed' : 'discarded');
      return ok ? json({ ok }) : json({ error: 'Not found' }, 404);
    }
    if (path === '/api/capture' && m === 'POST') {
      const who = await need(req, 'device', 'write');
      if (!(await rateLimit(who.tokenId, AGENT_WRITES_PER_HOUR * 2))) throw new HttpError(429, 'Too many captures this hour');
      const input = await body(req, CaptureInput);
      const r = await capture(who.userId, input.source, input.text, input.topic, input.goal);
      return json({ topic: r.topic, drafter: r.drafter, count: r.items.length, items: r.items.map((i) => ({ question: i.question, answer: i.display })) }, 201);
    }
    if (path === '/api/twist' && m === 'POST') {
      await need(req, 'device');
      const { text } = await body(req, z.object({ text: z.string().max(300) }));
      return json(await mapTwist(text));
    }

    // ---- goals
    if (path === '/api/goals' && m === 'GET') return json(await listGoals((await need(req, 'device')).userId));
    if (path === '/api/goals' && m === 'POST') {
      const who = await need(req, 'device', 'write');
      return json(await createGoal(who.userId, await body(req, GoalInput)), 201);
    }
    const goalDel = path.match(/^\/api\/goals\/([\w-]+)$/);
    if (goalDel && m === 'DELETE') {
      const who = await need(req, 'device', 'write');
      await (await db())('delete from goals where user_id = $1 and id = $2', [who.userId, goalDel[1]]);
      return json({ ok: true });
    }

    // ---- connected agents
    if (path === '/api/agents' && m === 'GET') return json(await listAgents((await need(req, 'device')).userId));
    if (path === '/api/agents' && m === 'POST') {
      const who = await need(req, 'device', 'write');
      const input = await body(req, z.object({ name: z.string().trim().min(1).max(60), scopes: z.array(z.enum(['read', 'write'])).min(1).default(['read', 'write']) }));
      const { id, token } = await issueToken(who.userId, 'agent', input.name, [...new Set(input.scopes)]);
      return json({ id, token, mcpUrl: `${process.env.PUBLIC_BASE_URL || url.origin}/api/mcp` }, 201);
    }
    const agentDel = path.match(/^\/api\/agents\/([\w-]+)$/);
    if (agentDel && m === 'DELETE') {
      const who = await need(req, 'device', 'write');
      return (await revokeToken(who.userId, agentDel[1])) ? json({ ok: true }) : json({ error: 'Not found' }, 404);
    }

    // ---- privacy
    if (path === '/api/export' && m === 'GET') {
      const who = await need(req, 'device');
      return json(await exportAll(who.userId), 200, { 'content-disposition': 'attachment; filename="atrium-export.json"' });
    }
    if (path === '/api/account' && m === 'DELETE') {
      const who = await need(req, 'device', 'write');
      await deleteAccount(who.userId);
      return json({ ok: true });
    }

    return json({ error: 'Not found' }, 404);
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error('[api]', err);
    return json({ error: 'Internal error' }, 500);
  }
}
