import { handle } from '../../server/routes';

interface Env {
  DATABASE_URL?: string;
  GEMINI_API_KEY?: string;
  GROQ_API_KEY?: string;
  GORQ_API_KEY?: string;
  NVIDIA_API_KEY?: string;
  AHOLO_API_KEY?: string;
  LLM_MODEL?: string;
  PUBLIC_BASE_URL?: string;
}

/**
 * Cloudflare Pages Function: every /api/* request goes to the same fetch handler used in dev.
 * Without DATABASE_URL the cloud is "not configured": the headset keeps working offline.
 */
export const onRequest = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  Object.assign(process.env, env);
  if (!env.DATABASE_URL) {
    const json = (data: unknown, status: number) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
    if (new URL(request.url).pathname === '/api/health') return json({ ok: true, ai: !!(env.GEMINI_API_KEY || env.GROQ_API_KEY || env.GORQ_API_KEY || env.NVIDIA_API_KEY), db: 'none' }, 200);
    return json({ error: 'Atrium cloud is not configured on this deployment (no database). The headset works offline.' }, 503);
  }
  return handle(request);
};
