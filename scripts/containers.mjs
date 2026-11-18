#!/usr/bin/env node
// "Open to remember": a container generated with Lux3D text-to-3D, then given a moving part with Lux3D
// articulation animation (the lid on a hinge). Writes public/art/models/chest-{body,lid}.glb and the hinge from
// the URDF to src/shared/chest.json. Resumable within the ~2 h that Aholo keeps result URLs.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { api, download, glbOf, optimise, root, waitTask } from './aholo.mjs';

const RAW = path.join(root, 'design/models-raw');
const STATE = path.join(RAW, 'chest-state.json');
const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {};
const save = () => fs.writeFileSync(STATE, JSON.stringify(state, null, 2));

if (!state.gen) {
  const t0 = Date.now();
  const taskId = await api('POST', '/lux3d/v1/generate/text-to-3d/task/create', {
    version: 'G1-Turbo', faceCount: 10000, outputFormat: ['glb'], enablePbr: true, style: 'cartoon',
    prompt: 'A small ornate wooden treasure chest with gold trim and a separate domed lid, closed, cute stylised fantasy prop, centred, no base.',
  });
  state.gen = { taskId, url: glbOf(await waitTask(taskId)), seconds: Math.round((Date.now() - t0) / 1000) };
  save();
  console.log(`text-to-3d: ${state.gen.seconds}s`);
}
if (!state.art) {
  const t0 = Date.now();
  const taskId = await api('POST', '/lux3d/v1/articulation-animation/task/create', { glbUrl: state.gen.url, prompt: 'The lid of the chest swings open upward on its back hinge, then closes.' });
  const outputs = await waitTask(taskId, 25);
  console.log('articulation outputs:', JSON.stringify(outputs).slice(0, 600));
  state.art = { taskId, outputs, seconds: Math.round((Date.now() - t0) / 1000) };
  save();
}
// Articulation returns a zip: urdf/robot.urdf (the hinge) and urdf/meshes/{body,lid}.glb (each in its link's frame).
const zip = await download(state.art.outputs[0], path.join(RAW, 'chest-articulated.zip'));
execFileSync('unzip', ['-o', '-q', zip, '-d', path.join(RAW, 'chest')]);
const urdf = fs.readFileSync(path.join(RAW, 'chest/urdf/robot.urdf'), 'utf8');
const num = (s) => s.trim().split(/\s+/).map(Number);
const joint = urdf.match(/<joint[\s\S]*?<\/joint>/)[0];
const hinge = {
  origin: num(joint.match(/origin[^>]*xyz="([^"]+)"/)[1]),
  axis: num(joint.match(/axis xyz="([^"]+)"/)[1]),
  limit: [Number(joint.match(/lower="([^"]+)"/)[1]), Number(joint.match(/upper="([^"]+)"/)[1])],
};
for (const part of ['body', 'lid']) optimise(path.join(RAW, `chest/urdf/meshes/${part}.glb`), path.join(root, `public/art/models/chest-${part}.glb`), 1024);
fs.writeFileSync(path.join(root, 'src/shared/chest.json'), JSON.stringify({
  source: `Aholo Lux3D text-to-3D (task ${state.gen.taskId}) then articulation-animation (task ${state.art.taskId}): a URDF with body and lid on a revolute hinge`,
  hinge, bodyHeight: hinge.origin[1],
}, null, 2) + '\n');
console.log('chest parts written; hinge', JSON.stringify(hinge));
