// Shared Aholo Lux3D client for the offline asset scripts (lux3d.mjs, lumen.mjs, finishes.mjs).
// Global region; the key comes from AHOLO_API_KEY (env or .env.local) and is never printed.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const envFile = path.join(root, '.env.local');
const fileEnv = fs.existsSync(envFile)
  ? Object.fromEntries(fs.readFileSync(envFile, 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
  : {};
const KEY = process.env.AHOLO_API_KEY || fileEnv.AHOLO_API_KEY;
if (!KEY) throw new Error('Set AHOLO_API_KEY');
const BASE = 'https://api.aholo.ai/global';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The upload and download hosts drop the odd connection; retry network errors (not HTTP errors) a few times. */
export async function fetchRetry(url, init) {
  for (let i = 0; ; i++) {
    try {
      return await fetch(url, init);
    } catch (e) {
      if (i >= 4) throw e;
      await sleep(2000 * (i + 1));
    }
  }
}

export async function api(method, p, body) {
  const r = await fetchRetry(BASE + p, {
    method,
    headers: { Authorization: KEY, Accept: 'application/json', ...(body && { 'Content-Type': 'application/json' }) },
    body: body && JSON.stringify(body),
  });
  const j = await r.json();
  if (r.status !== 200 || String(j.c) !== '0') throw new Error(`${p}: HTTP ${r.status} ${String(j.m ?? '').replaceAll(KEY, '[key]')}`);
  return j.d;
}

/** Puts a local file (image or model, up to the 5 MB single-upload size) on Aholo's asset store; returns its URL. */
export async function upload(file) {
  const tj = await (await fetchRetry(BASE + '/asset/v1/token', { headers: { Authorization: KEY, Accept: 'application/json' } })).json();
  const tok = tj.d ?? tj;
  const buf = fs.readFileSync(file);
  if (buf.length > tok.blockSize) throw new Error(`${path.basename(file)} is over the ${tok.blockSize} byte single-upload limit`);
  const fd = new FormData();
  fd.append('md5', crypto.createHash('md5').update(buf).digest('hex'));
  fd.append('file', new Blob([buf]), path.basename(file));
  const h = { Accept: 'application/json', 'ous-token-v2': tok.ousToken };
  for (let i = 0; ; i++) {
    try {
      await fetch(tok.globalDomain + '/ous/api/v2/single/upload', { method: 'POST', headers: h, body: fd, signal: AbortSignal.timeout(180_000) }).then((r) => r.text());
      break;
    } catch (e) {
      if (i >= 3) throw e;
      await sleep(3000 * (i + 1));
    }
  }
  for (let i = 0; i < 90; i++) {
    const s = (await (await fetchRetry(tok.globalDomain + '/ous/api/v2/upload/status', { headers: h })).json()).d;
    if (s?.status === 5) return s.url;
    if (s?.status === 6 || s?.status === 8) throw new Error('upload failed');
    await sleep(1000);
  }
  throw new Error('upload timed out');
}

/** Polls a Lux3D task (any kind) until it finishes; returns its output contents. 0/1 running, 3 done, 4 failed, 6 cancelled. */
export async function waitTask(id, maxMinutes = 15) {
  for (let i = 0; i < (maxMinutes * 60) / 5; i++) {
    await sleep(5000);
    const d = await api('GET', `/lux3d/v1/generate/task/get?taskid=${id}`);
    if (d.status === 3) return (d.outputs ?? []).map((o) => o.content);
    if (d.status === 4 || d.status === 6) throw new Error(`task ${id} ${d.status === 4 ? 'failed' : 'cancelled'}${d.errorMessage ? `: ${d.errorMessage}` : ''}`);
  }
  throw new Error(`task ${id} timed out`);
}

export const glbOf = (urls) => urls.find((u) => u && new URL(u).pathname.toLowerCase().endsWith('.glb'));

/** curl, not fetch: the model hosts sometimes stall mid-body, and curl retries and resumes cleanly. */
export async function download(url, file) {
  execFileSync('curl', ['-sSfL', '--retry', '6', '--retry-all-errors', '--connect-timeout', '20', '--max-time', '900', '-o', file, url]);
  return file;
}

/** Headset-ready copy: meshopt geometry and WebP textures no bigger than `size` px. Keeps skins and animations. */
export function optimise(src, out, size = 1024) {
  execFileSync('npx', ['-y', '@gltf-transform/cli@4', 'optimize', src, out, '--compress', 'meshopt', '--texture-compress', 'webp', '--texture-size', String(size)], { stdio: 'ignore' });
}

/** A plain (no meshopt) copy small enough to upload back to Aholo for a further step such as material transfer. */
export function uploadable(src, out, size = 1024) {
  execFileSync('npx', ['-y', '@gltf-transform/cli@4', 'optimize', src, out, '--compress', 'false', '--texture-compress', 'webp', '--texture-size', String(size), '--simplify', 'false'], { stdio: 'ignore' });
}
