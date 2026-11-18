#!/usr/bin/env node
// Lumen, the memory coach: a small lantern spirit generated with Lux3D text-to-3D, auto-rigged, and given five
// motions by Lux3D animation retargeting (idle with a lantern, nod, dance, shake, talk). Writes
// public/art/models/lumen.glb (one file, all clips) and logs each step to src/shared/lumen.json.
import fs from 'node:fs';
import path from 'node:path';
import { api, download, glbOf, optimise, root, waitTask } from './aholo.mjs';

const RAW = path.join(root, 'design/models-raw'), OUT = path.join(root, 'public/art/models/lumen.glb');
const LOG = path.join(root, 'src/shared/lumen.json');
fs.mkdirSync(RAW, { recursive: true });
const log = { steps: [] };
// Resumable: finished steps (and their result URLs, which Aholo keeps for about two hours) are reused on a re-run.
const STATE = path.join(RAW, 'lumen-state.json');
const state = fs.existsSync(STATE) && Date.now() - fs.statSync(STATE).mtimeMs < 90 * 60_000 ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {};
const step = async (name, f) => {
  if (state[name]) return state[name];
  const t0 = Date.now();
  const r = await f();
  state[name] = r;
  fs.writeFileSync(STATE, JSON.stringify(state));
  log.steps.push({ name, seconds: Math.round((Date.now() - t0) / 1000), ...(typeof r === 'object' && r?.taskId ? { taskId: r.taskId } : {}) });
  console.log(`${name}: ${Math.round((Date.now() - t0) / 1000)}s`);
  return r;
};

const ACTIONS = ['Idle_Lantern_Loop', 'Yes', 'Dance_Loop', 'Idle_No_Loop', 'Idle_Talking_Loop'];
const prompt = 'Lumen, a small friendly lantern spirit character: a cute chibi figure with a round glowing golden lantern for a head, '
  + 'soft warm light inside, a little forest-green hooded cloak with gold trim, small arms and legs, standing upright in a relaxed A-pose, full body, facing forward.';

const gen = await step('text-to-3d', async () => {
  const taskId = await api('POST', '/lux3d/v1/generate/text-to-3d/task/create', { version: 'G1-Turbo', faceCount: 10000, outputFormat: ['glb'], enablePbr: true, style: 'cartoon', prompt });
  return { taskId, url: glbOf(await waitTask(taskId)) };
});
await download(gen.url, path.join(RAW, 'lumen-static.glb'));

const rig = await step('auto-rig', async () => {
  const taskId = await api('POST', '/lux3d/v1/animations/rig/task/create', { modelUrl: gen.url });
  const out = await waitTask(taskId, 20);
  return { taskId, url: out.find((u) => /^https?:/.test(u)) };
});
await download(rig.url, path.join(RAW, 'lumen-rigged.glb'));

const anim = await step('retarget', async () => {
  const taskId = await api('POST', '/lux3d/v1/animations/retarget/task/create', {
    rigModelUrl: rig.url, animationIds: ACTIONS, animationOutputMode: 'combined', outFormat: 'glb', animateInPlace: true,
  });
  const out = await waitTask(taskId, 20);
  const actions = JSON.parse(out[0]).actions;
  const url = actions.find((a) => a.status === 'success')?.animationGlbUrl;
  if (!url) throw new Error(`no animation delivered: ${JSON.stringify(actions).slice(0, 300)}`);
  return { taskId, url, delivered: actions.filter((a) => a.status === 'success').map((a) => a.animation_id) };
});
log.actions = anim.delivered;
const raw = await download(anim.url, path.join(RAW, 'lumen-animated.glb'));
optimise(raw, OUT, 1024);
log.bytes = fs.statSync(OUT).size;
fs.writeFileSync(LOG, JSON.stringify(log, null, 2) + '\n');
console.log(`lumen.glb ${(log.bytes / 1e3).toFixed(0)} KB, clips: ${anim.delivered.join(', ')}`);
