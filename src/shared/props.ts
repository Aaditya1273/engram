import * as THREE from 'three';
import type { PropId } from './types';

/**
 * Procedural low-poly prop kit: every prop is a handful of primitives, base at y = 0, facing +z,
 * about 10 cm tall at scale 1. Zero asset downloads, so the first five minutes work offline.
 * ponytail: primitives, not a CC0 glTF kit. Swap a builder for a loaded glTF when art lands; the
 * scene JSON (prop id + pos/scale/colour) does not change.
 */

export const PROP_IDS: PropId[] = [
  'cat', 'dog', 'bird', 'book', 'umbrella', 'house', 'mountain', 'tree', 'drop', 'cloud',
  'fountain', 'glasses', 'hat', 'ball', 'star', 'shoe', 'sun', 'person',
];

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
  hat: '#2b2b2b', ball: '#d94848', star: '#ffd24a', shoe: '#2f6fd1', sun: '#ffc93a', person: '#d9a27a',
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
    part(r, cone(8), c, [0, 0.19, 0], [0.2, 0.06, 0.2]);
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
  person(r, c) {
    const shirt = mat('#4f6fa8');
    part(r, g('capsule', () => new THREE.CapsuleGeometry(0.5, 1, 2, 6)), shirt, [0, 0.06, 0], [0.06, 0.05, 0.05]);
    part(r, sphere(), c, [0, 0.14, 0], [0.05, 0.05, 0.05]);
    part(r, sphere(), mat('#2b2b2b'), [0, 0.155, -0.005], [0.052, 0.03, 0.05]);
  },
};

/** Self-lit props (sun, star) stay visible even in the dimmed palace. */
const GLOWS: PropId[] = ['sun', 'star'];

export function buildProp(id: PropId, color?: string): THREE.Group {
  const root = new THREE.Group();
  const c = color ?? DEFAULT_COLOR[id];
  BUILDERS[id](root, mat(c, GLOWS.includes(id) ? 0.5 : 0), c);
  root.userData.prop = id;
  return root;
}
