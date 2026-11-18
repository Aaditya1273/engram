import * as THREE from 'three';
import { lanternLook } from '../core/lantern';
import { LANTERN, PALETTE, SCENE } from '../shared/theme';
import type { SceneSpec } from '../shared/types';
import type { Theme } from '../core/streak';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { modelEnvironment } from '../shared/props';
import { buildDecor } from './decor';
import { buildScene, type BuiltScene } from './scene-builder';
import { Chest } from './chest';
import { glowTexture, Panel, setUiTone, type Selectable } from './ui';

import { EYE_Y, LANTERN_HOOP_Y, RADIUS, SCENE_Y, SLOT_COUNT, SLOT_DEG, SNAP_SLOTS } from './layout';

export { EYE_Y, SLOT_COUNT } from './layout';
const SCENE_SCALE = 1.7;
const LANTERN_Y = 1.55;
/**
 * Lanterns hang from their hoops as pendulums. On a computer the cursor tugs a nearby lantern toward it, like a
 * magnet; let go and a light spring swings it home with a few fading sways. Angles in radians, per axis.
 */
const SWING = { reach: 0.3, maxPull: 0.15, stiffness: 55, damping: 3.2 } as const;
const PENDULUM = LANTERN_HOOP_Y - LANTERN_Y;
/** Scenes kept when the frame guard trims distant ones: the one in front and three either side. */
const NEAR_SLOTS = 3;
const FADE_MS = 75;
/** Hemisphere light range: the room warms from dusk to sunlit as you work, but is never black. */
const WARMTH_MIN = 1.1, WARMTH_MAX = 2.6;

const THEMES: Record<Theme, [sky: string, ground: string]> = {
  garden: [SCENE.lightSky, SCENE.lightGround],
  moonlit: ['#B9CCF2', '#1C2A3E'],
  golden: ['#FFE08A', '#5A4618'],
  sakura: ['#FFD2E2', '#3E2A33'],
};

const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
// The architecture lives in decor.ts; these are the live, per-alcove parts.
const MAT = {
  chain: new THREE.MeshLambertMaterial({ color: PALETTE.gold, emissive: PALETTE.gold, emissiveIntensity: 0.3 }),
};
const GEO = {
  chain: new THREE.CylinderGeometry(0.003, 0.003, LANTERN_HOOP_Y - LANTERN_Y - 0.07, 4),
  lantern: new THREE.PlaneGeometry(0.067, 0.14),
  hit: new THREE.BoxGeometry(0.55, 1.2, 0.35),
  wash: new THREE.PlaneGeometry(0.95, 0.95).rotateX(-Math.PI / 2),
};
// The painted lantern is multiplied by these: a dark bronze silhouette when unlit, warm gold-ivory when lit.
const UNLIT = new THREE.Color(LANTERN.unlitArt), LIT = new THREE.Color(LANTERN.lit);
const lanternTex = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}art/props/lantern.webp`);
lanternTex.colorSpace = THREE.SRGBColorSpace;
/** An empty pedestal holds a dim golden lotus: the place a memory will go. One shared material for all of them. */
const lotusTex = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}art/site/lotus.webp`);
lotusTex.colorSpace = THREE.SRGBColorSpace;
const LOTUS = {
  geo: new THREE.PlaneGeometry(0.15, 0.15 * (475 / 560)).translate(0, 0.0635, 0),
  mat: new THREE.MeshBasicMaterial({ map: lotusTex, alphaTest: 0.35, color: '#9c8f6a' }),
};

/**
 * The moonlit theme's lantern: Aholo Lux3D's model of the painted sakura pagoda lantern (scripts/sakura-lantern.mjs),
 * fitted to the painted lantern's place: its top on the chain, 17 cm tall. Loaded the first time it's needed.
 */
const SAKURA_H = 0.17;
let sakuraLantern: Promise<THREE.Object3D> | null = null;
function loadSakuraLantern() {
  sakuraLantern ??= new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(`${import.meta.env.BASE_URL}art/models/sakura-lantern.glb`).then((g) => {
    const box = new THREE.Box3().setFromObject(g.scene), size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
    const s = SAKURA_H / size.y;
    g.scene.scale.setScalar(s);
    g.scene.position.set(-mid.x * s, 0.07 - box.max.y * s, -mid.z * s);
    return g.scene;
  });
  sakuraLantern.catch(() => (sakuraLantern = null));
  return sakuraLantern;
}

/** Golden motes rising from a relit lantern: the reward made visible. */
const MOTES = 14, MOTE_S = 1.6;
let moteMat: THREE.PointsMaterial | null = null; // created lazily: the soft dot texture needs a canvas

const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class Alcove {
  readonly group = new THREE.Group();
  private scene: BuiltScene | null = null;
  private sceneHolder = new THREE.Group();
  private lotus = new THREE.Mesh(LOTUS.geo, LOTUS.mat);
  private core: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  /** The 3D lantern shown instead of the painted one in some themes; its materials are this alcove's own (own light). */
  private model = new THREE.Group();
  private modelMats: THREE.MeshStandardMaterial[] = [];
  private glow: THREE.Sprite;
  /** The lantern's light pooling on the floor round its pedestal: a fading memory darkens its patch of floor. */
  private wash: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  /** While a memory is being recalled its scene hides and a glowing gold question mark floats in its place. */
  private veil: Panel;
  private label: Panel;
  private bursts: { s: THREE.Sprite; t: number }[] = [];
  /** 1 right after a successful recall, easing to 0: the lantern swells, then settles. */
  private bloom = 0;
  private motes: { pts: THREE.Points; seeds: Float32Array; t: number } | null = null;
  /** Target and displayed recall probability. null = empty alcove (unlit). */
  private target: number | null = null;
  private shown = 0;
  private phase = Math.random() * 100;
  /** Everything that hangs: chain, lantern, glow. Pivots at the hoop. */
  private swing = new THREE.Group();
  private sway = { x: 0, z: 0, vx: 0, vz: 0 };
  /** Set by the palace when the frame guard trims far scenes; the lantern stays, only the scene is hidden. */
  distant = false;
  private chest = new Chest();
  /** Seconds since the chest began to open (-1 when not revealing). */
  private reveal = -1;

  constructor(readonly slot: number, onSelect: (slot: number) => void) {
    const a = THREE.MathUtils.degToRad(slot * SLOT_DEG);
    this.group.position.set(Math.sin(a) * RADIUS, 0, -Math.cos(a) * RADIUS);
    this.group.lookAt(0, 0, 0);

    const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      this.group.add(mesh);
      return mesh;
    };
    this.swing.position.set(0, LANTERN_HOOP_Y, 0.04);
    this.group.add(this.swing);
    const hang = (mesh: THREE.Object3D) => {
      mesh.position.y -= LANTERN_HOOP_Y;
      mesh.position.z -= 0.04;
      this.swing.add(mesh);
      return mesh;
    };
    hang(add(GEO.chain, MAT.chain, 0, (LANTERN_HOOP_Y + LANTERN_Y + 0.07) / 2, 0.04)); // from the gold hoop to the painted ring on the lantern

    this.sceneHolder.position.set(0, SCENE_Y, 0);
    this.sceneHolder.scale.setScalar(SCENE_SCALE);
    this.group.add(this.sceneHolder);
    this.lotus.position.set(0, SCENE_Y + 0.004, 0.02);
    this.group.add(this.lotus);

    this.core = hang(add(GEO.lantern, new THREE.MeshBasicMaterial({ map: lanternTex, color: UNLIT, alphaTest: 0.35, alphaToCoverage: true }), 0, LANTERN_Y, 0.04)) as typeof this.core;
    this.model.position.set(0, LANTERN_Y, 0.04);
    hang(this.model);
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    this.glow.position.set(0, LANTERN_Y, 0.05);
    this.glow.scale.setScalar(0.3);
    this.group.add(this.glow);
    hang(this.glow);
    this.wash = add(GEO.wash, new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }), 0, 0.006, 0.05) as typeof this.wash;

    this.chest.group.position.set(0, SCENE_Y, 0.02);
    this.group.add(this.chest.group);
    this.veil = new Panel(0.16, 0.16, { frame: 'round', size: 0.08 }).set({ body: '?' });
    this.veil.position.set(0, SCENE_Y + 0.17, 0.02);
    this.veil.visible = false;
    this.group.add(this.veil);

    // A gold-rimmed plaque on the pedestal's shaft, just under the cap, tipped back toward the seated eye.
    this.label = new Panel(0.27, 0.064, { size: 0.028, weight: 600, frame: 'pill' });
    this.label.position.set(0, SCENE_Y - 0.135, 0.175);
    this.label.rotation.x = -0.16;
    this.label.visible = false;
    this.group.add(this.label);

    const hit = add(GEO.hit, hitMat, 0, 1.15, 0);
    const sel: Selectable = { onSelect: () => onSelect(this.slot) };
    hit.userData.selectable = sel;
    hit.userData.label = `alcove:${slot}`;
  }

  clear() {
    this.setScene(null);
    this.setLabel(null);
    this.setLandmark(null);
    this.setRecall(null, true);
    this.setVeiled(false);
  }

  get filled() {
    return this.target !== null;
  }

  setScene(spec: SceneSpec | null, opts: { finish?: 'bronze' | 'silver' | 'gold' } = {}) {
    if (this.scene) {
      this.sceneHolder.remove(this.scene.group);
      this.scene.dispose();
      this.scene = null;
    }
    if (spec) {
      this.scene = buildScene(spec, opts);
      this.sceneHolder.add(this.scene.group);
    }
    this.lotus.visible = !spec;
  }

  private medallion: Panel | null = null;
  /** Landmark stops (every fifth) wear a gold numbered medallion on the pedestal; null removes it. */
  setLandmark(n: number | null) {
    if (n === null) {
      if (this.medallion) this.medallion.visible = false;
      return;
    }
    if (!this.medallion) {
      this.medallion = new Panel(0.11, 0.11, { frame: 'round', size: 0.05 });
      this.medallion.position.set(0, SCENE_Y * 0.62, 0.17);
      this.medallion.rotation.x = -0.12;
      this.group.add(this.medallion);
    }
    this.medallion.set({ body: String(n) });
    this.medallion.visible = true;
  }

  setLabel(text: string | null) {
    this.label.visible = !!text;
    if (text) this.label.set({ body: text });
  }

  /**
   * Veiled while being recalled: a closed chest stands on the pedestal (or the "?" medallion if the chest isn't
   * loaded). Unveiling after the answer opens the lid and the scene rises out of it: open to remember.
   */
  setVeiled(v: boolean) {
    if (v) {
      const chest = this.chest.ready;
      if (chest) this.chest.close();
      this.veil.visible = !chest;
      this.sceneHolder.visible = false;
      this.label.visible = false;
      this.reveal = -1;
      return;
    }
    this.veil.visible = false;
    if (this.chest.group.visible) {
      this.chest.open();
      this.reveal = 0;
    } else this.sceneHolder.visible = true;
  }

  /** Show a 3D lantern (a template shared by every alcove) instead of the painted one; null puts the painting back. */
  setLanternModel(template: THREE.Object3D | null) {
    if (template && !this.modelMats.length) {
      const m = template.clone();
      m.traverse((o) => {
        if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) {
          const mat = (o.material = o.material.clone());
          mat.envMap = modelEnvironment();
          mat.emissive.set('#ffffff');
          mat.emissiveMap = mat.map; // a lit lantern glows in its own colours
          this.modelMats.push(mat);
        }
      });
      this.model.add(m);
    }
    this.model.visible = !!template;
    this.core.visible = !template;
  }

  /** Unlit: a dim silhouette; lit: its paper and roof glow. */
  private lightModel(lit: number) {
    for (const m of this.modelMats) {
      m.color.setScalar(0.35 + 0.65 * lit);
      m.emissiveIntensity = 0.9 * lit;
    }
  }

  /** Recall probability drives the lantern; pass instant to skip easing (e.g. during a time-lapse). */
  setRecall(r: number | null, instant = false) {
    this.target = r;
    if (instant && r !== null) this.shown = r;
  }

  /** Successful recall / new memory: a soft gold ring of light, a swelling lantern, rising motes. */
  burst() {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.position.copy(this.group.worldToLocal(this.glow.getWorldPosition(new THREE.Vector3())));
    this.group.add(s);
    this.bursts.push({ s, t: 0 });
    this.bloom = 1;
    if (this.motes) this.group.remove(this.motes.pts);
    const seeds = new Float32Array(MOTES * 3).map(() => Math.random());
    const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(MOTES * 3), 3));
    moteMat ??= new THREE.PointsMaterial({ color: LANTERN.mote, map: glowTexture(), size: 0.035, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(geo, moteMat.clone());
    pts.position.copy(s.position);
    this.group.add(pts);
    this.motes = { pts, seeds, t: 0 };
  }

  /** Pendulum toward the cursor (if it's near the lantern), else back to rest; a damped spring either way. */
  private swingToward(pointer: THREE.Ray | null, dt: number) {
    let tx = 0, tz = 0;
    if (pointer) {
      const rest = this.group.localToWorld(_v.set(0, LANTERN_Y, 0.04));
      const near = pointer.closestPointToPoint(rest, _w);
      if (near.distanceTo(rest) < SWING.reach) {
        const pull = this.group.worldToLocal(near).sub(this.group.worldToLocal(rest.clone()));
        pull.y = 0;
        if (pull.length() > SWING.maxPull) pull.setLength(SWING.maxPull);
        tz = pull.x / PENDULUM; // about z: sideways
        tx = -pull.z / PENDULUM; // about x: toward or away from you
      }
    }
    const s = this.sway, k = SWING.stiffness, c = SWING.damping, h = Math.min(dt, 1 / 30);
    s.vx += (k * (tx - s.x) - c * s.vx) * h;
    s.vz += (k * (tz - s.z) - c * s.vz) * h;
    s.x += s.vx * h;
    s.z += s.vz * h;
    this.swing.rotation.set(s.x, 0, s.z);
  }

  update(dt: number, t: number, pointer: THREE.Ray | null = null) {
    this.swingToward(pointer, dt);
    if (this.scene) this.scene.group.visible = !this.distant;
    this.chest.update(dt);
    if (this.reveal >= 0) {
      // The lid opens; at 0.35 s the scene rises out of the chest; at 1.3 s the chest is gone.
      this.reveal += dt;
      if (this.reveal >= 0.35) {
        this.sceneHolder.visible = true;
        const k = Math.min(1, (this.reveal - 0.35) / 0.35);
        this.sceneHolder.scale.setScalar(SCENE_SCALE * (0.2 + 0.8 * (1 - (1 - k) ** 3)));
        this.sceneHolder.position.y = SCENE_Y + 0.08 * (1 - k);
      }
      if (this.reveal >= 1.3) {
        this.chest.hide();
        this.reveal = -1;
      }
    }
    const target = this.target ?? 0;
    this.shown += (target - this.shown) * (1 - Math.exp(-dt / 0.35));
    this.bloom = Math.max(0, this.bloom - dt / 1.4);
    const b = this.bloom * this.bloom * (3 - 2 * this.bloom); // smoothstep: swell, then settle
    if (this.target === null) {
      this.glow.material.opacity = 0;
      this.wash.material.opacity = 0;
      this.core.material.color.copy(UNLIT);
      this.lightModel(0);
    } else {
      const look = lanternLook(this.shown);
      let k = look.intensity;
      if (look.flicker) {
        const n = Math.sin(t * 11 + this.phase) * Math.sin(t * 4.3 + this.phase * 2) * Math.sin(t * 17.1);
        k *= 0.7 + 0.3 * (0.5 + 0.5 * n);
      }
      // A slow breath even at full light, so a lit palace feels alive rather than static.
      const breath = 1 + 0.04 * Math.sin(t * 0.9 + this.phase);
      this.glow.material.opacity = Math.min(1, k + 0.4 * b);
      this.glow.scale.setScalar((0.18 + 0.22 * k) * breath * (1 + 0.9 * b));
      this.core.material.color.copy(UNLIT).lerp(LIT, Math.min(1, k + b));
      this.lightModel(Math.min(1, k + b));
      this.wash.material.opacity = 0.32 * k + 0.25 * b;
      this.scene?.setSaturation(look.saturation);
    }
    if (this.motes) {
      const m = this.motes;
      m.t += dt;
      const p = m.t / MOTE_S;
      const pos = m.pts.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < MOTES; i++) {
        const a = m.seeds[i * 3] * Math.PI * 2, r = 0.03 + 0.09 * m.seeds[i * 3 + 1] * p, rise = (0.12 + 0.25 * m.seeds[i * 3 + 2]) * p;
        pos.setXYZ(i, Math.cos(a + p * 2) * r, rise, Math.sin(a + p * 2) * r * 0.5);
      }
      pos.needsUpdate = true;
      (m.pts.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - p) * Math.min(1, p * 6);
      if (p >= 1) {
        this.group.remove(m.pts);
        m.pts.geometry.dispose();
        (m.pts.material as THREE.Material).dispose();
        this.motes = null;
      }
    }
    for (const bu of this.bursts) {
      bu.t += dt;
      const p = bu.t / 1.1;
      bu.s.scale.setScalar(0.2 + (1 - (1 - p) ** 3) * 1.4);
      bu.s.material.opacity = Math.max(0, 1 - p) * 0.9;
    }
    this.bursts = this.bursts.filter((b) => {
      if (b.t < 1.1) return true;
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
  private hemi = new THREE.HemisphereLight(SCENE.lightSky, SCENE.lightGround, WARMTH_MIN);
  private warmth = { from: WARMTH_MIN, to: WARMTH_MIN, t: 1, ms: 1 };
  private fadeMesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  /** Slot within the current wing (0..SLOT_COUNT-1; fractional to centre between two). */
  focusSlot = 0;
  /** Each wing is another SLOT_COUNT alcoves; one wing is shown at a time. Memory slot = wing × SLOT_COUNT + alcove. */
  wing = 0;
  onAlcoveSelect: (slot: number) => void = () => {};
  /** Per-frame callbacks for things animating outside an alcove (Recall Rush lanterns, Lumen). dt in seconds. */
  readonly tickers = new Set<(dt: number, t: number) => void>();
  /**
   * Palace themes, unlocked by streak milestones: the oculus light changes colour (sky and ground of the
   * hemisphere light), which every marble, gold and leaf surface picks up. One light, no extra cost.
   */
  setTheme(theme: Theme) {
    const [sky, ground] = THEMES[theme] ?? THEMES.garden; // a theme saved by an older version may be gone
    this.hemi.color.set(sky);
    this.hemi.groundColor.set(ground);
    this.theme = theme;
    this.dress(theme);
    setUiTone(theme);
    // The moonlit night hangs 3D sakura lanterns; if the model can't load, the painted ones simply stay.
    if (theme === 'moonlit') void loadSakuraLantern().then((t) => this.theme === 'moonlit' && this.alcoves.forEach((a) => a.setLanternModel(t)), () => {});
    else this.alcoves.forEach((a) => a.setLanternModel(null));
  }
  private theme: Theme = 'garden';
  /** Repaints the view through the arches and the vines (from buildDecor). */
  private dress: (theme: Theme) => void = () => {};

  /** True while a flow borrows the alcoves for a display (the collection): background redraws must wait. */
  borrowed = false;
  /** Frame guard level 1: only scenes within NEAR_SLOTS of the one in front are drawn. */
  nearOnly = false;
  /** The mouse ray on a computer (null in the headset): lanterns lean toward it. */
  pointer: THREE.Ray | null = null;
  /** Called inside the fade when the palace switches wing, to re-fill the alcoves. */
  onWing: (wing: number) => void = () => {};

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    scene.add(this.root);
    this.root.add(this.hemi, this.ring);
    this.buildRoom();
    for (let i = 0; i < SLOT_COUNT; i++) {
      const a = new Alcove(i, (local) => this.onAlcoveSelect(this.wing * SLOT_COUNT + local));
      this.alcoves.push(a);
      this.ring.add(a.group);
    }
    // Comfort: snaps fade through black for 150 ms; the camera itself never moves.
    this.fadeMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 12, 8),
      new THREE.MeshBasicMaterial({ color: SCENE.fade, side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false, fog: false }),
    );
    this.fadeMesh.renderOrder = 100;
    camera.add(this.fadeMesh);
  }

  /** Everything buildDecor added (arcade, pedestals, forest): hidden in room mode so the real room shows. */
  private decor: THREE.Object3D[] = [];

  /**
   * Room mode (passthrough): the palace's architecture disappears and your memories, lanterns and plaques stand
   * in a ring around your chair in your own room. The virtual palace is the default and the fallback.
   */
  setRoomMode(on: boolean) {
    for (const o of this.decor) o.visible = !on;
  }

  private buildRoom() {
    const before = new Set([...this.ring.children, ...this.root.children]);
    this.dress = buildDecor(this.ring, this.root);
    this.dress('garden');
    this.decor = [...this.ring.children, ...this.root.children].filter((o) => !before.has(o));
  }

  /** Warm the room up (0 = dim, 1 = fully lit). */
  setWarmth(w: number, ms = 1200) {
    this.warmth = { from: this.hemi.intensity, to: WARMTH_MIN + w * (WARMTH_MAX - WARMTH_MIN), t: 0, ms };
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

  /** The alcove that shows a (global) memory slot. Only meaningful while that slot's wing is shown. */
  alcove(slot: number): Alcove {
    return this.alcoves[((Math.floor(slot) % SLOT_COUNT) + SLOT_COUNT) % SLOT_COUNT];
  }

  static wingOf(slot: number) {
    return Math.floor(slot / SLOT_COUNT);
  }

  /** Bring a (global) slot to the centre with a snap-and-fade, stepping into its wing if needed. */
  async focus(slot: number) {
    const wing = Palace.wingOf(Math.max(0, slot));
    const local = slot - wing * SLOT_COUNT;
    if (wing === this.wing && local === this.focusSlot) return;
    await this.fadeTo(1);
    if (wing !== this.wing) {
      this.wing = wing;
      this.onWing(wing);
    }
    this.focusSlot = local;
    this.ring.rotation.y = THREE.MathUtils.degToRad(local * SLOT_DEG);
    await this.fadeTo(0);
  }

  /** Turning wraps around within the current wing. */
  snap(dir: 1 | -1) {
    const local = (((this.focusSlot + dir * SNAP_SLOTS) % SLOT_COUNT) + SLOT_COUNT) % SLOT_COUNT;
    return this.focus(this.wing * SLOT_COUNT + local);
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
    for (const f of this.tickers) f(dt, t);
    for (const a of this.alcoves) {
      const d = Math.abs(a.slot - this.focusSlot), around = Math.min(d, SLOT_COUNT - d);
      a.distant = this.nearOnly && around > NEAR_SLOTS;
      a.update(dt, t, this.pointer);
    }
  }
}
