import * as THREE from 'three';
import { PALETTE } from '../shared/theme';
import type { Selectable } from './ui';
import { fingerCurls, handsLost, pinchAction, wristInYawFrame } from '../core/hands';

export type Modality = 'hands' | 'pointer';

const TIPS: XRHandJoint[] = ['thumb-tip', 'index-finger-tip', 'middle-finger-tip', 'ring-finger-tip', 'pinky-finger-tip'];
const HANDS: XRHandedness[] = ['left', 'right'];
export const DWELL_MS = 1000;

interface HandSample {
  wrist: THREE.Vector3;
  curls: number[];
}

/**
 * Unified input. In the headset: head gaze + pinch (WebXR select), flick by moving the
 * pinching hand sideways, hand-joint paths for gestures. On desktop: mouse ray + click,
 * arrow keys to snap, mouse path for gestures. Same flows run on both.
 */
export class Input {
  gazeOnly = false;
  onFlick: (dir: 1 | -1) => void = () => {};
  onHandsLost: (lost: boolean) => void = () => {};
  /** Set false while a modal (pause) should swallow everything except its own buttons. */
  filter: (o: THREE.Object3D) => boolean = () => true;

  readonly reticle: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private dwellRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private hovered: THREE.Object3D | null = null;
  private dwellStart = 0;
  private dwellFired = false;
  private hands = new Map<XRHandedness, HandSample>();
  private lastHandSeen = 0;
  private sawHands = false;
  private handsLost = false;
  private pinch: { at: number; pos: THREE.Vector3 | null; hand: XRHandedness } | null = null;
  private recorder: { frames: number[][]; origin: Map<XRHandedness, THREE.Vector3>; yaw: number; mouse0: THREE.Vector2 } | null = null;

  constructor(private renderer: THREE.WebGLRenderer, private camera: THREE.PerspectiveCamera, private scene: THREE.Scene) {
    this.reticle = new THREE.Mesh(new THREE.RingGeometry(0.006, 0.009, 24), new THREE.MeshBasicMaterial({ color: PALETTE.ivory, depthTest: false, transparent: true, opacity: 0.85, fog: false }));
    this.reticle.renderOrder = 99;
    this.dwellRing = new THREE.Mesh(new THREE.RingGeometry(0.011, 0.014, 24, 1, 0, 0.01), new THREE.MeshBasicMaterial({ color: PALETTE.gold, depthTest: false, transparent: true, fog: false }));
    this.dwellRing.renderOrder = 99;
    this.reticle.add(this.dwellRing);
    scene.add(this.reticle);

    const el = renderer.domElement;
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.mouseSeen = true;
    });
    el.addEventListener('pointerleave', () => (this.mouseSeen = false));
    // A click hit-tests where the mouse is now, not where it hovered last frame: new buttons can appear under a
    // still cursor (Recall Rush swaps them every few seconds) and a fast click must hit what's actually there.
    el.addEventListener('click', (e) => {
      if (this.xr) return;
      const r = el.getBoundingClientRect();
      this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.ray();
      this.hovered = this.raycaster.intersectObjects(this.targets(), false)[0]?.object ?? null;
      this.select();
    });
    window.addEventListener('keydown', (e) => {
      if (this.xr) return;
      if (e.key === 'ArrowLeft') this.onFlick(-1);
      else if (e.key === 'ArrowRight') this.onFlick(1);
      else if (e.key === 'Enter' || e.key === ' ') this.select();
    });

    renderer.xr.addEventListener('sessionstart', () => {
      const session = renderer.xr.getSession()!;
      session.addEventListener('selectstart', (e) => {
        const hand = e.inputSource.handedness;
        this.pinch = { at: performance.now(), pos: this.hands.get(hand)?.wrist.clone() ?? null, hand };
      });
      session.addEventListener('selectend', (e) => {
        const p = this.pinch;
        this.pinch = null;
        const now = this.hands.get(e.inputSource.handedness)?.wrist;
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
        const action = pinchAction(p?.pos ?? null, now, p ? performance.now() - p.at : Infinity, right);
        if (action === 'select') this.select();
        else this.onFlick(action);
      });
    });
  }

  get xr() {
    return this.renderer.xr.isPresenting;
  }

  get modality(): Modality {
    return this.xr && this.sawHands ? 'hands' : 'pointer';
  }

  private select() {
    const sel = this.hovered?.userData.selectable as Selectable | undefined;
    sel?.onSelect();
  }

  /** The mouse ray on a computer once the mouse has moved over the palace; null in the headset. */
  get pointer(): THREE.Ray | null {
    return !this.xr && this.mouseSeen ? this.raycaster.ray : null;
  }
  private mouseSeen = false;

  private ray() {
    if (this.xr) {
      const pos = new THREE.Vector3(), dir = new THREE.Vector3();
      this.camera.getWorldPosition(pos);
      this.camera.getWorldDirection(dir);
      this.raycaster.set(pos, dir);
    } else {
      this.raycaster.setFromCamera(this.mouse, this.camera);
    }
  }

  private targets(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    this.scene.traverseVisible((o) => {
      if (o.userData.selectable && this.filter(o)) out.push(o);
    });
    return out;
  }

  update(frame: XRFrame | undefined) {
    if (frame) this.readHands(frame);
    this.ray();
    const hit = this.raycaster.intersectObjects(this.targets(), false)[0];
    const next = hit?.object ?? null;
    if (next !== this.hovered) {
      (this.hovered?.userData.selectable as Selectable | undefined)?.onHover?.(false);
      (next?.userData.selectable as Selectable | undefined)?.onHover?.(true);
      this.hovered = next;
      this.dwellStart = performance.now();
      this.dwellFired = false;
      // Something pressable under the mouse: the pointing-hand cursor (theme.css).
      this.renderer.domElement.classList.toggle('pointing', !!next && !this.xr);
    }

    // Reticle: in the headset it marks head gaze; on desktop the mouse cursor does that job.
    const showReticle = this.xr || this.gazeOnly;
    this.reticle.visible = showReticle;
    if (showReticle) {
      const d = hit ? Math.min(hit.distance, 2.5) - 0.01 : 1.5;
      this.reticle.position.copy(this.raycaster.ray.origin).addScaledVector(this.raycaster.ray.direction, d);
      this.reticle.quaternion.copy(this.camera.getWorldQuaternion(new THREE.Quaternion()));
      this.reticle.scale.setScalar(d);
    }

    // Gaze-only mode: dwell selects.
    let progress = 0;
    if (this.gazeOnly && this.hovered && !this.dwellFired) {
      progress = (performance.now() - this.dwellStart) / DWELL_MS;
      if (progress >= 1) {
        this.dwellFired = true;
        progress = 0;
        this.select();
      }
    }
    this.dwellRing.visible = progress > 0;
    if (progress > 0) {
      this.dwellRing.geometry.dispose();
      this.dwellRing.geometry = new THREE.RingGeometry(0.011, 0.014, 24, 1, Math.PI / 2, -progress * Math.PI * 2);
    }

    // Hands-lost recovery.
    if (this.xr && this.sawHands && !this.gazeOnly) {
      const lost = handsLost(performance.now(), this.lastHandSeen);
      if (lost !== this.handsLost) {
        this.handsLost = lost;
        this.onHandsLost(lost);
      }
    }

    if (this.recorder) this.recorder.frames.push(this.features());
  }

  private readHands(frame: XRFrame) {
    const ref = this.renderer.xr.getReferenceSpace();
    if (!ref) return;
    const seen = new Set<XRHandedness>();
    for (const src of frame.session.inputSources) {
      if (!src.hand || !frame.getJointPose) continue;
      const wristPose = frame.getJointPose(src.hand.get('wrist')!, ref);
      const midPose = frame.getJointPose(src.hand.get('middle-finger-phalanx-proximal')!, ref);
      if (!wristPose || !midPose) continue;
      const wrist = vec(wristPose);
      const tips = TIPS.map((j) => {
        const p = frame.getJointPose!(src.hand!.get(j)!, ref);
        return p ? vec(p) : null;
      });
      const curls = fingerCurls(wrist, tips, wrist.distanceTo(vec(midPose)));
      // Light smoothing against tracking jitter.
      const prev = this.hands.get(src.handedness);
      if (prev) {
        wrist.lerp(prev.wrist, 0.4);
        curls.forEach((c, i) => (curls[i] = c * 0.6 + prev.curls[i] * 0.4));
      }
      this.hands.set(src.handedness, { wrist, curls });
      seen.add(src.handedness);
    }
    for (const h of HANDS) if (!seen.has(h)) this.hands.delete(h);
    if (seen.size) {
      this.sawHands = true;
      this.lastHandSeen = performance.now();
    }
  }

  /** One feature vector per frame. Wrist travel is relative to the start, in the head's yaw frame. */
  private features(): number[] {
    const rec = this.recorder!;
    if (this.modality === 'pointer') return [(this.mouse.x - rec.mouse0.x) * 1.5, (this.mouse.y - rec.mouse0.y) * 1.5];
    const out: number[] = [];
    for (const h of HANDS) {
      const s = this.hands.get(h);
      if (!s) {
        out.push(0, 0, 0, 0, 0, 0, 0, 0);
        continue;
      }
      if (!rec.origin.has(h)) rec.origin.set(h, s.wrist.clone());
      out.push(...wristInYawFrame(s.wrist, rec.origin.get(h)!, rec.yaw), ...s.curls);
    }
    return out;
  }

  /** Record a gesture for ms milliseconds. */
  captureGesture(ms: number): Promise<{ frames: number[][]; modality: Modality }> {
    const e = new THREE.Euler().setFromQuaternion(this.camera.getWorldQuaternion(new THREE.Quaternion()), 'YXZ');
    this.recorder = { frames: [], origin: new Map(), yaw: e.y, mouse0: this.mouse.clone() };
    const modality = this.modality;
    return new Promise((res) =>
      setTimeout(() => {
        const frames = this.recorder?.frames ?? [];
        this.recorder = null;
        res({ frames, modality });
      }, ms),
    );
  }

  /** In the headset with controllers only, there are no hand paths to record. */
  get canGesture() {
    return !this.gazeOnly && (!this.xr || this.sawHands);
  }

  get handsVisible() {
    return this.hands.size > 0;
  }
}

const vec = (p: XRPose) => new THREE.Vector3(p.transform.position.x, p.transform.position.y, p.transform.position.z);
