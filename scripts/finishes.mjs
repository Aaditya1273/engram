#!/usr/bin/env node
// Rarity finishes for the collection: every 3D prop re-materialed in silver and in gold with Lux3D material
// transfer, from reference images in design/finish (gold.png, silver.png). Writes
// public/art/models/finish/<prop>-<finish>.glb and src/shared/finishes.json (which exist; task ids, timings).
// Idempotent; pass prop names and/or --gold / --silver to limit a run. Needs the raw models in design/models-raw.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { api, download, glbOf, optimise, root, upload, uploadable, waitTask } from './aholo.mjs';

const args = process.argv.slice(2);
const finishes = ['silver', 'gold'].filter((f) => !args.some((a) => a.startsWith('--')) || args.includes(`--${f}`));
const only = args.filter((a) => !a.startsWith('--'));
const RAW = path.join(root, 'design/models-raw'), OUT = path.join(root, 'public/art/models/finish');
const LOG = path.join(root, 'src/shared/finishes.json');
fs.mkdirSync(OUT, { recursive: true });
const log = fs.existsSync(LOG) ? JSON.parse(fs.readFileSync(LOG, 'utf8')) : {};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'finish-'));
const CONCURRENCY = 4;

const refs = {};
for (const f of finishes) refs[f] = await upload(path.join(root, `design/finish/${f}.png`));

// Each model goes up once (as a plain GLB under the 5 MB upload limit), then gets every finish.
const meshUrls = new Map();
async function meshUrl(name) {
  if (!meshUrls.has(name)) {
    const small = path.join(tmp, `${name}.glb`);
    uploadable(path.join(RAW, `${name}.glb`), small, 1024);
    meshUrls.set(name, upload(small));
  }
  return meshUrls.get(name);
}

async function one(name, finish) {
  const t0 = Date.now();
  const taskId = await api('POST', '/lux3d/v1/generate/material-transfer/task/create', { img: refs[finish], meshUrl: await meshUrl(name), version: 'v3.0-standard' });
  const url = glbOf(await waitTask(taskId, 20));
  if (!url) throw new Error('no GLB in the result');
  const raw = await download(url, path.join(tmp, `${name}-${finish}-raw.glb`));
  const out = path.join(OUT, `${name}-${finish}.glb`);
  optimise(raw, out, 1024);
  (log[name] ??= {})[finish] = { taskId, seconds: Math.round((Date.now() - t0) / 1000), bytes: fs.statSync(out).size };
  fs.writeFileSync(LOG, JSON.stringify(log, null, 2) + '\n');
  console.log(`${name} ${finish}: ${log[name][finish].seconds}s, ${(log[name][finish].bytes / 1e3).toFixed(0)} KB`);
}

const names = fs.readdirSync(RAW).filter((f) => f.endsWith('.glb') && !f.startsWith('lumen')).map((f) => f.slice(0, -4))
  .filter((n) => !only.length || only.includes(n));
const queue = names.flatMap((n) => finishes.map((f) => [n, f])).filter(([n, f]) => only.length || !fs.existsSync(path.join(OUT, `${n}-${f}.glb`)));
console.log(`${queue.length} finishes to make`);
const failed = [];
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  for (let job; (job = queue.shift()); ) {
    try {
      await one(...job);
    } catch (e) {
      failed.push(job.join(' '));
      console.error(`${job.join(' ')}: ${e.message}`);
    }
  }
}));
fs.rmSync(tmp, { recursive: true, force: true });
if (failed.length) {
  console.error(`failed: ${failed.join(', ')} (re-run to retry)`);
  process.exitCode = 1;
}
