import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import CHEST from '../shared/chest.json';
import { modelEnvironment } from '../shared/props';

/**
 * "Open to remember": the chest Aholo Lux3D generated and then articulated (a URDF: a body, and a lid on a
 * revolute hinge). Rebuilt here from that description: the lid sits in its hinge frame and turns about the
 * hinge axis, so it opens exactly where the articulation said it does. One load, shared by every pedestal.
 */

/** On the pedestal, the chest's body stands this tall (metres, in the alcove's scene scale). */
const BODY_HEIGHT = 0.13;

let parts: Promise<{ body: THREE.Object3D; lid: THREE.Object3D }> | null = null;
function load() {
  parts ??= (async () => {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const [body, lid] = await Promise.all(['body', 'lid'].map((p) => loader.loadAsync(`${import.meta.env.BASE_URL}art/models/chest-${p}.glb`)));
    const env = modelEnvironment();
    for (const g of [body, lid]) {
      g.scene.traverse((o) => {
        if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) {
          o.material.envMap = env;
          o.material.envMapIntensity = 1.1;
        }
      });
    }
    return { body: body.scene, lid: lid.scene };
  })();
  parts.catch(() => (parts = null));
  return parts;
}

const AXIS = new THREE.Vector3(...(CHEST.hinge.axis as [number, number, number])).normalize();
const OPEN = CHEST.hinge.limit[1] * 0.9;

export class Chest {
  readonly group = new THREE.Group();
  private hinge = new THREE.Group();
  /** 0 closed, 1 open. */
  private amount = 0;
  private target = 0;
  ready = false;

  constructor() {
    this.group.scale.setScalar(BODY_HEIGHT / CHEST.bodyHeight);
    this.group.visible = false;
    this.hinge.position.set(...(CHEST.hinge.origin as [number, number, number]));
    this.group.add(this.hinge);
    void load().then(({ body, lid }) => {
      this.group.add(body.clone());
      this.hinge.add(lid.clone());
      this.ready = true;
    }, () => {});
  }

  /** Closed and showing (the memory is inside, waiting to be recalled). */
  close() {
    this.target = this.amount = 0;
    this.apply();
    this.group.visible = true;
  }

  open() {
    this.target = 1;
  }

  hide() {
    this.group.visible = false;
  }

  get opened() {
    return this.amount > 0.95;
  }

  update(dt: number) {
    if (this.amount === this.target) return;
    // Ease the lid open over about half a second, with a slight overshoot that settles.
    this.amount = Math.min(1, this.amount + dt * 2.2);
    this.apply();
  }

  private apply() {
    const t = this.amount, ease = 1 - (1 - t) ** 3 + Math.sin(t * Math.PI) * 0.06;
    this.hinge.quaternion.setFromAxisAngle(AXIS, -ease * OPEN);
  }
}
