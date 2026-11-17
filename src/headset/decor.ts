import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DECOR } from '../shared/theme';
import { LANTERN_HOOP_Y, RADIUS, SCENE_Y, SLOT_COUNT, SLOT_DEG } from './layout';
import { glowTexture } from './ui';

/**
 * The rotunda's static architecture, after the garden-ruins mockup: a ring of free-standing marble pedestals
 * (gold rims, leaf emblem) inside a wide, warm stone arcade that opens onto a sunlit forest; vines and white
 * flowers trail from the cornice, a polished floor carries gold rings, and the lanterns hang from a gold hoop.
 * Ten wide arches rather than a pillar per pedestal keep the room open. Everything that repeats is merged into
 * one mesh per material (about twenty draw calls for the whole room), which keeps Quest at frame rate.
 */

const ART = `${import.meta.env.BASE_URL}art/`;
const loader = new THREE.TextureLoader();
function texture(path: string, repeat?: [number, number]) {
  const t = loader.load(ART + path);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}

const canvasTexture = (w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

/** A hanging pennant: forest green, gold border, the gold leaf emblem (drawn in once its image loads). */
function bannerTexture() {
  const W = 128, H = 448;
  const shape = (ctx: CanvasRenderingContext2D, inset: number) => {
    ctx.beginPath();
    ctx.moveTo(inset, inset);
    ctx.lineTo(W - inset, inset);
    ctx.lineTo(W - inset, H - 70 + inset * 0.4);
    ctx.lineTo(W / 2, H - inset * 1.6);
    ctx.lineTo(inset, H - 70 + inset * 0.4);
    ctx.closePath();
  };
  const t = canvasTexture(W, H, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, DECOR.bannerDark);
    g.addColorStop(0.5, DECOR.banner);
    g.addColorStop(1, DECOR.bannerDark);
    shape(ctx, 4);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = DECOR.goldLine;
    ctx.stroke();
    shape(ctx, 13);
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
  const img = new Image();
  img.onload = () => {
    const ctx = (t.image as HTMLCanvasElement).getContext('2d')!;
    const s = 74;
    ctx.drawImage(img, (W - s) / 2, 150, s, (s * img.height) / img.width);
    t.needsUpdate = true;
  };
  img.src = ART + 'palace/emblem.webp';
  return t;
}

/** One ivy leaf: pointed, two greens, a pale vein. */
function leafTexture() {
  return canvasTexture(64, 64, (ctx) => {
    ctx.translate(32, 32);
    ctx.beginPath();
    ctx.moveTo(0, -30);
    ctx.bezierCurveTo(22, -14, 18, 18, 0, 30);
    ctx.bezierCurveTo(-18, 18, -22, -14, 0, -30);
    const g = ctx.createLinearGradient(-20, 0, 20, 0);
    g.addColorStop(0, DECOR.leafDark);
    g.addColorStop(1, DECOR.leafLight);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(230, 240, 190, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -26);
    ctx.lineTo(0, 28);
    ctx.stroke();
  });
}

/** A soft vertical beam of sunlight: bright at the top, gone by the floor, feathered at the sides. */
function rayTexture() {
  return canvasTexture(64, 256, (ctx) => {
    const v = ctx.createLinearGradient(0, 0, 0, 256);
    v.addColorStop(0, 'rgba(255, 236, 180, 0.9)');
    v.addColorStop(0.6, 'rgba(255, 226, 160, 0.25)');
    v.addColorStop(1, 'rgba(255, 226, 160, 0)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, 64, 256);
    ctx.globalCompositeOperation = 'destination-in';
    const h = ctx.createLinearGradient(0, 0, 64, 0);
    h.addColorStop(0, 'rgba(0,0,0,0)');
    h.addColorStop(0.5, 'rgba(0,0,0,1)');
    h.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = h;
    ctx.fillRect(0, 0, 64, 256);
  });
}

const gold = () => new THREE.MeshLambertMaterial({ color: DECOR.gold, emissive: DECOR.goldEmissive, emissiveIntensity: 0.55 });

/** Collects per-alcove pieces in alcove-local space, then bakes them into one mesh per material. */
class Batch {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  constructor(private local = new THREE.Matrix4()) {}
  at(m: THREE.Matrix4) {
    this.local = m;
    return this;
  }
  add(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0) {
    const g = geo.clone();
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, 0)).setPosition(x, y, z));
    g.applyMatrix4(this.local);
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat)!.push(g);
  }
  bake(into: THREE.Object3D) {
    for (const [mat, gs] of this.parts) {
      const mesh = new THREE.Mesh(mergeGeometries(gs), mat);
      mesh.matrixAutoUpdate = false;
      into.add(mesh);
      gs.forEach((g) => g.dispose());
    }
  }
}

/** A frame on the circle at `deg` and radius `r`, facing the centre (+z inward), like the alcoves. */
function ringFrame(deg: number, r: number) {
  const a = THREE.MathUtils.degToRad(deg);
  const o = new THREE.Object3D();
  o.position.set(Math.sin(a) * r, 0, -Math.cos(a) * r);
  o.lookAt(0, 0, 0);
  o.updateMatrix();
  return o.matrix.clone();
}

/** Seeded noise so the generated textures look the same on every load. */
function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

/** Warm limestone: sandy base, mottling and faint hairline cracks. Tiles seamlessly enough at arcade scale. */
function stoneTexture() {
  const t = canvasTexture(256, 256, (ctx) => {
    const r = rng(7);
    ctx.fillStyle = DECOR.stone;
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1600; i++) {
      const v = r();
      ctx.fillStyle = v > 0.5 ? `rgba(255, 244, 214, ${0.02 + r() * 0.04})` : `rgba(60, 50, 32, ${0.02 + r() * 0.035})`;
      ctx.beginPath();
      ctx.arc(r() * 256, r() * 256, 1 + r() * 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(70, 58, 38, 0.18)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      let x = r() * 256, y = r() * 256;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 5; k++) ctx.lineTo((x += (r() - 0.5) * 40), (y += r() * 30));
      ctx.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * The floor, drawn top-down: polished stone flags in rings and spokes, gold inlay rings, and a gold
 * four-petal rosette at the centre where you sit.
 */
function floorTexture(radius: number) {
  const N = 1024, c = N / 2, px = c / radius;
  return canvasTexture(N, N, (ctx) => {
    const r = rng(3);
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, DECOR.floorLight);
    g.addColorStop(1, DECOR.floor);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, N, N);
    for (let i = 0; i < 1400; i++) {
      ctx.fillStyle = `rgba(${r() > 0.5 ? '255, 245, 220' : '20, 24, 16'}, ${0.03 + r() * 0.04})`;
      ctx.beginPath();
      ctx.arc(r() * N, r() * N, 1 + r() * 6, 0, Math.PI * 2);
      ctx.fill();
    }
    // Flagstone joints: rings, and spokes that double outward.
    ctx.strokeStyle = 'rgba(25, 28, 18, 0.35)';
    ctx.lineWidth = 2;
    const rings = [0.35, 0.8, 1.2, 1.65, 2.05, 2.5];
    rings.forEach((rr, i) => {
      ctx.beginPath();
      ctx.arc(c, c, rr * px, 0, Math.PI * 2);
      ctx.stroke();
      const inner = i ? rings[i - 1] : 0, n = 8 * 2 ** Math.min(i, 2);
      for (let k = 0; k < n; k++) {
        const a = ((k + (i % 2) * 0.5) / n) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(c + Math.cos(a) * inner * px, c + Math.sin(a) * inner * px);
        ctx.lineTo(c + Math.cos(a) * rr * px, c + Math.sin(a) * rr * px);
        ctx.stroke();
      }
    });
    // Gold inlay.
    ctx.strokeStyle = DECOR.goldLine;
    for (const [rr, w] of [[0.62, 4], [1.0, 6], [1.42, 4], [2.15, 5]] as const) {
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.arc(c, c, rr * px, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = DECOR.goldLine;
    for (let k = 0; k < 4; k++) {
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate((k * Math.PI) / 2);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(0.12 * px, 0.22 * px, 0, 0.5 * px);
      ctx.quadraticCurveTo(-0.12 * px, 0.22 * px, 0, 0);
      ctx.fill();
      ctx.restore();
    }
  });
}

/** The forest beyond the arches: bright canopy light above, layered soft foliage, sunlit haze. */
function forestTexture() {
  const W = 1024, H = 512;
  const t = canvasTexture(W, H, (ctx) => {
    const r = rng(11);
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, DECOR.forestSky);
    sky.addColorStop(0.45, DECOR.forestMid);
    sky.addColorStop(1, DECOR.forestDeep);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    // Three layers of foliage blobs, far (pale) to near (deep), wrapping horizontally.
    const layers: [number, number, string[]][] = [
      [0.25, 420, ['#a9c46e', '#93b65c', '#bcd48a']],
      [0.45, 520, ['#6d9a46', '#5d8a3c', '#7fa852']],
      [0.68, 620, ['#3f6a2e', '#355d28', '#4a7834']],
    ];
    for (const [y0, n, cols] of layers) {
      for (let i = 0; i < n; i++) {
        const x = r() * W, y = H * (y0 + r() * 0.35), rad = 6 + r() * 20;
        for (const dx of [0, -W, W]) {
          const gr = ctx.createRadialGradient(x + dx, y, 0, x + dx, y, rad);
          gr.addColorStop(0, cols[i % cols.length]);
          gr.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = gr;
          ctx.beginPath();
          ctx.arc(x + dx, y, rad, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    // Sun haze drifting through the trees.
    for (let i = 0; i < 7; i++) {
      const x = r() * W;
      const h = ctx.createLinearGradient(x, 0, x + 60, H);
      h.addColorStop(0, 'rgba(255, 240, 180, 0.22)');
      h.addColorStop(1, 'rgba(255, 240, 180, 0)');
      ctx.fillStyle = h;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 30, 0);
      ctx.lineTo(x + 120, H);
      ctx.lineTo(x + 50, H);
      ctx.fill();
    }
  });
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(3, 1);
  return t;
}

/** A small five-petal white flower with a gold heart, for the vines. */
function flowerTexture() {
  return canvasTexture(64, 64, (ctx) => {
    ctx.translate(32, 32);
    ctx.fillStyle = '#fbf7ec';
    for (let k = 0; k < 5; k++) {
      ctx.rotate((Math.PI * 2) / 5);
      ctx.beginPath();
      ctx.ellipse(0, -14, 9, 15, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#e8b84a';
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** The open sky above the cornice: sun at the centre, canopy green toward the rim. */
function canopyTexture() {
  return canvasTexture(512, 512, (ctx) => {
    const r = rng(5);
    const g = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
    g.addColorStop(0, DECOR.sunCore);
    g.addColorStop(0.28, DECOR.sunMid);
    g.addColorStop(0.62, DECOR.forestMid);
    g.addColorStop(1, DECOR.forestDeep);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 900; i++) {
      const a = r() * Math.PI * 2, d = 110 + r() * 150, rad = 5 + r() * 13;
      const x = 256 + Math.cos(a) * d, y = 256 + Math.sin(a) * d;
      const gr = ctx.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, ['#4f7c34', '#6b9a44', '#3c6428'][i % 3]);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Arcade dimensions: ten wide bays, the opening an arch on tall jambs. */
const ARCADE = { r: 2.75, bays: 10, depth: 0.32, height: 2.9, archHalf: 0.6, spring: 1.8 };

export function buildDecor(ring: THREE.Object3D, room: THREE.Object3D) {
  const stoneMap = stoneTexture();
  stoneMap.repeat.set(1.6, 1.6);
  const glowing = (map: THREE.Texture, color = '#ffffff', glow = 0.45) =>
    new THREE.MeshLambertMaterial({ map, color, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: glow });
  const marble = texture('palace/marble.webp', [3, 1]);
  const M = {
    stone: glowing(stoneMap, '#ffffff', 0.5),
    pedestal: glowing(marble, '#ffffff', 0.75),
    plinth: glowing(texture('palace/marble.webp', [2, 0.3]), '#ffffff', 0.6),
    gold: gold(),
    cap: new THREE.MeshLambertMaterial({ color: DECOR.capTop, emissive: DECOR.goldEmissive, emissiveIntensity: 0.4 }),
    emblem: new THREE.MeshBasicMaterial({ map: texture('palace/emblem.webp'), alphaTest: 0.4, color: DECOR.emblemTint }),
    banner: new THREE.MeshLambertMaterial({ map: bannerTexture(), alphaTest: 0.5, side: THREE.DoubleSide, emissive: DECOR.bannerDark, emissiveIntensity: 0.3 }),
    fern: (() => {
      const t = texture('site/fern.webp');
      return new THREE.MeshLambertMaterial({ map: t, alphaTest: 0.45, side: THREE.DoubleSide, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.4 });
    })(),
    uplight: new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5, fog: false }),
    lamp: new THREE.MeshBasicMaterial({ color: '#ffe6a8' }),
  };

  // ---- The pedestals, one per memory slot. ----
  const P = {
    plinth: new THREE.CylinderGeometry(0.19, 0.2, 0.07, 32),
    collar: new THREE.CylinderGeometry(0.165, 0.165, 0.026, 32),
    shaft: new THREE.CylinderGeometry(0.15, 0.15, SCENE_Y - 0.17, 32, 1, true),
    cap: new THREE.CylinderGeometry(0.185, 0.175, 0.05, 32),
    capRim: new THREE.TorusGeometry(0.184, 0.008, 6, 40),
    emblem: new THREE.PlaneGeometry(0.09, 0.075),
  };
  const b = new Batch();
  for (let i = 0; i < SLOT_COUNT; i++) {
    b.at(ringFrame(i * SLOT_DEG, RADIUS));
    b.add(P.plinth, M.plinth, 0, 0.035, 0);
    b.add(P.collar, M.gold, 0, 0.083, 0);
    b.add(P.shaft, M.pedestal, 0, 0.096 + (SCENE_Y - 0.17) / 2, 0);
    b.add(P.collar, M.gold, 0, SCENE_Y - 0.062, 0);
    b.add(P.cap, M.cap, 0, SCENE_Y - 0.025, 0);
    b.add(P.capRim, M.gold, 0, SCENE_Y - 0.004, 0, Math.PI / 2);
    b.add(P.emblem, M.emblem, 0, SCENE_Y * 0.66, 0.1515);
  }

  // ---- The arcade: ten bays, each a stone wall with an arched opening onto the forest. ----
  const A = ARCADE;
  const half = A.r * Math.tan(Math.PI / A.bays) + 0.02; // bay half-width at the front face, a hair of overlap
  const bay = new THREE.Shape();
  bay.moveTo(-half, 0);
  bay.lineTo(-A.archHalf, 0);
  bay.lineTo(-A.archHalf, A.spring);
  bay.absarc(0, A.spring, A.archHalf, Math.PI, 0, true);
  bay.lineTo(A.archHalf, 0);
  bay.lineTo(half, 0);
  bay.lineTo(half, A.height);
  bay.lineTo(-half, A.height);
  bay.closePath();
  const bayGeo = new THREE.ExtrudeGeometry(bay, { depth: A.depth, bevelEnabled: false, curveSegments: 20 });
  bayGeo.translate(0, 0, -A.depth); // front face at z = 0
  const archTrim = new THREE.TorusGeometry(A.archHalf, 0.014, 6, 32, Math.PI);
  const jamb = new THREE.BoxGeometry(0.028, A.spring, 0.028);
  const lamp = new THREE.BoxGeometry(0.06, 0.035, 0.03);
  const wash = new THREE.PlaneGeometry(0.26, 0.9);
  const banner = new THREE.PlaneGeometry(0.15, 0.52);
  const fern = new THREE.PlaneGeometry(0.62, 0.55).translate(0, 0.27, 0);
  for (let k = 0; k < A.bays; k++) {
    const deg = (k * 360) / A.bays;
    b.at(ringFrame(deg, A.r));
    b.add(bayGeo, M.stone);
    b.add(archTrim, M.gold, 0, A.spring, 0.016);
    b.add(jamb, M.gold, -A.archHalf, A.spring / 2, 0.016);
    b.add(jamb, M.gold, A.archHalf, A.spring / 2, 0.016);
    // Each pier: a little brass lamp at its foot washing light up the stone, and a banner on every other.
    for (const side of [-1, 1]) {
      const x = side * (half - 0.08);
      b.add(lamp, M.lamp, x, 0.2, 0.02);
      b.add(wash, M.uplight, x, 0.5, 0.03);
    }
    if (k % 2 === 0) b.add(banner, M.banner, half - 0.02, 1.95, 0.04);
    // Ferns on the steps, in front of each pier.
    b.at(ringFrame(deg + 180 / A.bays, A.r - 0.38));
    b.add(fern, M.fern, 0, 0.08, 0);
  }
  b.bake(ring);
  ring.add(vines());

  // ---- The room: steps, polished floor with its gold rings, cornice, canopy, forest, lantern hoop. ----
  const floorR = A.r - 0.45;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(floorR + 0.02, 64), glowing(floorTexture(floorR + 0.02), '#ffffff', 0.4));
  floor.rotation.x = -Math.PI / 2;
  const ringMat = new THREE.MeshBasicMaterial({ color: DECOR.goldLine, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const glowRings = [1.0, 2.15].map((r) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(r - 0.006, r + 0.006, 128), ringMat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.004;
    return m;
  });
  const steps = new THREE.Mesh(
    new THREE.LatheGeometry([floorR, 0, floorR, 0.08, floorR + 0.22, 0.08, floorR + 0.22, 0.16, A.r + 0.4, 0.16].reduce<THREE.Vector2[]>(
      (pts, v, i, a) => (i % 2 ? pts : [...pts, new THREE.Vector2(v, a[i + 1])]), []), 96),
    glowing(stoneMap, '#d9ccb0', 0.4),
  );
  (steps.material as THREE.Material).side = THREE.DoubleSide; // lathe winding faces inward
  const cornice = new THREE.Mesh(new THREE.CylinderGeometry(A.r + 0.05, A.r + 0.05, 0.22, 96, 1, true), M.stone);
  cornice.position.y = A.height + 0.11;
  (cornice.material as THREE.Material).side = THREE.DoubleSide;
  const corniceGold = [A.height + 0.01, A.height + 0.21].map((y) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(A.r + 0.06, 0.012, 4, 128), M.gold);
    m.rotation.x = Math.PI / 2;
    m.position.y = y;
    return m;
  });
  const canopyWall = new THREE.Mesh(new THREE.CylinderGeometry(A.r + 0.6, A.r + 0.6, 1.2, 64, 1, true),
    new THREE.MeshBasicMaterial({ map: forestTexture(), side: THREE.BackSide, fog: false, color: '#c9d6a8' }));
  canopyWall.position.y = A.height + 0.75;
  const canopy = new THREE.Mesh(new THREE.CircleGeometry(A.r + 0.6, 64), new THREE.MeshBasicMaterial({ map: canopyTexture(), fog: false }));
  canopy.rotation.x = Math.PI / 2;
  canopy.position.y = A.height + 1.35;
  const forest = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 7, 64, 1, true), new THREE.MeshBasicMaterial({ map: forestTexture(), side: THREE.BackSide, fog: false }));
  forest.position.y = 2.6;
  const forestFloor = new THREE.Mesh(new THREE.RingGeometry(A.r, 6, 64), new THREE.MeshBasicMaterial({ color: DECOR.forestDeep, fog: false }));
  forestFloor.rotation.x = -Math.PI / 2;
  forestFloor.position.y = 0.001;
  // The lanterns hang on chains from a gold hoop under the canopy.
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(RADIUS - 0.04, 0.012, 6, 160), M.gold); // lanterns hang 4 cm in front of centre
  hoop.rotation.x = Math.PI / 2;
  hoop.position.y = LANTERN_HOOP_Y;
  room.add(floor, ...glowRings, steps, cornice, ...corniceGold, canopyWall, canopy, forest, forestFloor, hoop, sunRays());
}

/** Vines with white flowers trailing from the cornice over the piers: two instanced draw calls. */
function vines() {
  const A = ARCADE, STRANDS = A.bays * 2, LEAVES = 14, FLOWERS = 4;
  const leafMat = new THREE.MeshLambertMaterial({ map: leafTexture(), alphaTest: 0.5, side: THREE.DoubleSide, emissive: DECOR.leafLight, emissiveIntensity: 0.35 });
  const leaves = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.1, 0.1), leafMat, STRANDS * LEAVES);
  const flowers = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.07, 0.07), new THREE.MeshBasicMaterial({ map: flowerTexture(), alphaTest: 0.5, side: THREE.DoubleSide }), STRANDS * FLOWERS);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
  const light = new THREE.Color(DECOR.leafLight), r = rng(9);
  let nl = 0, nf = 0;
  const half = Math.atan(Math.tan(Math.PI / A.bays) * 0.82); // over the piers, either side of each bay
  for (let s = 0; s < STRANDS; s++) {
    const bayAngle = (Math.floor(s / 2) * Math.PI * 2) / A.bays;
    const a = bayAngle + (s % 2 ? half : -half) + (r() - 0.5) * 0.06;
    const len = 0.6 + r() * 0.9, rad = A.r - 0.08;
    for (let k = 0; k < LEAVES; k++) {
      const t = k / (LEAVES - 1);
      const y = A.height + 0.05 - t * len, sway = Math.sin(t * 5 + s) * 0.05;
      const pos = new THREE.Vector3(Math.sin(a) * rad + Math.cos(a) * sway, y, -Math.cos(a) * rad + Math.sin(a) * sway);
      e.set((r() - 0.5) * 1.2, -a + (r() - 0.5) * 1.6, (r() - 0.5) * 1.4);
      q.setFromEuler(e);
      const sc = 0.7 + r() * 0.6;
      m.compose(pos, q, new THREE.Vector3(sc, sc, sc));
      leaves.setMatrixAt(nl, m);
      leaves.setColorAt(nl++, c.set('#ffffff').lerp(light, r() * 0.5));
      if (k % Math.ceil(LEAVES / FLOWERS) === 2 && nf < STRANDS * FLOWERS) {
        e.set(0, -a, r() * 3);
        q.setFromEuler(e);
        m.compose(pos.clone().add(new THREE.Vector3(Math.sin(a), 0, -Math.cos(a)).multiplyScalar(-0.03)), q, new THREE.Vector3(1, 1, 1));
        flowers.setMatrixAt(nf++, m);
      }
    }
  }
  flowers.count = nf;
  const g = new THREE.Group();
  g.add(leaves, flowers);
  return g;
}

/** Soft sunbeams falling from the canopy. Fixed to the room (not the turning ring), ahead of you. */
function sunRays() {
  const mat = new THREE.MeshBasicMaterial({ map: rayTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: 0.3, fog: false });
  const g = new THREE.Group();
  for (const [x, w, tilt, z] of [[-0.6, 0.45, 0.3, -2.0], [0.0, 0.7, 0.36, -2.2], [0.65, 0.4, 0.28, -1.9], [-1.4, 0.5, 0.3, -1.5], [1.4, 0.5, 0.3, -1.5]] as const) {
    const ray = new THREE.Mesh(new THREE.PlaneGeometry(w, 3.2), mat);
    ray.position.set(x, 2.3, z);
    ray.rotation.set(tilt, 0, x * -0.15);
    g.add(ray);
  }
  return g;
}
