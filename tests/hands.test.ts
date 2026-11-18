/**
 * Hands-first input: the controller-free path judges test first.
 *
 * Part 1 tests the pure hand math (src/core/hands.ts).
 * Part 2 drives the real headset Input class (src/headset/input.ts) through a simulated WebXR
 * session: hand joints arrive via XRFrame.getJointPose and pinches via selectstart / selectend,
 * exactly as the Meta Quest browser delivers them. No controller input source is ever created.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { fingerCurls, FLICK_M, handsLost, HANDS_LOST_MS, pinchAction, wristInYawFrame, WRIST_SCALE } from '../src/core/hands';
import { enrol, match } from '../src/core/gesture';

const RIGHT = { x: 1, y: 0, z: 0 };

describe('hand math', () => {
  it('a still pinch is a select; a quick sideways pinch is a flick', () => {
    const a = { x: 0, y: 1, z: -0.4 };
    expect(pinchAction(a, a, 200, RIGHT)).toBe('select');
    expect(pinchAction(a, { ...a, x: a.x - 0.1 }, 300, RIGHT)).toBe(1);
    expect(pinchAction(a, { ...a, x: a.x + 0.1 }, 300, RIGHT)).toBe(-1);
  });

  it('small drift, slow pinches and missing tracking stay selects', () => {
    const a = { x: 0, y: 1, z: -0.4 };
    expect(pinchAction(a, { ...a, x: a.x - FLICK_M * 0.9 }, 300, RIGHT)).toBe('select');
    expect(pinchAction(a, { ...a, x: a.x - 0.2 }, 900, RIGHT)).toBe('select');
    expect(pinchAction(null, a, 100, RIGHT)).toBe('select');
    expect(pinchAction(a, undefined, 100, RIGHT)).toBe('select');
  });

  it('judges flicks relative to the head, so a seated user can face any way', () => {
    // Head turned 90° left: its right vector points to -Z.
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    const a = { x: 0, y: 1, z: 0 };
    expect(pinchAction(a, { x: 0, y: 1, z: 0.1 }, 300, right)).toBe(1);
    expect(pinchAction(a, { x: 0.1, y: 1, z: 0 }, 300, right)).toBe('select');
  });

  it('wrist paths match three.js yaw rotation and are scaled to ~15 cm per unit', () => {
    const origin = { x: 0.2, y: 1.1, z: -0.3 };
    const wrist = { x: 0.31, y: 1.05, z: -0.22 };
    for (const yaw of [0, 0.7, -2.1, Math.PI]) {
      const expected = new THREE.Vector3(wrist.x - origin.x, wrist.y - origin.y, wrist.z - origin.z)
        .applyQuaternion(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -yaw))
        .divideScalar(WRIST_SCALE);
      const got = wristInYawFrame(wrist, origin, yaw);
      expect(got[0]).toBeCloseTo(expected.x, 10);
      expect(got[1]).toBeCloseTo(expected.y, 10);
      expect(got[2]).toBeCloseTo(expected.z, 10);
    }
  });

  it('finger curls scale with hand size and read 0 for untracked tips', () => {
    const w = { x: 0, y: 0, z: 0 };
    const open = fingerCurls(w, [{ x: 0, y: 0.18, z: 0 }, null], 0.09);
    expect(open[0]).toBeCloseTo(0.8);
    expect(open[1]).toBe(0);
    // A child's hand making the same shape reads the same.
    expect(fingerCurls(w, [{ x: 0, y: 0.12, z: 0 }], 0.06)[0]).toBeCloseTo(0.8);
  });

  it('hands count as lost only after the grace period', () => {
    expect(handsLost(1000 + HANDS_LOST_MS, 1000)).toBe(false);
    expect(handsLost(1001 + HANDS_LOST_MS, 1000)).toBe(true);
  });
});

// ---------------------------------------------------------------- simulated Quest WebXR session

const JOINTS = ['wrist', 'middle-finger-phalanx-proximal', 'thumb-tip', 'index-finger-tip', 'middle-finger-tip', 'ring-finger-tip', 'pinky-finger-tip'];

class FakeHand {
  joints = new Map(JOINTS.map((n) => [n, { jointName: n }]));
  pose = new Map<string, THREE.Vector3>();
  get(n: string) {
    return this.joints.get(n);
  }
  /** Place the hand: wrist position, and how open the fingers are (0 fist … 1 open). */
  set(wrist: THREE.Vector3, open = 1) {
    this.pose.set('wrist', wrist.clone());
    this.pose.set('middle-finger-phalanx-proximal', wrist.clone().add(new THREE.Vector3(0, 0.09, 0)));
    JOINTS.slice(2).forEach((n, i) => this.pose.set(n, wrist.clone().add(new THREE.Vector3((i - 2) * 0.02, 0.05 + 0.13 * open, 0))));
  }
}

function makeRig() {
  let clock = 10_000;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  const g = globalThis as unknown as { window?: EventTarget };
  g.window ??= new EventTarget();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 50);
  camera.position.set(0, 1.2, 0);
  const domElement = Object.assign(new EventTarget(), {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    classList: { toggle() {} },
  });
  const session = Object.assign(new EventTarget(), { inputSources: [] as unknown[] });
  const xr = Object.assign(new EventTarget(), { isPresenting: true, getSession: () => session, getReferenceSpace: () => ({}) });
  return { scene, camera, domElement, session, xr, tick: (ms: number) => (clock += ms) };
}

describe('headset input through a simulated WebXR session (hands only, no controllers)', () => {
  type Rig = ReturnType<typeof makeRig>;
  let rig: Rig;
  let input: import('../src/headset/input').Input;
  let left: FakeHand, right: FakeHand;
  let selected: number;
  const button = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4));

  const frame = () =>
    ({
      session: rig.session,
      getJointPose: (joint: { jointName: string }) => {
        for (const h of [left, right]) {
          if (h.get(joint.jointName) !== joint) continue;
          const p = h.pose.get(joint.jointName);
          return p ? { transform: { position: { x: p.x, y: p.y, z: p.z } } } : undefined;
        }
      },
    }) as unknown as XRFrame;

  const step = (n = 1, ms = 16) => {
    for (let i = 0; i < n; i++) {
      rig.tick(ms);
      rig.camera.updateMatrixWorld(true);
      input.update(frame());
    }
  };
  const pinch = (type: 'selectstart' | 'selectend', handedness: XRHandedness = 'right') =>
    rig.session.dispatchEvent(Object.assign(new Event(type), { inputSource: { handedness } }));
  const faceYaw = (yaw: number) => rig.camera.rotation.set(0, yaw, 0);

  beforeEach(async () => {
    rig = makeRig();
    const { Input } = await import('../src/headset/input');
    input = new Input({ domElement: rig.domElement, xr: rig.xr } as unknown as THREE.WebGLRenderer, rig.camera, rig.scene);
    selected = 0;
    button.position.set(0, 1.2, -1);
    button.userData.selectable = { onSelect: () => selected++ };
    rig.scene.add(button);
    rig.scene.updateMatrixWorld(true);
    left = new FakeHand();
    right = new FakeHand();
    left.set(new THREE.Vector3(-0.2, 1.0, -0.35));
    right.set(new THREE.Vector3(0.2, 1.0, -0.35));
    rig.session.inputSources = [
      { handedness: 'left', hand: left },
      { handedness: 'right', hand: right },
    ];
    rig.xr.dispatchEvent(new Event('sessionstart'));
    step(3);
  });
  afterEach(() => vi.restoreAllMocks());

  it('reports hands as the input modality once hand joints are tracked', () => {
    expect(input.modality).toBe('hands');
    expect(input.handsVisible).toBe(true);
    expect(input.canGesture).toBe(true);
  });

  it('look + pinch selects what the head is looking at', () => {
    pinch('selectstart');
    step(5);
    pinch('selectend');
    expect(selected).toBe(1);
  });

  it('pinch + sideways flick turns to the next arc instead of selecting', () => {
    const flicks: number[] = [];
    input.onFlick = (d) => flicks.push(d);
    pinch('selectstart');
    right.set(new THREE.Vector3(0.05, 1.0, -0.35)); // 15 cm to the left
    step(4);
    pinch('selectend');
    expect(flicks).toEqual([1]);
    expect(selected).toBe(0);
  });

  it('pauses when hands leave tracking for more than 2 s and resumes when they return', () => {
    const events: boolean[] = [];
    input.onHandsLost = (lost) => events.push(lost);
    rig.session.inputSources = [];
    step(1, 1000);
    expect(events).toEqual([]);
    step(1, 1500);
    expect(events).toEqual([true]);
    expect(input.handsVisible).toBe(false);
    rig.session.inputSources = [{ handedness: 'right', hand: right }];
    step(1);
    expect(events).toEqual([true, false]);
  });

  it('gaze-only mode selects by a 1 s dwell, with no hands at all', () => {
    input.gazeOnly = true;
    rig.session.inputSources = [];
    step(1);
    step(1, 500);
    expect(selected).toBe(0);
    step(1, 600);
    expect(selected).toBe(1);
  });

  // A memory gesture: "stroking a cat" = the right wrist sweeping forward-and-down, fingers open.
  const stroke = (t: number) => new THREE.Vector3(0.2 * Math.sin(t * Math.PI) * 0.3, -0.08 * t, -0.15 * t);
  // A different gesture: waving = side to side, fingers open, hand raised.
  const wave = (t: number) => new THREE.Vector3(0.12 * Math.sin(t * 4 * Math.PI), 0.1, 0);

  /** Perform a gesture while facing `yaw`: the path is defined in the user's own frame and rotated into the world. */
  async function perform(fn: (t: number) => THREE.Vector3, yaw = 0, frames = 40, jitter = 0) {
    faceYaw(yaw);
    rig.camera.updateMatrixWorld(true);
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const start = right.pose.get('wrist')!.clone();
    const take = input.captureGesture(2000);
    for (let i = 0; i < frames; i++) {
      const p = fn(i / (frames - 1)).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      right.set(start.clone().add(p).addScalar(Math.sin(i * 12.9898) * jitter), 0.6 + 0.4 * (i / frames));
      step(1, 50);
    }
    vi.advanceTimersByTime(2000);
    vi.useRealTimers();
    right.set(start);
    step(3);
    return take;
  }

  it('records two-hand joint paths and grades a recall against your own recording', async () => {
    const a = await perform(stroke);
    const b = await perform(stroke, 0, 32, 0.004);
    expect(a.modality).toBe('hands');
    expect(a.frames[0]).toHaveLength(16); // per hand: wrist xyz + 5 finger curls
    const enrolled = enrol('hands', a.frames, b.frames);
    if (!enrolled.ok) throw new Error(`enrolment failed: ${enrolled.reason}`);

    // Same gesture, a little faster, while turned 60° in the seat: still recognised.
    const again = await perform(stroke, Math.PI / 3, 28, 0.004);
    expect(match(enrolled.signature, again.frames, 'hands')!.ok).toBe(true);

    // A different gesture is rejected.
    const other = await perform(wave);
    expect(match(enrolled.signature, other.frames, 'hands')!.ok).toBe(false);
  });
});
