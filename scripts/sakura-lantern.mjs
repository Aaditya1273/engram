#!/usr/bin/env node
// The moonlit theme's hanging lantern: design/art/Glowing Sakura Pagoda Lantern.png -> Lux3D image-to-3D ->
// public/art/models/sakura-lantern.glb (meshopt, 1024 px WebP). Needs AHOLO_API_KEY, ImageMagick 7 and npx.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { root, api, upload, waitTask, glbOf, download, optimise } from './aholo.mjs';

const png = path.join(os.tmpdir(), 'sakura-lantern.png');
execFileSync('magick', [path.join(root, 'design/art/Glowing Sakura Pagoda Lantern.png'), '-resize', '768x', png]);
const t0 = Date.now();
const taskId = await api('POST', '/lux3d/v1/generate/img-to-3d/task/create', { version: 'G1-Turbo', faceCount: 10000, outputFormat: ['glb'], enablePbr: true, img: await upload(png) });
const raw = await download(glbOf(await waitTask(taskId)), path.join(root, 'design/models-raw/sakura-lantern.glb'));
optimise(raw, path.join(root, 'public/art/models/sakura-lantern.glb'));
console.log(`sakura-lantern: task ${taskId}, ${Math.round((Date.now() - t0) / 1000)} s`);
