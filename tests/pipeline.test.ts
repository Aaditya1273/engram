import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { draft, mapTwist, provider } from '../server/pipeline';

// A messy but plausible model reply: fenced JSON, numbers as strings, an invented prop, only 2 scenes.
const reply = {
  topic: 'Cranial nerves',
  items: [{
    cue: 'CN X', question: 'Which cranial nerve is CN X?', answer: 'vagus', alternates: ['vagus nerve'], lang: 'en-US',
    gestureHint: 'Wave a hand down from the throat to the belly',
    scenes: [
      { mnemonic: 'A wandering vagabond walks down your body.', focus: '0', props: [
        { prop: 'person', x: '0.5', y: 0, z: 0, scale: 9, color: '#d94848' },
        { prop: 'spaceship', x: 0, y: 0, z: 0, scale: 1, color: 'red' },
      ] },
      { mnemonic: 'A vague cloud drifts down a mountain.', focus: 1, props: [
        { prop: 'mountain', x: 0, y: 0, z: 0, scale: 1, color: '#6f8a6b' },
        { prop: 'cloud', x: 0.02, y: 0.2, z: 0, scale: 0.6, color: '#ffffff' },
      ] },
    ],
  }],
};
const ok = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

// The dev config loads .env.local into process.env; these tests choose their own providers.
const KEYS = ['GEMINI_API_KEY', 'GROQ_API_KEY', 'GORQ_API_KEY', 'NVIDIA_API_KEY', 'LLM_MODEL'];
const clearKeys = () => KEYS.forEach((k) => delete process.env[k]);
beforeEach(clearKeys);
afterEach(() => {
  vi.unstubAllGlobals();
  clearKeys();
});

describe('AI drafting via an OpenAI-compatible provider', () => {
  it('calls Gemini with a JSON schema and sanitises the reply', async () => {
    process.env.GEMINI_API_KEY = 'g-key';
    const fetch = vi.fn(async () => ok('```json\n' + JSON.stringify(reply) + '\n```'));
    vi.stubGlobal('fetch', fetch);
    const r = await draft('CN X - vagus');
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer g-key');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('gemini-3.8-flash');
    expect(body.response_format.type).toBe('json_schema');
    expect(r.drafter).toBe('gemini');
    const item = r.items[0];
    expect(item.answers).toEqual(['vagus', 'vagus nerve']);
    expect(item.scenes).toHaveLength(3); // padded from 2
    const first = item.scenes[0].props;
    expect(first).toHaveLength(1); // invented prop dropped
    expect(first[0].pos[0]).toBe(0.12); // "0.5" coerced, then clamped
    expect(first[0].scale).toBe(1.2);
  });

  it('retries without response_format when the model rejects it', async () => {
    process.env.NVIDIA_API_KEY = 'n-key';
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response('response_format not supported', { status: 400 }))
      .mockResolvedValueOnce(ok(`Here you go: ${JSON.stringify(reply)}`));
    vi.stubGlobal('fetch', fetch);
    const r = await draft('CN X - vagus');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse((fetch.mock.calls[1][1] as RequestInit).body as string).response_format).toBeUndefined();
    expect((fetch.mock.calls[0][0] as string)).toBe('https://integrate.api.nvidia.com/v1/chat/completions');
    expect(r.drafter).toBe('nvidia');
  });

  it('falls back to the offline drafter when the provider fails', async () => {
    process.env.GEMINI_API_KEY = 'g-key';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('quota', { status: 429 })));
    const r = await draft('neko - cat');
    expect(r.drafter).toBe('offline');
    expect(r.items[0].display).toBe('cat');
  });

  it('prefers Gemini, honours LLM_MODEL, and is off without keys', () => {
    expect(provider()).toBeNull();
    process.env.NVIDIA_API_KEY = 'n';
    process.env.GEMINI_API_KEY = 'g';
    process.env.LLM_MODEL = 'gemini-3.5-flash-lite';
    expect(provider()).toMatchObject({ name: 'gemini', model: 'gemini-3.5-flash-lite' });
  });

  it('uses Groq when it is the only key (either spelling)', () => {
    process.env.GORQ_API_KEY = 'q';
    process.env.NVIDIA_API_KEY = 'n';
    expect(provider()).toMatchObject({ name: 'groq', baseUrl: 'https://api.groq.com/openai/v1' });
  });

  it('maps a free-form twist and keeps only known props', async () => {
    process.env.GEMINI_API_KEY = 'g-key';
    vi.stubGlobal('fetch', vi.fn(async () => ok(JSON.stringify({ color: '#7a4fbf', add: ['hat', 'dragon'] }))));
    expect(await mapTwist('make it look like my aunt Priya')).toEqual({ color: '#7a4fbf', add: ['hat'] });
  });
});
