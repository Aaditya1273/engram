import * as THREE from 'three';
import { buildProp } from '../shared/props';
import type { SceneSpec } from '../shared/types';

export interface BuiltScene {
  group: THREE.Group;
  /** 1 = full colour, 0 = grey. Used as memories fade. */
  setSaturation(s: number): void;
  dispose(): void;
}

const tmp = new THREE.Color();
/** A prop this close to the pedestal stands on it; higher ones are worn or floating. */
const GROUND_Y = 0.02;

/** Assembles a scene from the prop kit. Art streams in; the scene is usable at once. */
export function buildScene(spec: SceneSpec): BuiltScene {
  const group = new THREE.Group();
  const sat = { value: 1 };
  for (const p of spec.props) {
    const prop = buildProp(p.prop, p.color, { grounded: p.pos[1] < GROUND_Y, sat });
    prop.position.set(...p.pos);
    prop.scale.setScalar(p.scale ?? 1);
    prop.rotation.y = p.rot ?? 0;
    group.add(prop);
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
