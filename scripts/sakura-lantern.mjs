#!/usr/bin/env node
// A theme's hanging lantern: a painted lantern (transparent PNG) -> Lux3D image-to-3D -> public/art/models/<name>.glb,
// simplified to ~30% (about 4k triangles: twenty hang at once) with 512 px WebP textures.
//   node scripts/sakura-lantern.mjs ["design/art/<image>.png" <name>]   (default: the moonlit pagoda lantern)
// Needs AHOLO_API_KEY, ImageMagick 7 and npx.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { root, api, upload, waitTask, glbOf, download } from './aholo.mjs';

const [src = 'design/art/Glowing Sakura Pagoda Lantern.png', name = 'sakura-lantern'] = process.argv.slice(2);
const png = path.join(os.tmpdir(), `${name}.png`);
execFileSync('magick', [path.join(root, src), '-trim', '+repage', '-resize', '768x768>', png]);
const t0 = Date.now();
const taskId = await api('POST', '/lux3d/v1/generate/img-to-3d/task/create', { version: 'G1-Turbo', faceCount: 10000, outputFormat: ['glb'], enablePbr: true, img: await upload(png) });
const raw = await download(glbOf(await waitTask(taskId)), path.join(root, `design/models-raw/${name}.glb`));
execFileSync('npx', ['-y', '@gltf-transform/cli@4', 'optimize', raw, path.join(root, `public/art/models/${name}.glb`), '--compress', 'meshopt',
  '--texture-compress', 'webp', '--texture-size', '512', '--simplify-ratio', '0.3', '--simplify-error', '0.01'], { stdio: 'ignore' });
console.log(`${name}: task ${taskId}, ${Math.round((Date.now() - t0) / 1000)} s`);
