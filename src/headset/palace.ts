import * as THREE from 'three';
import { lanternLook } from '../core/lantern';
import type { SceneSpec } from '../shared/types';
import { buildScene, type BuiltScene } from './scene-builder';
import { glowTexture, Panel, type Selectable } from './ui';

import { EYE_Y, RADIUS, SCENE_Y, SLOT_COUNT, SLOT_DEG, SNAP_SLOTS } from './layout';

export { EYE_Y, SLOT_COUNT } from './layout';
const SCENE_SCALE = 1.7;
const LANTERN_Y = 1.55;
const ROOM_R = 2.7;
const FADE_MS = 75;

const stone = (c: string) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });

export class Alcove {
  readonly group = new THREE.Group();
  private scene: BuiltScene | null = null;
  private sceneHolder = new THREE.Group();
  private core: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshBasicMaterial>;
  private glow: THREE.Sprite;
  private veil: THREE.Mesh;
  private label: Panel;
  private bursts: { s: THREE.Sprite; t: number }[] = [];
  /** Target and displayed recall probability. null = empty alcove (unlit). */
  private target: number | null = null;
  private shown = 0;
  private phase = Math.random() * 100;

  constructor(readonly slot: number, onSelect: (slot: number) => void) {
    const a = THREE.MathUtils.degToRad(slot * SLOT_DEG);
    this.group.position.set(Math.sin(a) * RADIUS, 0, -Math.cos(a) * RADIUS);
    this.group.lookAt(0, 0, 0);

    const wall = stone('#7a6450'), trim = stone('#a08566');
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      this.group.add(mesh);
      return mesh;
    };
    add(new THREE.BoxGeometry(0.52, 1.05, 0.04), wall, 0, 1.12, -0.2);
    add(new THREE.BoxGeometry(0.06, 1.15, 0.08), trim, -0.28, 1.08, -0.16);
    add(new THREE.BoxGeometry(0.06, 1.15, 0.08), trim, 0.28, 1.08, -0.16);
    add(new THREE.BoxGeometry(0.62, 0.06, 0.1), trim, 0, 1.68, -0.16);
    add(new THREE.CylinderGeometry(0.13, 0.15, SCENE_Y, 8), trim, 0, SCENE_Y / 2, 0);
    add(new THREE.CylinderGeometry(0.004, 0.004, 0.1, 4), stone('#3b2b1f'), 0, LANTERN_Y + 0.07, 0.04);

    this.sceneHolder.position.set(0, SCENE_Y, 0);
    this.sceneHolder.scale.setScalar(SCENE_SCALE);
    this.group.add(this.sceneHolder);

    this.core = add(new THREE.OctahedronGeometry(0.028, 0), new THREE.MeshBasicMaterial({ color: '#2a2016' }), 0, LANTERN_Y, 0.04) as typeof this.core;
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    this.glow.position.set(0, LANTERN_Y, 0.05);
    this.glow.scale.setScalar(0.3);
    this.group.add(this.glow);

    this.veil = add(new THREE.CylinderGeometry(0.24, 0.26, 0.5, 10, 1, true), new THREE.MeshLambertMaterial({ color: '#3a2a3e', side: THREE.DoubleSide, flatShading: true }), 0, SCENE_Y + 0.24, 0);
    this.veil.visible = false;

    this.label = new Panel(0.4, 0.07, { size: 0.026, bg: 'rgba(24,18,12,0.7)' });
    this.label.position.set(0, SCENE_Y - 0.1, 0.17);
    this.label.visible = false;
    this.group.add(this.label);

    const hit = add(new THREE.BoxGeometry(0.55, 1.2, 0.35), hitMat, 0, 1.15, 0);
    const sel: Selectable = { onSelect: () => onSelect(this.slot) };
    hit.userData.selectable = sel;
    hit.userData.label = `alcove:${slot}`;
  }

  get filled() {
    return this.target !== null;
  }

  setScene(spec: SceneSpec | null) {
    if (this.scene) {
      this.sceneHolder.remove(this.scene.group);
      this.scene.dispose();
      this.scene = null;
    }
    if (spec) {
      this.scene = buildScene(spec);
      this.sceneHolder.add(this.scene.group);
    }
  }

  setLabel(text: string | null) {
    this.label.visible = !!text;
    if (text) this.label.set({ body: text });
  }

  setVeiled(v: boolean) {
    this.veil.visible = v;
    this.sceneHolder.visible = !v;
    if (v) this.label.visible = false;
  }

  /** Recall probability drives the lantern; pass instant to skip easing (e.g. during a time-lapse). */
  setRecall(r: number | null, instant = false) {
    this.target = r;
    if (instant && r !== null) this.shown = r;
  }

  burst() {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.position.copy(this.glow.position);
    this.group.add(s);
    this.bursts.push({ s, t: 0 });
  }

  update(dt: number, t: number) {
    const target = this.target ?? 0;
    this.shown += (target - this.shown) * (1 - Math.exp(-dt / 0.35));
    if (this.target === null) {
      this.glow.material.opacity = 0;
      this.core.material.color.set('#2a2016');
    } else {
      const look = lanternLook(this.shown);
      let k = look.intensity;
      if (look.flicker) {
        const n = Math.sin(t * 11 + this.phase) * Math.sin(t * 4.3 + this.phase * 2) * Math.sin(t * 17.1);
        k *= 0.7 + 0.3 * (0.5 + 0.5 * n);
      }
      this.glow.material.opacity = k;
      this.glow.scale.setScalar(0.18 + 0.22 * k);
      this.core.material.color.setRGB(0.16 + 0.84 * k, 0.12 + 0.7 * k, 0.08 + 0.4 * k);
      this.scene?.setSaturation(look.saturation);
    }
    for (const b of this.bursts) {
      b.t += dt;
      const p = b.t / 0.8;
      b.s.scale.setScalar(0.2 + p * 1.6);
      b.s.material.opacity = Math.max(0, 1 - p);
    }
    this.bursts = this.bursts.filter((b) => {
      if (b.t < 0.8) return true;
      this.group.remove(b.s);
      b.s.material.dispose();
      return false;
    });
  }
}

export class Palace {
  readonly root = new THREE.Group();
  readonly ring = new THREE.Group();
  readonly alcoves: Alcove[] = [];
  private hemi = new THREE.HemisphereLight('#ffd9a8', '#2a1d14', 0.15);
  private warmth = { from: 0.15, to: 0.15, t: 1, ms: 1 };
  private fadeMesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  focusSlot = 0;
  onAlcoveSelect: (slot: number) => void = () => {};

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    scene.add(this.root);
    this.root.add(this.hemi, this.ring);
    this.buildRoom();
    for (let i = 0; i < SLOT_COUNT; i++) {
      const a = new Alcove(i, (slot) => this.onAlcoveSelect(slot));
      this.alcoves.push(a);
      this.ring.add(a.group);
    }
    // Comfort: snaps fade through black for 150 ms; the camera itself never moves.
    this.fadeMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 12, 8),
      new THREE.MeshBasicMaterial({ color: '#000', side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false }),
    );
    this.fadeMesh.renderOrder = 100;
    camera.add(this.fadeMesh);
  }

  private buildRoom() {
    const floor = new THREE.Mesh(new THREE.CircleGeometry(ROOM_R, 24), stone('#5b4636'));
    floor.rotation.x = -Math.PI / 2;
    const rug = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.62, 24), stone('#9a6b3a'));
    rug.rotation.x = -Math.PI / 2;
    rug.position.y = 0.002;
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(ROOM_R, ROOM_R, 3.4, 24, 1, true), new THREE.MeshLambertMaterial({ color: '#6e5643', side: THREE.BackSide, flatShading: true }));
    wall.position.y = 1.7;
    const ceiling = new THREE.Mesh(new THREE.RingGeometry(0.7, ROOM_R, 24), stone('#3a2c22'));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 3.4;
    // The atrium's open oculus: a fixed, calm horizon cue overhead.
    const oculus = new THREE.Mesh(new THREE.CircleGeometry(0.7, 24), new THREE.MeshBasicMaterial({ color: '#2b3a5c' }));
    oculus.rotation.x = Math.PI / 2;
    oculus.position.y = 3.41;
    this.root.add(floor, rug, wall, ceiling, oculus);
  }

  /** Warm the room up (0 = dim, 1 = fully lit). */
  setWarmth(w: number, ms = 1200) {
    this.warmth = { from: this.hemi.intensity, to: 0.15 + w * 1.6, t: 0, ms };
  }

  private fadeTo(opacity: number) {
    return new Promise<void>((res) => {
      const from = this.fadeMesh.material.opacity, start = performance.now();
      const step = () => {
        const p = Math.min(1, (performance.now() - start) / FADE_MS);
        this.fadeMesh.material.opacity = from + (opacity - from) * p;
        if (p < 1) requestAnimationFrame(step);
        else res();
      };
      // rAF pauses during XR on some browsers; a timer backs it up.
      setTimeout(() => {
        this.fadeMesh.material.opacity = opacity;
        res();
      }, FADE_MS + 40);
      step();
    });
  }

  /** Bring a slot to the centre with a snap-and-fade. */
  async focus(slot: number) {
    const s = ((slot % SLOT_COUNT) + SLOT_COUNT) % SLOT_COUNT;
    if (s === this.focusSlot) return;
    await this.fadeTo(1);
    this.focusSlot = s;
    this.ring.rotation.y = THREE.MathUtils.degToRad(s * SLOT_DEG);
    await this.fadeTo(0);
  }

  snap(dir: 1 | -1) {
    return this.focus(this.focusSlot + dir * SNAP_SLOTS);
  }

  /** Re-centre content on the user's head at XR start, so seated height and position don't matter. */
  recenter(head: THREE.Vector3) {
    this.root.position.set(head.x, head.y - EYE_Y, head.z);
  }

  update(dt: number, t: number) {
    const w = this.warmth;
    if (w.t < 1) {
      w.t = Math.min(1, w.t + (dt * 1000) / w.ms);
      this.hemi.intensity = w.from + (w.to - w.from) * (1 - (1 - w.t) ** 3);
    }
    for (const a of this.alcoves) a.update(dt, t);
  }
}
