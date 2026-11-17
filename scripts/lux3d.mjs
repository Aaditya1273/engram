#!/usr/bin/env node
// Turns every painted prop (public/art/props/*.webp) into a real 3D model with Aholo Lux3D image-to-3D, then
// shrinks it for a standalone headset: meshopt geometry, 1024 px WebP textures (8 MB -> ~200 KB).
// Writes public/art/models/<name>.glb plus src/shared/models.json (which props have a model; task ids and timings).
// Idempotent: props that already have a model are skipped, so a failed run can simply be re-run.
// Needs AHOLO_API_KEY (env or .env.local), ImageMagick 7, and npx (for @gltf-transform/cli).
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const envFile = path.join(root, '.env.local');
const fileEnv = fs.existsSync(envFile)
  ? Object.fromEntries(fs.readFileSync(envFile, 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
  : {};
const KEY = process.env.AHOLO_API_KEY || fileEnv.AHOLO_API_KEY;
if (!KEY) throw new Error('Set AHOLO_API_KEY');
const BASE = 'https://api.aholo.ai/global';
const SKIP = new Set(['lantern']); // decor, not a memory prop
const CONCURRENCY = 4; // free accounts run 5 tasks at once
const only = process.argv.slice(2);

const PROPS = path.join(root, 'public/art/props'), OUT = path.join(root, 'public/art/models');
const RAW = path.join(root, 'design/models-raw'), LOG = path.join(root, 'src/shared/models.json');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(RAW, { recursive: true });
const log = fs.existsSync(LOG) ? JSON.parse(fs.readFileSync(LOG, 'utf8')) : {};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lux3d-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const _fetch = globalThis.fetch;
/** The upload and download hosts drop the odd connection; retry network errors (not HTTP errors) a few times. */
const fetch = async (url, init) => {
  for (let i = 0; ; i++) {
    try {
      return await _fetch(url, init);
    } catch (e) {
      if (i >= 4) throw e;
      await sleep(2000 * (i + 1));
    }
  }
};

async function api(method, p, body) {
  const r = await fetch(BASE + p, {
    method,
    headers: { Authorization: KEY, Accept: 'application/json', ...(body && { 'Content-Type': 'application/json' }) },
    body: body && JSON.stringify(body),
  });
  const j = await r.json();
  if (r.status !== 200 || String(j.c) !== '0') throw new Error(`${p}: HTTP ${r.status} ${String(j.m ?? '').replaceAll(KEY, '[key]')}`);
  return j.d;
}

/** Lux3D reads images from a URL; WebP input fails, so each painting goes up as PNG through Aholo's asset upload. */
async function upload(file) {
  const tj = await (await fetch(BASE + '/asset/v1/token', { headers: { Authorization: KEY, Accept: 'application/json' } })).json();
  const tok = tj.d ?? tj;
  const buf = fs.readFileSync(file);
  const fd = new FormData();
  fd.append('md5', crypto.createHash('md5').update(buf).digest('hex'));
  fd.append('file', new Blob([buf]), path.basename(file));
  const h = { Accept: 'application/json', 'ous-token-v2': tok.ousToken };
  await fetch(tok.globalDomain + '/ous/api/v2/single/upload', { method: 'POST', headers: h, body: fd });
  for (let i = 0; i < 60; i++) {
    const s = (await (await fetch(tok.globalDomain + '/ous/api/v2/upload/status', { headers: h })).json()).d;
    if (s?.status === 5) return s.url;
    if (s?.status === 6 || s?.status === 8) throw new Error('upload failed');
    await sleep(1000);
  }
  throw new Error('upload timed out');
}

async function waitTask(id) {
  for (let i = 0; i < 120; i++) {
    await sleep(5000);
    const d = await api('GET', `/lux3d/v1/generate/task/get?taskid=${id}`);
    if (d.status === 3) return d.outputs.map((o) => o.content);
    if (d.status === 4 || d.status === 6) throw new Error(`task ${id} ${d.status === 4 ? 'failed' : 'cancelled'}`);
  }
  throw new Error(`task ${id} timed out`);
}

async function one(name) {
  const t0 = Date.now();
  const png = path.join(tmp, `${name}.png`);
  execFileSync('magick', [path.join(PROPS, `${name}.webp`), png]);
  const img = await upload(png);
  const taskId = await api('POST', '/lux3d/v1/generate/img-to-3d/task/create', { version: 'G1-Turbo', faceCount: 10000, outputFormat: ['glb'], enablePbr: true, img });
  const urls = await waitTask(taskId);
  const glb = urls.find((u) => new URL(u).pathname.endsWith('.glb'));
  const raw = path.join(RAW, `${name}.glb`);
  fs.writeFileSync(raw, Buffer.from(await (await fetch(glb)).arrayBuffer()));
  const out = path.join(OUT, `${name}.glb`);
  execFileSync('npx', ['-y', '@gltf-transform/cli@4', 'optimize', raw, out, '--compress', 'meshopt', '--texture-compress', 'webp', '--texture-size', '1024'], { stdio: 'ignore' });
  log[name] = { taskId, seconds: Math.round((Date.now() - t0) / 1000), rawBytes: fs.statSync(raw).size, bytes: fs.statSync(out).size };
  fs.writeFileSync(LOG, JSON.stringify(log, null, 2) + '\n');
  console.log(`${name}: ${log[name].seconds}s, ${(log[name].rawBytes / 1e6).toFixed(1)} MB -> ${(log[name].bytes / 1e3).toFixed(0)} KB`);
}

const queue = fs.readdirSync(PROPS).filter((f) => f.endsWith('.webp')).map((f) => f.slice(0, -5))
  .filter((n) => !SKIP.has(n) && (only.length ? only.includes(n) : !fs.existsSync(path.join(OUT, `${n}.glb`))));
console.log(`${queue.length} props to generate`);
const failed = [];
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  for (let n; (n = queue.shift()); ) {
    try {
      await one(n);
    } catch (e) {
      failed.push(n);
      console.error(`${n}: ${e.message}${e.cause ? ` (${e.cause.code ?? e.cause.message})` : ""}`);
    }
  }
}));
fs.rmSync(tmp, { recursive: true, force: true });
if (failed.length) {
  console.error(`failed: ${failed.join(' ')} (re-run to retry)`);
  process.exitCode = 1;
}
