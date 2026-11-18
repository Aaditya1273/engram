import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { modelEnvironment } from '../shared/props';
import { soundListeners, type Sound } from './audio';
import type { Palace } from './palace';
import type { Stage } from './stage';
import { glowTexture } from './ui';

/**
 * Lumen, the memory coach: a lantern spirit generated with Aholo Lux3D, auto-rigged and animated with Lux3D
 * retargeting (scripts/lumen.mjs). It floats to your right, outside the central view, and reacts: it talks while
 * narrating, nods at a lit lantern, dances at a relight, shakes its head at a miss. If the model can't load, the
 * palace simply has no Lumen; nothing waits on it.
 */

/** The clips, in the order scripts/lumen.mjs requested them. */
const CLIP = { idle: 0, yes: 1, cheer: 2, worry: 3, talk: 4 } as const;
type Mood = keyof typeof CLIP;
/** Beside the seated user, about 35° to the right and below the row of pedestal plaques: present, never in the way. */
const SPOT = new THREE.Vector3(0.6, 0.64, -0.8);
const HEIGHT = 0.21;

export class Lumen {
  readonly root = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private actions: THREE.AnimationAction[] = [];
  private current: THREE.AnimationAction | null = null;
  private talking = false;
  private reactUntil = 0;
  private glow: THREE.Sprite;

  constructor(private palace: Palace, stage: Stage, camera: THREE.Camera) {
    this.root.position.copy(SPOT);
    this.root.visible = false;
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 }));
    this.glow.scale.setScalar(0.32);
    palace.root.add(this.root);
    void this.load();

    stage.onSpeaking = (on) => {
      this.talking = on;
      if (performance.now() > this.reactUntil) this.play(on ? 'talk' : 'idle');
    };
    const onSound = (s: Sound) => {
      if (s === 'relight') this.react('cheer', 2600);
      else if (s === 'miss') this.react('worry', 2000);
      else if (s === 'light') this.react('yes', 1400);
    };
    soundListeners.add(onSound);

    let t = 0;
    const face = new THREE.Vector3(), here = new THREE.Vector3();
    palace.tickers.add((dt) => {
      if (!this.root.visible) return;
      t += dt;
      this.mixer?.update(dt);
      // A slow float, and always turned toward you.
      this.root.position.y = SPOT.y + Math.sin(t * 1.3) * 0.012;
      camera.getWorldPosition(face);
      this.root.getWorldPosition(here);
      this.root.rotation.y = Math.atan2(face.x - here.x, face.z - here.z) - (this.palace.root.rotation?.y ?? 0);
      this.glow.material.opacity = 0.45 + 0.15 * Math.sin(t * 2.1) + (this.talking ? 0.15 : 0);
      if (this.reactUntil && performance.now() > this.reactUntil) {
        this.reactUntil = 0;
        this.play(this.talking ? 'talk' : 'idle');
      }
    });
  }

  private async load() {
    try {
      const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(`${import.meta.env.BASE_URL}art/models/lumen.glb`);
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      model.scale.setScalar(HEIGHT / size.y);
      model.position.y = -box.min.y * (HEIGHT / size.y);
      const env = modelEnvironment();
      model.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.frustumCulled = false; // skinned: its bounds don't follow the animation
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
            if (m instanceof THREE.MeshStandardMaterial) {
              m.envMap = env;
              m.envMapIntensity = 1.1;
            }
          }
        }
      });
      this.glow.position.y = HEIGHT * 0.78;
      this.root.add(model, this.glow);
      this.mixer = new THREE.AnimationMixer(model);
      this.actions = gltf.animations.map((clip) => this.mixer!.clipAction(clip));
      this.root.visible = true;
      this.play(this.talking ? 'talk' : 'idle');
    } catch {
      // No Lumen: the palace works the same without it.
    }
  }

  private play(mood: Mood) {
    const next = this.actions[CLIP[mood]];
    if (!next || next === this.current) return;
    next.reset().setEffectiveWeight(1).fadeIn(0.25).play();
    this.current?.fadeOut(0.25);
    this.current = next;
  }

  /** A short reaction, then back to talking or idling. */
  react(mood: Mood, ms: number) {
    this.play(mood);
    this.reactUntil = performance.now() + ms;
  }
}
