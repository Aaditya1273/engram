import { db } from './db';
import { newId } from './auth';

/**
 * Twist-to-3D: a learner's personal detail ("my grandmother's glasses") becomes a one-off 3D object.
 * Two Aholo Lux3D steps: text-to-3D (G1-Turbo, the minimum 10k faces), then mesh retopology down to a
 * headset budget with its texture baked at 512 px (~0.5 MB). The finished GLB is stored once, here,
 * so the object keeps working if the API later stops; the painting stays on screen until then.
 *
 * Workers can't hold a job open for minutes, so the client drives it: every status check advances the
 * job one step (generate → retopologise → store). Any failure just leaves the painting in place.
 */

const BASE = 'https://api.aholo.ai/global';
export const lux3dEnabled = () => !!process.env.AHOLO_API_KEY;

export const MODEL_PROMPT_MAX = 120;
/** Per user per day: generation spends real credits. */
export const MODELS_PER_DAY = 12;

export type ModelStatus = 'generating' | 'optimising' | 'ready' | 'failed';

async function api<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const key = process.env.AHOLO_API_KEY!;
  const res = await fetch(BASE + path, {
    method,
    headers: { authorization: key, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const j = (await res.json().catch(() => ({}))) as { c?: unknown; m?: string; d?: T };
  if (!res.ok || String(j.c) !== '0') throw new Error(`lux3d ${path}: HTTP ${res.status} ${String(j.m ?? '').replaceAll(key, '[key]')}`);
  return j.d as T;
}

interface Task {
  status: number;
  outputs?: { content?: string }[];
}
/** 0/1 running, 3 done (output URLs), 4 failed, 6 cancelled. */
const task = (id: string) => api<Task>('GET', `/lux3d/v1/generate/task/get?taskid=${id}`);

/**
 * The spoken twist, made into a prompt for one small object in the palace's painted style.
 * ponytail: no separate moderation pass; the prompt is short, capped, and Aholo applies its own policy.
 */
export function modelPrompt(text: string) {
  const subject = text.replace(/[^\p{L}\p{N}\s'’,.-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, MODEL_PROMPT_MAX);
  return `${subject}. A single small object, cute stylised 3D prop, soft hand-painted colours, centred, no base, no background.`;
}

export async function createModel(userId: string, text: string): Promise<{ id: string } | { error: string }> {
  const q = await db();
  const [{ n }] = await q<{ n: number }>(`select count(*)::int as n from models where user_id = $1 and created_at > now() - interval '1 day'`, [userId]);
  if (n >= MODELS_PER_DAY) return { error: `You can make ${MODELS_PER_DAY} objects a day. More tomorrow.` };
  const prompt = modelPrompt(text);
  const taskId = await api<number>('POST', '/lux3d/v1/generate/text-to-3d/task/create', {
    version: 'G1-Turbo', faceCount: 10000, outputFormat: ['glb'], enablePbr: true, style: 'cartoon', prompt,
  });
  const id = newId();
  await q(`insert into models (id, user_id, prompt, status, task_id) values ($1, $2, $3, 'generating', $4)`, [id, userId, text.slice(0, MODEL_PROMPT_MAX), String(taskId)]);
  return { id };
}

const glbOf = (t: Task) => t.outputs?.map((o) => o.content ?? '').find((u) => u && new URL(u).pathname.endsWith('.glb'));

/** Advances the job at most one step and returns where it is. Safe to call repeatedly from several devices. */
export async function advanceModel(userId: string, id: string): Promise<{ status: ModelStatus } | null> {
  const q = await db();
  const [row] = await q<{ status: ModelStatus; task_id: string; created_at: string }>(
    'select status, task_id, created_at from models where id = $1 and user_id = $2', [id, userId]);
  if (!row) return null;
  if (row.status === 'ready' || row.status === 'failed') return { status: row.status };
  const fail = async () => {
    await q(`update models set status = 'failed' where id = $1`, [id]);
    return { status: 'failed' as const };
  };
  // A job that never finishes (API outage) shouldn't poll forever.
  if (Date.now() - new Date(row.created_at).getTime() > 20 * 60_000) return fail();
  const t = await task(row.task_id);
  if (t.status === 4 || t.status === 6) return fail();
  if (t.status !== 3) return { status: row.status };
  const url = glbOf(t);
  if (!url) return fail();
  if (row.status === 'generating') {
    const retopo = await api<number>('POST', '/lux3d/v1/mesh-retopology/task/create', {
      modelUrl: url, faceLimit: 4000, quad: false, bakeTextures: true, textureSize: 512,
    });
    // Conditional update: two devices polling at once start one retopology, not two (the loser's task is ignored).
    await q(`update models set status = 'optimising', task_id = $2 where id = $1 and status = 'generating'`, [id, String(retopo)]);
    return { status: 'optimising' };
  }
  const glb = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!glb.ok) return { status: row.status }; // try again next poll
  const bytes = Buffer.from(await glb.arrayBuffer());
  await q(`update models set status = 'ready', glb = $2 where id = $1`, [id, bytes.toString('base64')]);
  return { status: 'ready' };
}

/** The stored GLB. Model ids are unguessable, so the file is served without a token (loaders can't send one). */
export async function modelFile(id: string): Promise<ArrayBuffer | null> {
  const q = await db();
  const [row] = await q<{ glb: string | null }>(`select glb from models where id = $1 and status = 'ready'`, [id]);
  if (!row?.glb) return null;
  const b = Buffer.from(row.glb, 'base64');
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

/**
 * Keepsake: the object as a 3D-printable file, through Lux3D's multi-format export. Started and polled like
 * generation; returns the download URL once the export is done.
 */
export async function exportModel(id: string, publicUrl: string, format: 'stl' | '3mf'): Promise<{ status: 'working' | 'failed' } | { url: string }> {
  const q = await db();
  const [row] = await q<{ export_task: string | null; export_format: string | null }>(
    `select export_task, export_format from models where id = $1 and status = 'ready'`, [id]);
  if (!row) return { status: 'failed' };
  if (!row.export_task || row.export_format !== format) {
    const t = await api<number>('POST', '/lux3d/v1/multi-format-export/task/create', { modelUrl: publicUrl, outputFormat: [format] });
    await q('update models set export_task = $2, export_format = $3 where id = $1', [id, String(t), format]);
    return { status: 'working' };
  }
  const t = await task(row.export_task);
  if (t.status === 4 || t.status === 6) {
    await q('update models set export_task = null where id = $1', [id]);
    return { status: 'failed' };
  }
  const want = format === 'stl' ? '.stl' : '.3mf';
  const url = t.status === 3 ? t.outputs?.map((o) => o.content ?? '').find((u) => u && new URL(u).pathname.toLowerCase().endsWith(want)) : undefined;
  return url ? { url } : { status: 'working' };
}
