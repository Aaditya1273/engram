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

/** Assembles a scene from the prop kit. Instant: no mesh generation, no network. */
export function buildScene(spec: SceneSpec): BuiltScene {
  const group = new THREE.Group();
  const mats: { m: THREE.MeshLambertMaterial; base: THREE.Color }[] = [];
  for (const p of spec.props) {
    const prop = buildProp(p.prop, p.color);
    prop.position.set(...p.pos);
    prop.scale.setScalar(p.scale ?? 1);
    prop.rotation.y = p.rot ?? 0;
    prop.traverse((o) => {
      if (o instanceof THREE.Mesh) mats.push({ m: o.material, base: o.material.color.clone() });
    });
    group.add(prop);
  }
  let last = 1;
  return {
    group,
    setSaturation(s) {
      if (Math.abs(s - last) < 0.01) return;
      last = s;
      for (const { m, base } of mats) {
        const l = base.r * 0.3 + base.g * 0.59 + base.b * 0.11;
        m.color.copy(tmp.setRGB(l, l, l).lerp(base, s));
      }
    },
    dispose() {
      // Geometry is shared across the kit; only materials are per scene.
      for (const { m } of mats) m.dispose();
    },
  };
}
