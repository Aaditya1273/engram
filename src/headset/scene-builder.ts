import * as THREE from 'three';
import { PROP_ASPECT, PROP_HEIGHT } from '../shared/props-catalog';
import { buildProp } from '../shared/props';
import type { SceneSpec } from '../shared/types';

/**
 * Every scene is scaled to the same visual size on its pedestal: the square root of (width × height of what
 * stands on it) is FIT_SIZE, so a wide mountain and a tall book stack read alike. It is then capped to FIT_W
 * across (the pedestal top is about 0.22) and FIT_TOP high, which leaves floating props (sun, star, cloud)
 * headroom without them shrinking the scene. Centred on the pedestal.
 */
/** A prop this close to the pedestal stands on it; higher ones are worn or floating. */
const GROUND_Y = 0.02;
const FIT_SIZE = 0.155, FIT_W = 0.22, FIT_TOP = 0.28;

export function sceneFit(spec: SceneSpec): { scale: number; dx: number } {
  let x0 = Infinity, x1 = -Infinity, top = 0, ground = 0;
  for (const p of spec.props) {
    const s = p.scale ?? 1, h = PROP_HEIGHT[p.prop] * s, w = h * PROP_ASPECT[p.prop];
    x0 = Math.min(x0, p.pos[0] - w / 2);
    x1 = Math.max(x1, p.pos[0] + w / 2);
    top = Math.max(top, p.pos[1] + h);
    if (p.pos[1] < GROUND_Y || p.pos[1] < h) ground = Math.max(ground, p.pos[1] + h); // standing, or stacked on something
  }
  if (!spec.props.length) return { scale: 1, dx: 0 };
  const w = x1 - x0, size = Math.sqrt(w * (ground || top));
  const scale = Math.min(FIT_SIZE / size, FIT_TOP / top, FIT_W / w);
  return { scale, dx: -(x0 + x1) / 2 };
}

export interface BuiltScene {
  group: THREE.Group;
  /** 1 = full colour, 0 = grey. Used as memories fade. */
  setSaturation(s: number): void;
  dispose(): void;
}

const tmp = new THREE.Color();

/** Assembles a scene from the prop kit. Art streams in; the scene is usable at once. */
export function buildScene(spec: SceneSpec): BuiltScene {
  const group = new THREE.Group();
  const inner = new THREE.Group();
  const fit = sceneFit(spec);
  group.add(inner);
  group.scale.setScalar(fit.scale);
  inner.position.x = fit.dx;
  const sat = { value: 1 };
  for (const p of spec.props) {
    const prop = buildProp(p.prop, p.color, { grounded: p.pos[1] < GROUND_Y, sat });
    prop.position.set(...p.pos);
    prop.scale.setScalar(p.scale ?? 1);
    prop.rotation.y = p.rot ?? 0;
    inner.add(prop);
  }
  // Primitive fallbacks have no shader uniform: they fade by lerping their colour, remembered on first use.
  const base = new WeakMap<THREE.MeshLambertMaterial, THREE.Color>();
  const eachLambert = (f: (m: THREE.MeshLambertMaterial) => void) =>
    group.traverse((o) => o instanceof THREE.Mesh && o.material instanceof THREE.MeshLambertMaterial && f(o.material));
  return {
    group,
    setSaturation(s) {
      if (Math.abs(s - sat.value) < 0.01) return;
      sat.value = s;
      eachLambert((m) => {
        if (!base.has(m)) base.set(m, m.color.clone());
        const b = base.get(m)!, l = b.r * 0.3 + b.g * 0.59 + b.b * 0.11;
        m.color.copy(tmp.setRGB(l, l, l).lerp(b, s));
      });
    },
    dispose() {
      // Geometry and textures are shared across the kit; only materials are per scene.
      group.traverse((o) => o instanceof THREE.Mesh && (o.material as THREE.Material).dispose());
    },
  };
}
