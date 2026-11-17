import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DECOR } from '../shared/theme';
import { RADIUS, SCENE_Y, SLOT_COUNT, SLOT_DEG } from './layout';
import { glowTexture } from './ui';

/**
 * The rotunda's static architecture, after the palace mockup: green-marble niches with gold-lined arches,
 * pillars with gold edges and leaf banners, marble pedestals with gold rims and the leaf emblem, ivy and
 * ferns, gold rings in the floor and a sunlit oculus. Everything that repeats per alcove is merged into one
 * mesh per material (about fifteen draw calls for the whole room), which keeps Quest at frame rate.
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

/** The open roof: warm sun at the centre fading to leafy green at the rim. */
function oculusTexture() {
  return canvasTexture(256, 256, (ctx) => {
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, DECOR.sunCore);
    g.addColorStop(0.45, DECOR.sunMid);
    g.addColorStop(1, DECOR.sunEdge);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    // Branches across the glass, like the mockup's vine-laced dome.
    ctx.strokeStyle = 'rgba(70, 90, 50, 0.45)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(128 + Math.cos(a) * 128, 128 + Math.sin(a) * 128);
      ctx.quadraticCurveTo(128 + Math.cos(a + 0.5) * 70, 128 + Math.sin(a + 0.5) * 70, 128 + Math.cos(a + 0.2) * 40, 128 + Math.sin(a + 0.2) * 40);
      ctx.stroke();
    }
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

/** The alcove frame at ring slot i, matching Alcove's own placement (front faces the centre, +z). */
function slotMatrix(i: number) {
  const a = THREE.MathUtils.degToRad(i * SLOT_DEG);
  const o = new THREE.Object3D();
  o.position.set(Math.sin(a) * RADIUS, 0, -Math.cos(a) * RADIUS);
  o.lookAt(0, 0, 0);
  o.updateMatrix();
  return o.matrix;
}

export function buildDecor(ring: THREE.Object3D, room: THREE.Object3D) {
  const marble = texture('palace/marble.webp', [1.6, 1.6]);
  // Marble glows faintly from its own texture, so the veining reads even before the room has warmed up.
  const stone = (map: THREE.Texture, color = '#ffffff', glow = 0.55) =>
    new THREE.MeshLambertMaterial({ map, color, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: glow });
  const pedestalTex = texture('palace/marble.webp', [3, 1]);
  const M = {
    marble: stone(marble),
    niche: stone(marble, DECOR.nicheTint, 0.35),
    pedestal: stone(pedestalTex, '#ffffff', 0.7),
    gold: gold(),
    cap: new THREE.MeshLambertMaterial({ color: DECOR.capTop, emissive: DECOR.goldEmissive, emissiveIntensity: 0.35 }),
    emblem: new THREE.MeshBasicMaterial({ map: texture('palace/emblem.webp'), alphaTest: 0.4, color: DECOR.emblemTint }),
    banner: new THREE.MeshLambertMaterial({ map: bannerTexture(), alphaTest: 0.5, side: THREE.DoubleSide, emissive: DECOR.bannerDark, emissiveIntensity: 0.2 }),
    fern: (() => {
      const t = texture('site/fern.webp');
      return new THREE.MeshLambertMaterial({ map: t, alphaTest: 0.45, side: THREE.DoubleSide, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.3 });
    })(),
    uplight: new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55, fog: false }),
  };

  // Arched niche back: 0.54 wide, semicircular head.
  const arch = new THREE.Shape();
  arch.moveTo(-0.27, 0);
  arch.lineTo(-0.27, 1.55);
  arch.absarc(0, 1.55, 0.27, Math.PI, 0, true);
  arch.lineTo(0.27, 0);
  arch.closePath();
  // The wall around the arch, up to the cornice: a slab with the arch cut out.
  const spandrel = new THREE.Shape();
  spandrel.moveTo(-0.31, 0);
  spandrel.lineTo(-0.31, 2.02);
  spandrel.lineTo(0.31, 2.02);
  spandrel.lineTo(0.31, 0);
  spandrel.closePath();
  spandrel.holes.push(new THREE.Path(arch.getPoints(16)));
  const G = {
    niche: new THREE.ShapeGeometry(arch, 16),
    spandrel: new THREE.ShapeGeometry(spandrel, 16),
    archLine: new THREE.TorusGeometry(0.27, 0.007, 4, 28, Math.PI),
    jamb: new THREE.BoxGeometry(0.014, 1.5, 0.014),
    pillar: new THREE.BoxGeometry(0.1, 2.0, 0.1),
    pillarBand: new THREE.BoxGeometry(0.115, 0.03, 0.115),
    edge: new THREE.BoxGeometry(0.006, 1.8, 0.006),
    banner: new THREE.PlaneGeometry(0.1, 0.35),
    plinth: new THREE.CylinderGeometry(0.17, 0.175, 0.06, 28),
    shaft: new THREE.CylinderGeometry(0.14, 0.14, 0.86, 28, 1, true),
    collar: new THREE.CylinderGeometry(0.152, 0.152, 0.024, 28),
    cap: new THREE.CylinderGeometry(0.168, 0.162, 0.045, 28),
    capRim: new THREE.TorusGeometry(0.166, 0.007, 6, 36),
    emblem: new THREE.PlaneGeometry(0.085, 0.07),
    uplight: new THREE.PlaneGeometry(0.34, 0.34),
    fern: new THREE.PlaneGeometry(0.36, 0.32).translate(0, 0.16, 0),
  };

  const b = new Batch();
  const flat = Math.PI / 2;
  for (let i = 0; i < SLOT_COUNT; i++) {
    b.at(slotMatrix(i));
    // Niche and its gold-lined arch.
    b.add(G.niche, M.niche, 0, 0, -0.235);
    b.add(G.spandrel, M.marble, 0, 0, -0.225);
    b.add(G.archLine, M.gold, 0, 1.55, -0.22);
    b.add(G.jamb, M.gold, -0.27, 0.8, -0.22);
    b.add(G.jamb, M.gold, 0.27, 0.8, -0.22);
    // One pillar per boundary (the next alcove shares it): marble, gold bands and edges, a banner on every other.
    b.add(G.pillar, M.marble, 0.3, 1.0, -0.18);
    b.add(G.pillarBand, M.gold, 0.3, 0.06, -0.18);
    b.add(G.pillarBand, M.gold, 0.3, 1.95, -0.18);
    b.add(G.edge, M.gold, 0.258, 1.0, -0.128);
    b.add(G.edge, M.gold, 0.342, 1.0, -0.128);
    if (i % 2 === 0) b.add(G.banner, M.banner, 0.3, 1.5, -0.125);
    // Pedestal: marble plinth and shaft, gold rims, a pale stone cap at SCENE_Y, the emblem on its face.
    b.add(G.plinth, M.marble, 0, 0.03, 0);
    b.add(G.collar, M.gold, 0, 0.072, 0);
    b.add(G.shaft, M.pedestal, 0, 0.51, 0);
    b.add(G.collar, M.gold, 0, 0.943, 0);
    b.add(G.cap, M.cap, 0, SCENE_Y - 0.0225, 0);
    b.add(G.capRim, M.gold, 0, SCENE_Y - 0.004, 0, flat);
    b.add(G.emblem, M.emblem, 0, 0.74, 0.1415);
    // Warm uplight pooling at the pillar foot, and a fern at the base.
    b.add(G.uplight, M.uplight, 0.3, 0.17, -0.12);
    b.add(G.fern, M.fern, 0.3, 0, -0.02);
  }
  b.bake(ring);
  ring.add(ivy());

  // The room around the ring: marble floor with glowing gold rings, a cornice, the upper wall, the sunlit oculus.
  const floorTex = texture('palace/marble.webp', [7, 7]);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(2.8, 48), stone(floorTex, DECOR.floorTint, 0.35));
  floor.rotation.x = -Math.PI / 2;
  const ringMat = new THREE.MeshBasicMaterial({ color: DECOR.goldLine, transparent: true, opacity: 0.85, depthWrite: false, fog: false });
  const rings = [0.62, 1.0, 1.42].map((r, i) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(r, r + (i === 1 ? 0.012 : 0.007), 96), ringMat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.003;
    return m;
  });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(2.25, 2.25, 1.4, 40, 1, true), stone(texture('palace/marble.webp', [8, 1]), DECOR.nicheTint, 0.3));
  wall.position.y = 2.75;
  const cornice = new THREE.Mesh(new THREE.CylinderGeometry(2.05, 2.05, 0.16, 48, 1, true), stone(texture('palace/marble.webp', [10, 0.4])));
  cornice.position.y = 2.09;
  wall.material.side = cornice.material.side = THREE.BackSide;
  const corniceGold = [2.01, 2.17].map((y) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(2.04, 0.01, 4, 96), M.gold);
    m.rotation.x = Math.PI / 2;
    m.position.y = y;
    return m;
  });
  // The cornice's underside closes the gap above the alcoves.
  const soffit = new THREE.Mesh(new THREE.RingGeometry(1.75, 2.25, 48), stone(marble, DECOR.nicheTint, 0.45));
  soffit.rotation.x = Math.PI / 2;
  soffit.position.y = 2.01;
  const ceiling = new THREE.Mesh(new THREE.RingGeometry(0.85, 2.25, 48), stone(marble, DECOR.nicheTint, 0.4));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 3.45;
  const oculus = new THREE.Mesh(new THREE.CircleGeometry(0.85, 48), new THREE.MeshBasicMaterial({ map: oculusTexture(), fog: false }));
  oculus.rotation.x = Math.PI / 2;
  oculus.position.y = 3.46;
  const oculusRim = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.02, 6, 64), M.gold);
  oculusRim.rotation.x = Math.PI / 2;
  oculusRim.position.y = 3.44;
  room.add(floor, ...rings, wall, cornice, ...corniceGold, soffit, ceiling, oculus, oculusRim, sunRays());
}

/** Ivy trailing from the cornice above each pillar: one instanced draw call. */
function ivy() {
  const STRANDS = SLOT_COUNT, LEAVES = 9;
  const mesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.06, 0.06),
    new THREE.MeshLambertMaterial({ map: leafTexture(), alphaTest: 0.5, side: THREE.DoubleSide, emissive: DECOR.leafDark, emissiveIntensity: 0.5 }),
    STRANDS * LEAVES,
  );
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
  const light = new THREE.Color(DECOR.leafLight);
  let n = 0;
  for (let i = 0; i < STRANDS; i++) {
    const a = THREE.MathUtils.degToRad((i + 0.5) * SLOT_DEG);
    const len = 0.35 + ((i * 7) % 5) * 0.08; // strands of uneven length
    for (let k = 0; k < LEAVES; k++) {
      const t = k / (LEAVES - 1), r = 1.8 - 0.02 * Math.sin(k); // just in front of the pillar faces
      const sway = Math.sin(k * 1.3 + i) * 0.03;
      const y = 2.0 - t * len;
      e.set(Math.sin(k * 2.1) * 0.6, -a + Math.sin(k + i) * 0.8, (k % 2 ? 1 : -1) * 0.5);
      q.setFromEuler(e);
      const s = 0.8 + 0.4 * ((k * 13 + i) % 5) / 5;
      m.compose(new THREE.Vector3(Math.sin(a) * r + sway, y, -Math.cos(a) * r), q, new THREE.Vector3(s, s, s));
      mesh.setMatrixAt(n, m);
      mesh.setColorAt(n++, c.set('#ffffff').lerp(light, (k % 3) / 4));
    }
  }
  return mesh;
}

/** Soft sunbeams falling from the oculus. Fixed to the room (not the turning ring), mostly ahead of you. */
function sunRays() {
  const mat = new THREE.MeshBasicMaterial({ map: rayTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: 0.22, fog: false });
  const g = new THREE.Group();
  for (const [x, w, tilt] of [[-0.35, 0.35, 0.22], [0.05, 0.5, 0.3], [0.45, 0.3, 0.26]] as const) {
    const ray = new THREE.Mesh(new THREE.PlaneGeometry(w, 2.4), mat);
    ray.position.set(x, 2.25, -1.25);
    ray.rotation.x = tilt;
    g.add(ray);
  }
  return g;
}
