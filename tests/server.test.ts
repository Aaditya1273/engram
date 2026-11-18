import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { useMemoryDb } from '../server/db';
import { handle } from '../server/routes';
import { offlineDraft } from '../server/pipeline';
import { htmlToText, safeUrl, settle } from '../server/palace';
import type { Memory, Review } from '../src/shared/types';

// Real Postgres (PGlite, in memory), real routes, offline drafter (no AI keys in tests).
for (const k of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'GORQ_API_KEY', 'NVIDIA_API_KEY', 'AHOLO_API_KEY']) delete process.env[k];
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

  it('lists the eight tools, writes into the inbox and reads knowledge', async () => {
    const created = await call('POST', '/api/agents', phone, { name: 'Tutor' });
    agentKey = created.data.token;
    agentId = created.data.id;
    expect(created.data.mcpUrl).toBe(`${BASE}/api/mcp`);
    const client = await connect(agentKey);
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(['add_memories', 'build_palace', 'create_goal', 'get_gaps', 'get_journey', 'get_known', 'get_readiness', 'list_due']);
    const built = result(await client.callTool({ name: 'build_palace', arguments: { topic: 'Planets', text: 'Mercury - first\nVenus - second\nEarth - third' } }));
    expect(built.stops.map((s: { answer: string }) => s.answer)).toEqual(['first', 'second', 'third']);

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

describe('twist-to-3D (Aholo Lux3D, mocked)', () => {
  let headset: string;
  beforeAll(async () => {
    headset = (await call('POST', '/api/device', undefined, { name: 'Quest 3D' })).data.token;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.AHOLO_API_KEY;
  });

  it('generates, retopologises, stores the GLB once, and serves it without a token', async () => {
    process.env.AHOLO_API_KEY = 'k';
    const real = globalThis.fetch;
    const created: string[] = [];
    let polls = 0;
    const lux = (d: unknown) => new Response(JSON.stringify({ c: '0', m: '', d }), { status: 200 });
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/task/create')) {
        created.push(url.split('/lux3d/v1/')[1]);
        expect((init!.headers as Record<string, string>).authorization).toBe('k'); // raw key, no Bearer
        return lux(created.length === 1 ? 101 : 202);
      }
      if (url.includes('/task/get')) {
        polls++;
        const done = url.endsWith('101') ? polls > 1 : true;
        return lux({ status: done ? 3 : 1, outputs: [{ content: url.endsWith('101') ? 'https://cdn.test/gen/tex_mesh.glb' : 'https://cdn.test/low/retopology.glb' }, { content: 'https://cdn.test/low/retopology.obj' }] });
      }
      if (url === 'https://cdn.test/low/retopology.glb') return new Response(new Uint8Array([103, 108, 84, 70]));
      return real(url, init);
    }));
    const { status, data } = await call('POST', '/api/models', headset, { text: "my grandmother's round glasses" });
    expect(status).toBe(201);
    expect(created[0]).toBe('generate/text-to-3d/task/create');
    expect((await call('GET', `/api/models/${data.id}`, headset)).data.status).toBe('generating');
    expect((await call('GET', `/api/models/${data.id}`, headset)).data.status).toBe('optimising');
    expect(created[1]).toBe('mesh-retopology/task/create');
    expect((await call('GET', `/api/models/${data.id}`, headset)).data.status).toBe('ready');
    const glb = await handle(new Request(`${BASE}/api/models/${data.id}.glb`));
    expect(glb.headers.get('content-type')).toBe('model/gltf-binary');
    expect(new Uint8Array(await glb.arrayBuffer())).toEqual(new Uint8Array([103, 108, 84, 70]));
    // Another account can't see the job.
    const other = (await call('POST', '/api/device', undefined, { name: 'Other' })).data.token;
    expect((await call('GET', `/api/models/${data.id}`, other)).status).toBe(404);
  });

  it('is off without a key, and capped per day', async () => {
    expect((await call('POST', '/api/models', headset, { text: 'a teapot' })).status).toBe(503);
    process.env.AHOLO_API_KEY = 'k';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ c: '0', d: 7 }))));
    const fresh = (await call('POST', '/api/device', undefined, { name: 'Cap' })).data.token;
    const codes = [];
    for (let i = 0; i < 13; i++) codes.push((await call('POST', '/api/models', fresh, { text: `thing ${i}` })).status);
    expect(codes.slice(0, 12).every((c) => c === 201)).toBe(true);
    expect(codes[12]).toBe(429);
  });
});

describe('speech, caps and abuse limits', () => {
  let dev: string;
  beforeAll(async () => {
    dev = (await call('POST', '/api/device', undefined, { name: 'Quest STT' })).data.token;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const k of ['GROQ_API_KEY', 'CAP_STT_DAY', 'CAP_LUX3D_DAY', 'AHOLO_API_KEY']) delete process.env[k];
  });
  const audio = (token: string | undefined, bytes = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4])) =>
    handle(new Request(`${BASE}/api/transcribe?lang=ja-JP`, {
      method: 'POST', body: bytes, headers: { 'content-type': 'audio/webm;codecs=opus', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    }));

  it('transcribes a short clip with Whisper on Groq, language hint and all', async () => {
    process.env.GROQ_API_KEY = 'g';
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ text: ' Neko. ' })));
    vi.stubGlobal('fetch', fetch);
    expect((await audio(undefined)).status).toBe(401);
    const res = await audio(dev);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { alternatives: string[] }).alternatives).toEqual(['Neko.', 'Neko']);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.groq.com/openai/v1/audio/transcriptions');
    const form = init!.body as FormData;
    expect(form.get('language')).toBe('ja');
    expect(form.get('model')).toBe('whisper-large-v3-turbo');
  });

  it('refuses oversized clips and is off without a key', async () => {
    expect((await audio(dev)).status).toBe(503);
    process.env.GROQ_API_KEY = 'g';
    expect((await audio(dev, new Uint8Array(3_100_000))).status).toBe(413);
  });

  it('stops at the deployment-wide daily cap', async () => {
    process.env.GROQ_API_KEY = 'g';
    process.env.CAP_STT_DAY = '2';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ text: 'x' }))));
    const codes = [];
    for (let i = 0; i < 4; i++) codes.push((await audio(dev)).status);
    expect(codes.filter((c) => c === 429).length).toBeGreaterThan(0);
  });

  it('limits new devices per Cloudflare client IP', async () => {
    const codes = [];
    for (let i = 0; i < 12; i++) {
      const res = await handle(new Request(`${BASE}/api/device`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.7' } }));
      codes.push(res.status);
    }
    expect(codes.slice(0, 10).every((c) => c === 201)).toBe(true);
    expect(codes[10]).toBe(429);
  });
});

describe('World Builder', () => {
  let dev: string;
  beforeAll(async () => {
    dev = (await call('POST', '/api/device', undefined, { name: 'Builder' })).data.token;
  });

  it('turns ordered notes into one journey in the inbox, stops in order (offline drafter)', async () => {
    const notes = 'CN I - olfactory\nCN II - optic\nCN III - oculomotor\nCN IV - trochlear';
    const { status, data } = await call('POST', '/api/palace', dev, { text: notes, name: 'Cranial nerves' });
    expect(status).toBe(201);
    expect(data.count).toBe(4);
    expect(data.drafter).toBe('offline');
    const inbox = (await call('GET', '/api/inbox', dev)).data as { id: string; item: { display: string; scenes: unknown[]; journey: { id: string; name: string; index: number } } }[];
    const mine = inbox.filter((e) => data.inboxIds.includes(e.id)).sort((a, b) => a.item.journey.index - b.item.journey.index);
    expect(mine.map((e) => e.item.display)).toEqual(['olfactory', 'optic', 'oculomotor', 'trochlear']);
    expect(new Set(mine.map((e) => e.item.journey.id)).size).toBe(1);
    expect(mine[0].item.journey.name).toBe('Cranial nerves');
    expect(mine[0].item.scenes).toHaveLength(1);
  });

  it('needs material, refuses private addresses, and needs a token', async () => {
    expect((await call('POST', '/api/palace', undefined, { text: 'a - b' })).status).toBe(401);
    expect((await call('POST', '/api/palace', dev, {})).status).toBe(400);
    expect((await call('POST', '/api/palace', dev, { url: 'http://localhost:5179/secret' })).status).toBe(400);
    expect((await call('POST', '/api/palace', dev, { url: 'http://192.168.1.4/' })).status).toBe(400);
  });

  it('gives every drafted scene a footing and keeps painted colours', () => {
    const s = settle({ mnemonic: 'm', props: [{ prop: 'sun', pos: [0, 0.2, 0], color: '#ffffff' }, { prop: 'ball', pos: [0.05, 0.09, 0] }] });
    expect(s.props.map((p) => p.pos[1])).toEqual([0.2, 0]);
    expect(s.props.every((p) => p.color === undefined)).toBe(true);
  });

  it('reads web pages as plain text and only public http(s) addresses', () => {
    expect(htmlToText('<html><head><style>x{}</style><script>alert(1)</script></head><body><h1>Nerves</h1><p>Olfactory &amp; optic</p></body></html>'))
      .toBe('Nerves\nOlfactory & optic');
    expect(safeUrl('https://en.wikipedia.org/wiki/Cranial_nerves')).not.toBeNull();
    for (const bad of ['file:///etc/passwd', 'http://127.0.0.1/', 'http://10.0.0.2/', 'http://169.254.169.254/latest', 'http://[::1]/', 'not a url']) expect(safeUrl(bad)).toBeNull();
  });
});

describe('Lumen quiz', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GEMINI_API_KEY;
  });

  it('rewords questions, and drops any that give the answer away', async () => {
    const dev = (await call('POST', '/api/device', undefined, { name: 'Quiz' })).data.token;
    process.env.GEMINI_API_KEY = 'g';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ questions: [
      { id: 'a', prompt: 'Which gas is most of the air?' },
      { id: 'b', prompt: 'Is the vagus nerve number ten?' },
      { id: 'zzz', prompt: 'Not one of ours' },
    ] }) } }] }))));
    const r = await call('POST', '/api/quiz', dev, { items: [
      { id: 'a', question: 'Element 7?', answer: 'Nitrogen', cue: 'element 7' },
      { id: 'b', question: 'CN X?', answer: 'Vagus', cue: 'CN X' },
    ] });
    expect(r.status).toBe(200);
    expect(r.data.questions).toEqual([{ id: 'a', prompt: 'Which gas is most of the air?' }]);
  });
});

describe('arena', () => {
  let ann: string, bo: string;
  beforeAll(async () => {
    ann = (await call('POST', '/api/device', undefined, { name: 'Ann' })).data.token;
    bo = (await call('POST', '/api/device', undefined, { name: 'Bo' })).data.token;
  });
  afterEach(() => vi.useRealTimers());

  it('gives every learner a profile with a friend code and a heatmap of reviews', async () => {
    const p = (await call('GET', '/api/profile', ann)).data;
    expect(p.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(p.name).toMatch(/^Learner /);
    const renamed = (await call('PATCH', '/api/profile', ann, { name: 'Ann', rushBest: 1200 })).data;
    expect(renamed.name).toBe('Ann');
    expect(renamed.rushBest).toBe(1200);
    expect((await call('PATCH', '/api/profile', ann, { rushBest: 500 })).data.rushBest).toBe(1200); // best only goes up
    expect(typeof p.heatmap).toBe('object');
  });

  it('makes friends both ways by code; a cheer gives one freeze a day', async () => {
    const boCode = (await call('GET', '/api/profile', bo)).data.code;
    expect((await call('POST', '/api/friends', ann, { code: 'ZZZZZZ' })).status).toBe(404);
    expect((await call('POST', '/api/friends', ann, { code: boCode.toLowerCase() })).status).toBe(201);
    expect((await call('GET', '/api/friends', bo)).data.map((f: { name: string }) => f.name)).toEqual(['Ann']);
    expect((await call('POST', `/api/friends/${boCode}/cheer`, ann)).data.result).toBe('sent');
    expect((await call('POST', `/api/friends/${boCode}/cheer`, ann)).data.result).toBe('already');
    expect((await call('GET', '/api/me', bo)).data.streak.freezes).toBe(1);
  });

  it('runs the daily challenge on the server clock: no instant finishes, no replays, ranked boards', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const t0 = Date.UTC(2026, 10, 18, 10);
    vi.setSystemTime(t0);
    const run = (await call('POST', '/api/challenge/start', ann, {})).data;
    expect(run.items).toHaveLength(20);
    expect((await call('POST', '/api/challenge/finish', ann, { runId: run.runId, answers: run.items })).status).toBe(409); // 0 s: too fast
    vi.setSystemTime(t0 + 240_000);
    const done = (await call('POST', '/api/challenge/finish', ann, { runId: run.runId, answers: run.items })).data;
    expect(done.correct).toBe(20);
    expect((await call('POST', '/api/challenge/start', ann, {})).status).toBe(409); // one go a day
    // A player who never opened their profile still shows on the board.
    const cy = (await call('POST', '/api/device', undefined, { name: 'Cy' })).data.token;
    const cRun = (await call('POST', '/api/challenge/start', cy, {})).data;
    const bRun = (await call('POST', '/api/challenge/start', bo, {})).data;
    vi.setSystemTime(t0 + 300_000);
    await call('POST', '/api/challenge/finish', bo, { runId: bRun.runId, answers: bRun.items.slice(0, 8) });
    await call('POST', '/api/challenge/finish', cy, { runId: cRun.runId, answers: cRun.items.slice(0, 3) });
    expect((await call('GET', '/api/challenge/board?scope=global', cy)).data.rows.some((r: { you: boolean }) => r.you)).toBe(true);
    const rows = (await call('GET', '/api/challenge/board?scope=friends', ann)).data.rows;
    expect(rows.map((r: { name: string; correct: number }) => [r.name, r.correct])).toEqual([['Ann', 20], [expect.stringMatching(/Learner/), 8]]);
    expect(rows[0].you).toBe(true);
  });

  it('runs duels on their own seed, and leagues by memories kept', async () => {
    const duel = (await call('POST', '/api/duels', ann)).data.code;
    const a = (await call('POST', '/api/challenge/start', ann, { duel })).data;
    const b = (await call('POST', '/api/challenge/start', bo, { duel })).data;
    expect(a.items).toEqual(b.items);
    expect((await call('POST', '/api/challenge/start', ann, { duel: 'NOPE1' })).status).toBe(404);
    expect((await call('GET', '/api/league', ann)).data).toBeNull();
    const l = (await call('POST', '/api/league', ann)).data;
    expect(l.members[0]).toMatchObject({ rank: 1, you: true, kept: 0 });
  });
});

describe('creator palaces', () => {
  it('publishes a journey without the personal bits, and copies it into another inbox', async () => {
    const maker = (await call('POST', '/api/device', undefined, { name: 'Maker' })).data.token;
    const learner = (await call('POST', '/api/device', undefined, { name: 'Learner' })).data.token;
    const stop = (i: number, display: string) => ({
      id: `cn-${i}`, cue: `CN ${i + 1}`, question: `Cranial nerve ${i + 1}?`, lang: 'en-US', answers: [display], display, mnemonic: 'm',
      scene: { mnemonic: 'm', props: [{ prop: 'star', pos: [0, 0, 0] }, { prop: 'star', pos: [0.1, 0, 0], model: { id: 'private', ready: true } }] },
      twist: 'my secret twist', topic: 'Nerves', goalWeight: 1, slot: i, createdAt: 0,
      journey: { id: 'j-nerves', name: 'Cranial nerves', index: i, link: i === 0 ? 'and then…' : undefined },
    });
    await call('POST', '/api/sync', maker, { memories: [stop(1, 'Optic'), stop(0, 'Olfactory')], reviews: [] });
    const t = (await call('POST', '/api/templates', maker, { journeyId: 'j-nerves' })).data;
    expect(t).toMatchObject({ name: 'Cranial nerves', stops: 2 });
    expect((await call('GET', `/api/templates/${t.code}`, learner)).data).toMatchObject({ name: 'Cranial nerves', stops: 2, copies: 0 });
    const copied = await call('POST', `/api/templates/${t.code}/copy`, learner);
    expect(copied.status).toBe(201);
    const inbox = (await call('GET', '/api/inbox', learner)).data as { item: { display: string; twist?: string; scenes: { props: { model?: unknown }[] }[]; journey: { index: number; name: string } } }[];
    const mine = inbox.filter((e) => e.item.journey?.name === 'Cranial nerves').sort((a, b) => a.item.journey.index - b.item.journey.index);
    expect(mine.map((e) => e.item.display)).toEqual(['Olfactory', 'Optic']);
    expect(mine[0].item.scenes[0].props).toHaveLength(1); // the maker's generated object stays theirs
    expect(JSON.stringify(mine)).not.toContain('secret');
    expect((await call('GET', `/api/templates/${t.code}`, learner)).data.copies).toBe(1);
    expect((await call('POST', '/api/templates/NOPE99/copy', learner)).status).toBe(404);
  });
});
