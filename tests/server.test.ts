import { beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { useMemoryDb } from '../server/db';
import { handle } from '../server/routes';
import { offlineDraft } from '../server/pipeline';
import type { Memory, Review } from '../src/shared/types';

// Real Postgres (PGlite, in memory), real routes, offline drafter (no ANTHROPIC_API_KEY in tests).
delete process.env.ANTHROPIC_API_KEY;
useMemoryDb();

const BASE = 'http://atrium.test';
const call = async (method: string, path: string, token?: string, body?: unknown) => {
  const res = await handle(new Request(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }));
  return { status: res.status, data: (await res.json()) as any };
};

const VOCAB = 'neko - cat\ninu - dog\nmizu - water';

let headset: string;
let phone: string;

beforeAll(async () => {
  headset = (await call('POST', '/api/device', undefined, { name: 'Quest' })).data.token;
});

describe('devices and pairing', () => {
  it('rejects missing and bad tokens', async () => {
    expect((await call('GET', '/api/inbox')).status).toBe(401);
    expect((await call('GET', '/api/inbox', 'atr_dev_nope')).status).toBe(401);
  });

  it('pairs a phone with a one-time code', async () => {
    const { data } = await call('POST', '/api/pair', headset);
    expect(data.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(data.url).toContain(`/companion.html?pair=${data.code}`);
    const claim = await call('POST', '/api/pair/claim', undefined, { code: data.code.toLowerCase() });
    expect(claim.status).toBe(201);
    phone = claim.data.token;
    expect((await call('POST', '/api/pair/claim', undefined, { code: data.code })).status).toBe(404);
  });
});

describe('capture → inbox → sync', () => {
  it('drafts items into the shared inbox, never straight into the palace', async () => {
    const r = await call('POST', '/api/capture', phone, { text: VOCAB, topic: 'Japanese' });
    expect(r.status).toBe(201);
    expect(r.data.count).toBe(3);
    const inbox = await call('GET', '/api/inbox', headset);
    expect(inbox.data).toHaveLength(3);
    expect(inbox.data[0].item.scenes).toHaveLength(3);
    expect((await call('GET', '/api/me', headset)).data.memories).toHaveLength(0);
  });

  it('validates input at the boundary', async () => {
    expect((await call('POST', '/api/capture', phone, { text: '' })).status).toBe(400);
    expect((await call('POST', '/api/capture', phone, { text: 'x'.repeat(30_000) })).status).toBe(400);
    expect((await call('POST', '/api/goals', phone, { name: 'x', deadline: 'tomorrow' })).status).toBe(400);
  });

  it('syncs memories and reviews idempotently across devices', async () => {
    const inbox = (await call('GET', '/api/inbox', headset)).data;
    const item = inbox[0].item;
    const now = Date.now();
    const memory: Memory = {
      id: item.id, cue: item.cue, question: item.question, lang: item.lang, answers: item.answers, display: item.display,
      mnemonic: item.scenes[0].mnemonic, scene: item.scenes[0], topic: 'Japanese', goalWeight: 1, slot: 6, createdAt: now,
    };
    const review: Review = { id: 'r1', memoryId: item.id, at: now, grade: 'good', answerOk: true, gestureScore: null, latencyMs: 0 };
    const push = { memories: [memory], reviews: [review], streakEvents: [{ type: 'session', day: '2026-11-16' }] };
    const first = await call('POST', '/api/sync', headset, push);
    expect(first.status).toBe(200);
    await call('POST', '/api/sync', headset, { ...push, streakEvents: [] }); // retry: no duplicates
    expect((await call('POST', `/api/inbox/${inbox[0].id}/placed`, headset)).status).toBe(200);

    const fromPhone = await call('POST', '/api/sync', phone, {});
    expect(fromPhone.data.memories).toHaveLength(1);
    expect(fromPhone.data.reviews).toHaveLength(1);
    expect(fromPhone.data.streak.count).toBe(1);
    const again = await call('POST', '/api/sync', phone, { since: fromPhone.data.cursor });
    expect(again.data.reviews).toHaveLength(0);
    expect((await call('GET', '/api/inbox', headset)).data).toHaveLength(2);
  });

  it('adopts a device streak while the account streak is blank (migration), never after', async () => {
    const t = (await call('POST', '/api/device', undefined, {})).data.token;
    const local = { count: 5, best: 9, lastDay: '2026-11-15', freezes: 2, broken: null, sessionsToday: { day: '2026-11-15', n: 1 } };
    const r1 = await call('POST', '/api/sync', t, { streak: local, streakEvents: [{ type: 'recall', day: '2026-11-15' }] });
    expect(r1.data.streak).toMatchObject({ count: 5, best: 9, freezes: 2 });
    const r2 = await call('POST', '/api/sync', t, { streak: { ...local, count: 99, best: 99 } });
    expect(r2.data.streak.count).toBe(5);
  });

  it('keeps users apart', async () => {
    const stranger = (await call('POST', '/api/device', undefined, {})).data.token;
    expect((await call('GET', '/api/inbox', stranger)).data).toHaveLength(0);
    expect((await call('POST', '/api/sync', stranger, {})).data.memories).toHaveLength(0);
  });
});

describe('MCP server for agents', () => {
  let agentKey: string;
  let agentId: string;

  const connect = async (key: string) => {
    const client = new Client({ name: 'test-agent', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/api/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${key}` } },
      fetch: (input, init) => handle(new Request(input, init)),
    }));
    return client;
  };
  const result = (r: any) => JSON.parse(r.content[0].text);

  it('only accepts agent keys', async () => {
    expect((await call('POST', '/api/mcp', headset, {})).status).toBe(401);
  });

  it('lists the six tools, writes into the inbox and reads knowledge', async () => {
    const created = await call('POST', '/api/agents', phone, { name: 'Tutor' });
    agentKey = created.data.token;
    agentId = created.data.id;
    expect(created.data.mcpUrl).toBe(`${BASE}/api/mcp`);
    const client = await connect(agentKey);
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(['add_memories', 'create_goal', 'get_gaps', 'get_known', 'get_readiness', 'list_due']);

    const goal = result(await client.callTool({ name: 'create_goal', arguments: { name: 'Anatomy block', deadline: '2027-03-01' } }));
    expect(goal.name).toBe('Anatomy block');
    const added = result(await client.callTool({ name: 'add_memories', arguments: { facts: ['CN I - olfactory', 'CN X - vagus'], topic: 'Cranial nerves', goal: 'anatomy block' } }));
    expect(added.added_to_inbox).toBe(2);
    const inbox = (await call('GET', '/api/inbox', headset)).data;
    expect(inbox.filter((i: any) => i.source === 'agent' && i.goalId === goal.id)).toHaveLength(2);

    expect(result(await client.callTool({ name: 'list_due', arguments: {} }))).toHaveProperty('session_minutes');
    expect(Array.isArray(result(await client.callTool({ name: 'get_known', arguments: { topic: 'Japanese' } })))).toBe(true);
    expect(result(await client.callTool({ name: 'get_gaps', arguments: {} }))[0]).toHaveProperty('recall');
    const ready = result(await client.callTool({ name: 'get_readiness', arguments: { goal: 'Anatomy block' } }));
    expect(ready[0]).toMatchObject({ goal: 'Anatomy block', memories: 0 });
    await client.close();
  });

  it('enforces scopes and revocation', async () => {
    const ro = (await call('POST', '/api/agents', phone, { name: 'Reader', scopes: ['read'] })).data.token;
    const client = await connect(ro);
    const denied = await client.callTool({ name: 'add_memories', arguments: { text: 'a - b' } });
    expect(denied.isError).toBe(true);
    await client.close();
    expect((await call('DELETE', `/api/agents/${agentId}`, phone)).status).toBe(200);
    expect((await call('POST', '/api/mcp', agentKey, {})).status).toBe(401);
  });
});

describe('privacy', () => {
  it('exports everything and deletes the account', async () => {
    const exp = await call('GET', '/api/export', headset);
    expect(exp.data.memories).toHaveLength(1);
    expect(exp.data.reviews).toHaveLength(1);
    expect((await call('DELETE', '/api/account', headset)).status).toBe(200);
    expect((await call('GET', '/api/inbox', phone)).status).toBe(401); // tokens went with the account
  });
});

describe('offline drafter', () => {
  it('turns term–definition lines into items with three scenes', () => {
    const r = offlineDraft('1. hon – book\nrandom prose line\nかさ: umbrella');
    expect(r.items.map((i) => i.display)).toEqual(['book', 'umbrella']);
    expect(r.items[0].scenes).toHaveLength(3);
  });
});
