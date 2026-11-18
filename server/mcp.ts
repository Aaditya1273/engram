import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { globalCap, rateLimit, type Principal, type Scope } from './auth';
import { gaps, known, listDue, readiness } from './knowledge';
import { capture, createGoal, GoalInput, listGoals, loadKnowledge, resolveGoal } from './ops';
import { buildPalace, fileJourney, MAX_MATERIAL } from './palace';

export const AGENT_WRITES_PER_HOUR = 30;

const text = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] });
const fail = (message: string) => ({ content: [{ type: 'text' as const, text: message }], isError: true });

/**
 * Remote MCP endpoint, stateless: a fresh server per request, bound to the caller's key.
 * Agents can write (into the inbox only, never straight into the palace) and read what the user knows.
 */
export async function handleMcp(req: Request, who: Principal): Promise<Response> {
  const server = new McpServer({ name: 'atrium', version: '0.2.0' });
  const can = (scope: Scope) => who.scopes.includes(scope);

  server.registerTool('add_memories', {
    title: 'Add things to remember',
    description:
      "Send study material or facts the user wants to remember. Atrium drafts memory items and puts them in the user's inbox; nothing enters their palace until they co-create it in the headset. Provide `text` (notes, a list, a passage) and/or `facts` (one per entry).",
    inputSchema: {
      text: z.string().max(20_000).optional().describe('Free text: notes, a vocab list, a passage'),
      facts: z.array(z.string().max(500)).max(50).optional().describe('Individual facts, e.g. "CN X — vagus nerve"'),
      topic: z.string().max(60).optional().describe('Topic / wing name, e.g. "Cranial nerves"'),
      goal: z.string().max(80).optional().describe('Goal name or id to attach these to'),
    },
  }, async ({ text: body, facts, topic, goal }) => {
    if (!can('write')) return fail('This key is read-only.');
    const material = [body ?? '', ...(facts ?? [])].join('\n').trim();
    if (!material) return fail('Provide `text` or `facts`.');
    if (!(await rateLimit(who.tokenId, AGENT_WRITES_PER_HOUR))) return fail(`Rate limit: at most ${AGENT_WRITES_PER_HOUR} writes per hour per key.`);
    if (!(await globalCap('draft'))) return fail('Atrium has reached today\'s drafting limit. Try again tomorrow.');
    const r = await capture(who.userId, 'agent', material, topic, goal);
    return text({ added_to_inbox: r.items.length, topic: r.topic, items: r.items.map((i) => ({ question: i.question, answer: i.display })), note: 'Items wait in the inbox until the user co-creates them in the headset.' });
  });

  server.registerTool('create_goal', {
    title: 'Create a goal',
    description: 'Create a goal with a deadline (e.g. an exam). Memories can be attached to it; readiness is forecast for its date.',
    inputSchema: {
      name: z.string().max(80),
      deadline: z.string().describe('YYYY-MM-DD'),
      target: z.number().min(0.5).max(0.99).optional().describe('Target recall, default 0.9'),
    },
  }, async (args) => {
    if (!can('write')) return fail('This key is read-only.');
    const parsed = GoalInput.safeParse(args);
    if (!parsed.success) return fail(`Invalid goal: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
    if (!(await rateLimit(who.tokenId, AGENT_WRITES_PER_HOUR))) return fail('Rate limit reached.');
    return text(await createGoal(who.userId, parsed.data));
  });

  server.registerTool('build_palace', {
    title: 'Build a memory palace',
    description:
      "Turn material, or just a topic, into an ORDERED memory journey: one stop per item or key point, in order, each with a vivid scene and a story link to the next stop. Use it for things that must be remembered in order (a list, steps, a timeline, a talk). It waits in the user's inbox; they walk it in, in the headset.",
    inputSchema: {
      topic: z.string().max(80).optional().describe('What to build, e.g. "The 12 cranial nerves" (used as the name, and as the material if no text is given)'),
      text: z.string().max(MAX_MATERIAL).optional().describe('Material to build from: notes, a chapter, a talk, a list'),
    },
  }, async ({ topic, text: material }) => {
    if (!can('write')) return fail('This key is read-only.');
    if (!topic && !material?.trim()) return fail('Provide `topic` or `text`.');
    if (!(await rateLimit(who.tokenId, AGENT_WRITES_PER_HOUR))) return fail(`Rate limit: at most ${AGENT_WRITES_PER_HOUR} writes per hour per key.`);
    if (!(await globalCap('draft'))) return fail('Atrium has reached today\'s drafting limit. Try again tomorrow.');
    const r = await buildPalace(material?.trim() || `Topic: ${topic}`, topic);
    if (!r.items.length) return fail('Nothing to remember was found in that.');
    const filed = await fileJourney(who.userId, 'agent', r);
    return text({ journey_id: filed.journey.id, name: r.name, stops: r.items.map((i, n) => ({ n: n + 1, room: i.room, answer: i.display })), note: 'The journey waits in the inbox until the user walks it in.' });
  });

  server.registerTool('get_journey', {
    title: 'A journey and how well it is known',
    description: "The stops of one of the user's journeys in order, with each stop's current recall probability. Omit `id` to list journeys.",
    inputSchema: { id: z.string().max(80).optional() },
  }, async ({ id }) => {
    if (!can('read')) return fail('This key cannot read.');
    const all = await loadKnowledge(who.userId);
    const stops = all.filter((s) => s.m.journey && (!id || s.m.journey.id === id));
    if (!id) {
      const byId = new Map<string, { id: string; name: string; stops: number }>();
      for (const s of stops) byId.set(s.m.journey!.id, { id: s.m.journey!.id, name: s.m.journey!.name, stops: (byId.get(s.m.journey!.id)?.stops ?? 0) + 1 });
      return text([...byId.values()]);
    }
    if (!stops.length) return fail(`No journey with id "${id}".`);
    stops.sort((a, b) => a.m.journey!.index - b.m.journey!.index);
    return text({ name: stops[0].m.journey!.name, stops: stops.map((s) => ({ n: s.m.journey!.index + 1, answer: s.m.display, recall: Math.round(s.r * 100) / 100 })) });
  });

  server.registerTool('list_due', {
    title: 'What is fading today',
    description: "Memories that are fading today and how long the user's next session will take.",
    inputSchema: {},
  }, async () => (can('read') ? text(listDue(await loadKnowledge(who.userId))) : fail('This key cannot read.')));

  server.registerTool('get_known', {
    title: 'What the user already knows',
    description: 'Facts the user reliably recalls right now (predicted recall ≥ 90%). Use it to skip re-teaching what they know.',
    inputSchema: { topic: z.string().max(60).optional() },
  }, async ({ topic }) => (can('read') ? text(known(await loadKnowledge(who.userId), topic)) : fail('This key cannot read.')));

  server.registerTool('get_gaps', {
    title: 'What the user is likely to forget',
    description: 'Facts ranked by how likely the user is to forget them, at the goal deadline if a goal is given. Use it to build practice around weak spots.',
    inputSchema: { goal: z.string().max(80).optional(), limit: z.number().int().min(1).max(50).optional() },
  }, async ({ goal, limit }) => {
    if (!can('read')) return fail('This key cannot read.');
    const g = await resolveGoal(who.userId, goal);
    if (goal && !g) return fail(`No goal named "${goal}".`);
    return text(gaps(await loadKnowledge(who.userId), g, limit));
  });

  server.registerTool('get_readiness', {
    title: 'Readiness for a goal',
    description: 'Forecast recall for a goal on its deadline: if the user stops today, and the daily reviews needed to stay on track.',
    inputSchema: { goal: z.string().max(80).optional().describe('Goal name or id; omit for all goals') },
  }, async ({ goal }) => {
    if (!can('read')) return fail('This key cannot read.');
    const all = await loadKnowledge(who.userId);
    const goals = goal ? [await resolveGoal(who.userId, goal)].filter((g) => !!g) : await listGoals(who.userId);
    if (!goals.length) return fail(goal ? `No goal named "${goal}".` : 'No goals yet. Create one with create_goal.');
    return text(goals.map((g) => readiness(all, g!)));
  });

  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(req);
}
