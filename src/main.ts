import * as THREE from 'three';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { unlockAudio } from './headset/audio';
import { arrivalMessage, arrive, dailySession, firstFive, showMemory, type Ctx } from './headset/flows';
import { Input } from './headset/input';
import { EYE_Y, Palace } from './headset/palace';
import { setNarration } from './headset/speech';
import { Stage } from './headset/stage';
import { Store } from './headset/store';
import { setTextScale } from './headset/ui';

const store = new Store();
applyUrlParams(store);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation(1);
document.getElementById('app')!.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#120d09');
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 30);
camera.position.set(0, EYE_Y, 0);
scene.add(camera);

const palace = new Palace(scene, camera);
const input = new Input(renderer, camera, scene);
const stage = new Stage(palace, input);
const ctx: Ctx = { stage, palace, input, store };
input.gazeOnly = store.data.settings.gazeOnly;
setNarration(store.data.settings.narration);

// Hands are drawn as simple joint spheres: no model download, works offline.
const hands = new XRHandModelFactory();
for (const i of [0, 1]) {
  const hand = renderer.xr.getHand(i);
  hand.add(hands.createHandModel(hand, 'spheres'));
  scene.add(hand);
}

for (const m of store.data.memories) showMemory(ctx, m);

// ---------------------------------------------------------------- pause, hands lost, system menu

input.onHandsLost = (lost) => {
  if (lost && !stage.paused) stage.pause('Show your hands', 'Hold your hands in front of you.');
  else if (!lost) setTimeout(() => stage.resume(), 400);
};
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'p') stage.paused ? stage.resume() : stage.pause();
});

let needsRecenter = false;
renderer.xr.addEventListener('sessionstart', () => {
  needsRecenter = true;
  const session = renderer.xr.getSession()!;
  // Quest 3 runs at 72/90/120 Hz; 72 gives the most headroom per frame.
  void session.updateTargetFrameRate?.(72).catch(() => {});
  session.addEventListener('visibilitychange', () => {
    if (session.visibilityState !== 'visible' && !stage.paused) stage.pause();
  });
});
renderer.xr.addEventListener('sessionend', () => {
  palace.root.position.set(0, 0, 0);
  camera.position.set(0, EYE_Y, 0);
  camera.rotation.set(0, 0, 0);
});

// ---------------------------------------------------------------- loop

let last = performance.now();
renderer.setAnimationLoop((time, frame) => {
  const dt = Math.min((time - last) / 1000, 0.1);
  last = time;
  if (needsRecenter && frame) {
    const head = new THREE.Vector3();
    renderer.xr.getCamera().getWorldPosition(head);
    if (head.lengthSq() > 0) {
      palace.recenter(head);
      needsRecenter = false;
    }
  }
  input.update(frame);
  palace.update(dt, time / 1000);
  renderer.render(scene, camera);
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------- entry

async function run() {
  const { missedDays } = arrive(store);
  if (!store.data.onboarded) await firstFive(ctx);
  else palace.setWarmth(1, 800);
  await home(missedDays);
}

/** The palace at rest: browse alcoves, start the daily session, change settings. */
async function home(missedDays: number) {
  stage.onBrowseSelect = (slot) => {
    // Inspect only; snapping here would chain-snap in gaze-only mode as new alcoves slide under the reticle.
    const m = store.data.memories.find((x) => x.slot === slot);
    if (m) stage.show(`${m.display} · ${m.cue}`, m.mnemonic);
  };
  for (;;) {
    const msg = arrivalMessage(store, missedDays);
    stage.browsing = true;
    stage.showArrows(true);
    stage.show(msg.title, msg.body);
    const action = await stage.ask([
      msg.due ? { label: 'Start', value: 'start' as const } : { label: 'Practise anyway', value: 'practise' as const },
      { label: 'Settings', value: 'settings' as const },
    ]);
    stage.browsing = false;
    stage.showArrows(false);
    if (action === 'settings') await settings();
    else {
      await dailySession(ctx, missedDays, action === 'practise');
      missedDays = 0;
    }
  }
}

async function settings() {
  for (;;) {
    const s = store.data.settings;
    stage.show('Settings', 'Gaze-only: dwell 1 s to select, no gestures. Larger text applies everywhere.');
    const pick = await stage.ask([
      { label: `Gaze-only: ${s.gazeOnly ? 'on' : 'off'}`, value: 'gaze' },
      { label: `Narration: ${s.narration ? 'on' : 'off'}`, value: 'narration' },
      { label: 'Larger text', value: 'text' },
      { label: 'Reset palace', value: 'reset' },
      { label: 'Back', value: 'back' },
    ]);
    if (pick === 'back') return;
    if (pick === 'gaze') input.gazeOnly = s.gazeOnly = !s.gazeOnly;
    if (pick === 'narration') setNarration((s.narration = !s.narration));
    if (pick === 'text') setTextScale(1.2);
    if (pick === 'reset') {
      const sure = await stage.ask([{ label: 'Erase everything', value: true }, { label: 'Cancel', value: false }]);
      if (sure) {
        store.reset();
        location.reload();
      }
    }
    store.save();
  }
}

function applyUrlParams(s: Store) {
  const q = new URLSearchParams(location.search);
  if (q.has('reset')) s.reset();
  // ?skip=3d / ?skip=12h sets the clock that far ahead (?skip=0d restores real time): for demos and testing.
  const skip = q.get('skip')?.match(/^(\d+(?:\.\d+)?)([dh])$/);
  if (skip) {
    s.data.settings.clockOffset = Number(skip[1]) * (skip[2] === 'd' ? 86_400_000 : 3_600_000);
    s.save();
  }
  if (q.has('gaze')) s.data.settings.gazeOnly = q.get('gaze') !== '0';
  if (q.has('reset') || skip) history.replaceState(null, '', location.pathname);
}

// Landing overlay: one tap unlocks audio and speech, then either enter VR or stay on desktop.
const overlay = document.getElementById('overlay')!;
const enterVr = document.getElementById('enter-vr') as HTMLButtonElement;
const desktop = document.getElementById('desktop') as HTMLButtonElement;
let started = false;
const start = () => {
  if (started) return;
  started = true;
  overlay.hidden = true;
  void run();
};
desktop.onclick = () => {
  unlockAudio();
  start();
};
void navigator.xr?.isSessionSupported('immersive-vr').then((ok) => {
  if (!ok) return;
  enterVr.hidden = false;
  enterVr.onclick = async () => {
    unlockAudio();
    const session = await navigator.xr!.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'hand-tracking'] });
    await renderer.xr.setSession(session);
    start();
  };
});

// Dev-only handle for automated walkthroughs (stripped from production builds).
if (import.meta.env.DEV) Object.assign(window, { atrium: { ctx, camera, scene, THREE } });
