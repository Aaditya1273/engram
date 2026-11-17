import * as THREE from 'three';
import type { PropId } from './types';

/**
 * The prop kit: base at y = 0, about 10 cm tall at scale 1. Each prop is a painted cut-out (public/art/props)
 * that turns to face the viewer; the procedural primitives below are the fallback for a prop with no art
 * (person, for now) or art that fails to load. The scene JSON (prop id + pos/scale/colour) is the same for both.
 * ponytail: flat cut-outs, not meshes. A glTF can replace one prop's art later without touching scenes.
 */

import { PROP_HEIGHT } from './props-catalog';

export { PROP_IDS } from './props-catalog';

const geo = new Map<string, THREE.BufferGeometry>();
const g = <T extends THREE.BufferGeometry>(key: string, make: () => T): T => {
  if (!geo.has(key)) geo.set(key, make());
  return geo.get(key) as T;
};

const mat = (color: string, emissive = 0) =>
  new THREE.MeshLambertMaterial({ color, flatShading: true, emissive: emissive ? color : '#000000', emissiveIntensity: emissive });

function part(
  root: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material,
  pos: [number, number, number], scale: [number, number, number] = [1, 1, 1], rot: [number, number, number] = [0, 0, 0],
) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(...pos);
  m.scale.set(...scale);
  m.rotation.set(...rot);
  root.add(m);
  return m;
}

const sphere = () => g('sphere', () => new THREE.IcosahedronGeometry(0.5, 1));
const box = () => g('box', () => new THREE.BoxGeometry(1, 1, 1));
const cone = (seg = 6) => g(`cone${seg}`, () => new THREE.ConeGeometry(0.5, 1, seg));
const cyl = (seg = 8) => g(`cyl${seg}`, () => new THREE.CylinderGeometry(0.5, 0.5, 1, seg));

const DEFAULT_COLOR: Record<PropId, string> = {
  cat: '#e8873a', dog: '#b07a3e', bird: '#f0f0f0', book: '#3a7fbf', umbrella: '#d94848', house: '#c9a36b',
  mountain: '#6f8a6b', tree: '#3f8a4f', drop: '#5aa8e6', cloud: '#f4f6f8', fountain: '#9fb4c4', glasses: '#222222',
  hat: '#2b2b2b', ball: '#d94848', star: '#ffd24a', shoe: '#2f6fd1', sun: '#ffc93a', person: '#efc9a4',
  'cat-hug': '#e8873a', summit: '#6f8a6b', 'cat-books': '#333333', 'cat-ball': '#f2f2f2',
};

type Builder = (root: THREE.Group, c: THREE.Material, color: string) => void;

const BUILDERS: Record<PropId, Builder> = {
  cat(r, c) {
    const dark = mat('#2b2b2b');
    part(r, sphere(), c, [0, 0.04, 0], [0.11, 0.07, 0.06]);
    part(r, sphere(), c, [0.06, 0.08, 0.01], [0.055, 0.05, 0.05]);
    part(r, cone(4), c, [0.05, 0.115, 0], [0.018, 0.03, 0.018]);
    part(r, cone(4), c, [0.075, 0.115, 0.012], [0.018, 0.03, 0.018]);
    part(r, cyl(5), c, [-0.07, 0.07, 0], [0.012, 0.07, 0.012], [0, 0, 0.6]);
    part(r, sphere(), dark, [0.08, 0.085, 0.032], [0.008, 0.008, 0.008]);
    part(r, sphere(), dark, [0.065, 0.085, 0.037], [0.008, 0.008, 0.008]);
  },
  dog(r, c) {
    const dark = mat('#2b2b2b');
    part(r, sphere(), c, [0, 0.05, 0], [0.13, 0.08, 0.07]);
    part(r, sphere(), c, [0.07, 0.1, 0], [0.06, 0.06, 0.06]);
    part(r, box(), c, [0.1, 0.09, 0], [0.04, 0.03, 0.035]);
    part(r, sphere(), dark, [0.12, 0.095, 0], [0.014, 0.014, 0.014]);
    part(r, box(), dark, [0.06, 0.11, 0.03], [0.015, 0.045, 0.01], [0.3, 0, 0]);
    part(r, box(), dark, [0.06, 0.11, -0.03], [0.015, 0.045, 0.01], [-0.3, 0, 0]);
    for (const [x, z] of [[0.04, 0.025], [0.04, -0.025], [-0.04, 0.025], [-0.04, -0.025]] as const)
      part(r, cyl(5), c, [x, 0.015, z], [0.015, 0.03, 0.015]);
  },
  bird(r, c) {
    part(r, sphere(), c, [0, 0.04, 0], [0.06, 0.045, 0.045]);
    part(r, sphere(), c, [0.03, 0.065, 0], [0.032, 0.032, 0.032]);
    part(r, cone(4), mat('#f2a33a'), [0.055, 0.065, 0], [0.012, 0.025, 0.012], [0, 0, -Math.PI / 2]);
    part(r, sphere(), c, [0, 0.05, 0.03], [0.05, 0.012, 0.035], [0.5, 0, 0]);
    part(r, sphere(), c, [0, 0.05, -0.03], [0.05, 0.012, 0.035], [-0.5, 0, 0]);
  },
  book(r, c) {
    part(r, box(), c, [0, 0.015, 0], [0.12, 0.03, 0.09]);
    part(r, box(), mat('#f5efe0'), [0.004, 0.015, 0], [0.114, 0.022, 0.092]);
  },
  umbrella(r, c) {
    const pole = mat('#3b2b1f');
    part(r, cyl(6), pole, [0, 0.09, 0], [0.006, 0.18, 0.006]);
    part(r, cone(8), c, [0, 0.19, 0], [0.18, 0.055, 0.18]);
    part(r, g('handle', () => new THREE.TorusGeometry(0.015, 0.004, 4, 8, Math.PI)), pole, [0.015, 0.005, 0], [1, 1, 1], [Math.PI, 0, 0]);
  },
  house(r, c) {
    part(r, box(), c, [0, 0.04, 0], [0.12, 0.08, 0.1]);
    part(r, cone(4), mat('#8f3b2e'), [0, 0.11, 0], [0.13, 0.06, 0.13], [0, Math.PI / 4, 0]);
    part(r, box(), mat('#5a3a22'), [0, 0.025, 0.051], [0.025, 0.05, 0.004]);
  },
  mountain(r, c) {
    part(r, cone(5), c, [0, 0.1, 0], [0.24, 0.2, 0.22]);
    part(r, cone(5), mat('#f4f6f8'), [0, 0.17, 0], [0.085, 0.07, 0.078]);
  },
  tree(r, c) {
    part(r, cyl(5), mat('#6b4a2e'), [0, 0.03, 0], [0.02, 0.06, 0.02]);
    part(r, cone(6), c, [0, 0.09, 0], [0.11, 0.09, 0.11]);
    part(r, cone(6), c, [0, 0.14, 0], [0.08, 0.07, 0.08]);
  },
  drop(r, c) {
    part(r, sphere(), c, [0, 0.025, 0], [0.05, 0.05, 0.05]);
    part(r, cone(6), c, [0, 0.06, 0], [0.042, 0.045, 0.042]);
  },
  cloud(r, c) {
    part(r, sphere(), c, [0, 0.03, 0], [0.08, 0.06, 0.06]);
    part(r, sphere(), c, [0.05, 0.025, 0], [0.06, 0.05, 0.05]);
    part(r, sphere(), c, [-0.05, 0.025, 0], [0.06, 0.05, 0.05]);
    part(r, sphere(), c, [0.01, 0.055, 0], [0.06, 0.05, 0.05]);
  },
  fountain(r, c) {
    part(r, cyl(10), c, [0, 0.015, 0], [0.18, 0.03, 0.18]);
    part(r, cyl(10), mat('#5aa8e6'), [0, 0.031, 0], [0.16, 0.002, 0.16]);
    part(r, cyl(6), c, [0, 0.07, 0], [0.025, 0.1, 0.025]);
    part(r, cyl(8), c, [0, 0.125, 0], [0.08, 0.02, 0.08]);
  },
  glasses(r, c) {
    const ring = g('ring', () => new THREE.TorusGeometry(0.014, 0.003, 4, 10));
    part(r, ring, c, [0, 0, 0.016], [1, 1, 1], [0, Math.PI / 2, 0]);
    part(r, ring, c, [0, 0, -0.016], [1, 1, 1], [0, Math.PI / 2, 0]);
    part(r, box(), c, [0, 0.004, 0], [0.003, 0.003, 0.006]);
  },
  hat(r, c) {
    part(r, cyl(10), c, [0, 0.003, 0], [0.08, 0.006, 0.08]);
    part(r, cyl(10), c, [0, 0.03, 0], [0.05, 0.05, 0.05]);
    part(r, cyl(10), mat('#c94f3a'), [0, 0.012, 0], [0.052, 0.01, 0.052]);
  },
  ball(r, c) {
    part(r, sphere(), c, [0, 0.03, 0], [0.06, 0.06, 0.06]);
    part(r, g('band', () => new THREE.TorusGeometry(0.03, 0.004, 4, 12)), mat('#f2f2f2'), [0, 0.03, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
  },
  star(r, c) {
    const s = g('star', () => {
      const shape = new THREE.Shape();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + Math.PI / 2, rad = i % 2 ? 0.02 : 0.05;
        i ? shape.lineTo(Math.cos(a) * rad, Math.sin(a) * rad) : shape.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
      }
      const geom = new THREE.ExtrudeGeometry(shape, { depth: 0.015, bevelEnabled: false });
      geom.translate(0, 0.05, -0.0075);
      return geom;
    });
    part(r, s, c, [0, 0, 0]);
  },
  shoe(r, c) {
    part(r, box(), mat('#f2f2f2'), [0, 0.007, 0], [0.1, 0.014, 0.04]);
    part(r, box(), c, [-0.01, 0.03, 0], [0.08, 0.035, 0.036]);
    part(r, box(), c, [-0.035, 0.055, 0], [0.03, 0.03, 0.034]);
  },
  sun(r, c) {
    part(r, sphere(), c, [0, 0.05, 0], [0.07, 0.07, 0.07]);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      part(r, cone(4), c, [Math.cos(a) * 0.055, 0.05 + Math.sin(a) * 0.055, 0], [0.012, 0.025, 0.012], [0, 0, a - Math.PI / 2]);
    }
  },
  // No painting yet: dressed like the art's chibi boy (forest hoodie, ivory trousers) so it sits in the same world.
  person(r, c) {
    const capsule = g('capsule', () => new THREE.CapsuleGeometry(0.5, 1, 4, 10));
    part(r, capsule, mat('#e9e1cf'), [-0.016, 0.022, 0], [0.026, 0.022, 0.03]);
    part(r, capsule, mat('#e9e1cf'), [0.016, 0.022, 0], [0.026, 0.022, 0.03]);
    part(r, capsule, mat('#2f5a45'), [0, 0.07, 0], [0.062, 0.04, 0.048]);
    part(r, g('sphere2', () => new THREE.IcosahedronGeometry(0.5, 3)), c, [0, 0.135, 0], [0.058, 0.056, 0.054]);
    part(r, g('sphere2', () => new THREE.IcosahedronGeometry(0.5, 3)), mat('#3a2a20'), [0, 0.152, -0.006], [0.062, 0.04, 0.058]);
  },
  'cat-hug'(r, c) {
    BUILDERS.person(r, mat(DEFAULT_COLOR.person), DEFAULT_COLOR.person);
    const cat = new THREE.Group();
    BUILDERS.cat(cat, c, '');
    cat.position.set(0.01, 0.12, 0.02);
    cat.scale.setScalar(0.55);
    r.add(cat);
  },
  summit(r, c) {
    BUILDERS.mountain(r, c, '');
    const person = new THREE.Group();
    BUILDERS.person(person, mat(DEFAULT_COLOR.person), DEFAULT_COLOR.person);
    person.position.y = 0.19;
    person.scale.setScalar(0.4);
    r.add(person);
  },
  'cat-books'(r, c) {
    BUILDERS.book(r, mat(DEFAULT_COLOR.book), DEFAULT_COLOR.book);
    const cat = new THREE.Group();
    BUILDERS.cat(cat, c, '');
    cat.position.y = 0.088;
    cat.scale.setScalar(0.75);
    r.add(cat);
  },
  'cat-ball'(r, c) {
    const cat = new THREE.Group();
    BUILDERS.cat(cat, c, '');
    cat.position.x = -0.03;
    r.add(cat);
    const ball = new THREE.Group();
    BUILDERS.ball(ball, mat(DEFAULT_COLOR.ball), DEFAULT_COLOR.ball);
    ball.position.x = 0.06;
    r.add(ball);
  },
};

/** Self-lit props (sun, star) stay visible even in the dimmed palace. */
const GLOWS: PropId[] = ['sun', 'star'];

/**
 * Painted art per prop (heights live in PROP_HEIGHT), with colour variants. A requested colour close to a
 * variant uses that painting as is; any other colour tints the first variant, so "make it blue" still works.
 */
const ART: Partial<Record<PropId, { variants: [file: string, color: string][] }>> = {
  cat: { variants: [['cat-orange', '#e8873a'], ['cat-black', '#333333'], ['cat-white', '#f2f2f2']] },
  dog: { variants: [['dog', '#c9955a']] },
  bird: { variants: [['bird', '#5a86c8']] },
  book: { variants: [['book', '#3f5a3a']] },
  umbrella: { variants: [['umbrella', '#d94848']] },
  house: { variants: [['house', '#c9a36b']] },
  mountain: { variants: [['mountain', '#6f8a6b']] },
  tree: { variants: [['tree', '#3f8a4f']] },
  drop: { variants: [['drop', '#5aa8e6'], ['drop-honey', '#e0a628']] },
  cloud: { variants: [['cloud', '#f4f6f8']] },
  fountain: { variants: [['fountain', '#b8ad94']] },
  glasses: { variants: [['glasses', '#3a3a2a']] },
  hat: { variants: [['hat', '#e0b860']] },
  ball: { variants: [['ball', '#d94848']] },
  star: { variants: [['star', '#ffd24a']] },
  shoe: { variants: [['shoe', '#e8dcc0']] },
  sun: { variants: [['sun', '#ffc93a']] },
  'cat-hug': { variants: [['cat-hug', '#e8873a']] },
  summit: { variants: [['summit', '#6f8a6b']] },
  'cat-books': { variants: [['cat-books', '#333333']] },
  'cat-ball': { variants: [['cat-ball', '#f2f2f2']] },
};
/** Colours closer than this (RGB distance, 0..√3) count as the painted colour. */
const VARIANT_NEAR = 0.3;

const textures = new Map<string, Promise<THREE.Texture>>();
const loader = new THREE.TextureLoader();
function artTexture(file: string): Promise<THREE.Texture> {
  if (!textures.has(file)) {
    const p = loader.loadAsync(`${import.meta.env.BASE_URL}art/props/${file}.webp`).then((t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      return t;
    });
    p.catch(() => textures.delete(file)); // a failed load may succeed next time (flaky network)
    textures.set(file, p);
  }
  return textures.get(file)!;
}

/** Bottom-centred unit quad, scaled per prop to the art's aspect. */
const quad = () => g('quad', () => new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0));

let shadowTex: THREE.Texture | null = null;
function shadowTexture() {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const grd = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(8, 14, 11, 0.55)');
  grd.addColorStop(1, 'rgba(8, 14, 11, 0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 64, 64);
  return (shadowTex = new THREE.CanvasTexture(c));
}

const _cam = new THREE.Vector3(), _pos = new THREE.Vector3(), _q = new THREE.Quaternion(), _pq = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
/**
 * Billboard about the vertical axis only, so a cut-out always shows its front and never tilts. Uses the XR
 * rig camera (not each eye) so both eyes see the same orientation; the art stays upright when you look down.
 */
function faceViewer(this: THREE.Mesh, renderer: THREE.WebGLRenderer, _scene: THREE.Scene, camera: THREE.Camera) {
  const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  cam.getWorldPosition(_cam);
  this.getWorldPosition(_pos);
  _q.setFromAxisAngle(UP, Math.atan2(_cam.x - _pos.x, _cam.z - _pos.z));
  this.quaternion.copy(this.parent!.getWorldQuaternion(_pq).invert().multiply(_q));
  this.updateMatrixWorld();
}

const LUMA = 'vec3(0.3, 0.59, 0.11)';
/** Unlit art material with two knobs: a colour tint (twists) and saturation (fading memories). */
function artMaterial(tex: THREE.Texture, tint: THREE.Color | null, sat: { value: number }) {
  const m = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.35, alphaToCoverage: true, side: THREE.DoubleSide });
  const u = { uSat: sat, uTint: { value: tint ?? new THREE.Color(1, 1, 1) }, uTintAmt: { value: tint ? 0.72 : 0 } };
  m.userData.art = u;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float uSat;\nuniform vec3 uTint;\nuniform float uTintAmt;\nvoid main() {')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float artL = dot(diffuseColor.rgb, ${LUMA});
        diffuseColor.rgb = mix(diffuseColor.rgb, clamp(artL * 1.9 * uTint, 0.0, 1.0), uTintAmt);
        diffuseColor.rgb = mix(vec3(dot(diffuseColor.rgb, ${LUMA})), diffuseColor.rgb, uSat);`);
  };
  return m;
}

/** Which painting to show for a requested colour, and the tint to apply (null = as painted). */
export function pickVariant(id: PropId, color?: string): { file: string; tint: string | null } | null {
  const art = ART[id];
  if (!art) return null;
  if (!color) return { file: art.variants[0][0], tint: null };
  const want = new THREE.Color(color);
  let best = art.variants[0], bestD = Infinity;
  for (const v of art.variants) {
    const c = new THREE.Color(v[1]);
    const d = Math.hypot(c.r - want.r, c.g - want.g, c.b - want.b);
    if (d < bestD) [best, bestD] = [v, d];
  }
  return bestD < VARIANT_NEAR ? { file: best[0], tint: null } : { file: art.variants[0][0], tint: color };
}

function buildPrimitive(root: THREE.Group, id: PropId, color?: string) {
  const c = color ?? DEFAULT_COLOR[id];
  BUILDERS[id](root, mat(c, GLOWS.includes(id) ? 0.5 : 0), c);
}

export interface PropOptions {
  /** Standing on the pedestal (gets a contact shadow); false for worn or floating props. */
  grounded?: boolean;
  /** Shared saturation uniform: 1 = full colour, 0 = grey. Lets a whole scene fade, even art that loads late. */
  sat?: { value: number };
}

export function buildProp(id: PropId, color?: string, opts: PropOptions = {}): THREE.Group {
  const root = new THREE.Group();
  root.userData.prop = id;
  const pick = pickVariant(id, color);
  if (!pick) {
    buildPrimitive(root, id, color);
    return root;
  }
  const h = PROP_HEIGHT[id];
  const sat = opts.sat ?? { value: 1 };
  const shadow = new THREE.Mesh(g('shadow', () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)),
    new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
  shadow.position.y = 0.001;
  // Painted on art loading; until then (and if it never loads) the scene just has an empty spot.
  artTexture(pick.file).then((tex) => {
    const img = tex.image as { width: number; height: number };
    const w = (h * img.width) / img.height;
    const art = new THREE.Mesh(quad(), artMaterial(tex, pick.tint ? new THREE.Color(pick.tint) : null, sat));
    art.scale.set(w, h, 1);
    art.onBeforeRender = faceViewer as THREE.Object3D['onBeforeRender'];
    shadow.scale.set(w * 0.8, 1, w * 0.45);
    root.add(art);
    if (opts.grounded !== false) root.add(shadow);
  }, () => buildPrimitive(root, id, color));
  return root;
}
