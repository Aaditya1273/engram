import * as THREE from 'three';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { play, unlockAudio } from './headset/audio';
import { Cloud } from './headset/cloud';
import {
  arrivalMessage, arrive, captureFlow, dailySession, firstFive, inboxFlow, pairFlow, readinessLines, showMemory, windDown, type Ctx,
} from './headset/flows';
import { Input } from './headset/input';
import { EYE_Y, Palace, SLOT_COUNT } from './headset/palace';
import { setNarration } from './headset/speech';
import { Stage } from './headset/stage';
import { Store } from './headset/store';
import { makeQrPanel, setTextScale } from './headset/ui';
import type { InboxItem } from './shared/types';

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
const cloud = new Cloud(store);
const ctx: Ctx = { stage, palace, input, store, cloud };
input.gazeOnly = store.data.settings.gazeOnly;
setNarration(store.data.settings.narration);

// Hands are drawn as simple joint spheres: no model download, works offline.
const hands = new XRHandModelFactory();
for (const i of [0, 1]) {
  const hand = renderer.xr.getHand(i);
  hand.add(hands.createHandModel(hand, 'spheres'));
  scene.add(hand);
}

/** Alcoves show one wing at a time; switching wings (inside the snap fade) re-fills them. */
palace.onWing = () => {
  for (const a of palace.alcoves) a.clear();
  for (const m of store.data.memories) showMemory(ctx, m);
};
palace.onWing(0);

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
  // Cloud is optional: register/sync in the background; the palace never waits for the network.
  void cloud.connect().then(() => Promise.all([cloud.sync(), cloud.refreshGoals()])).then(() => {
    /** Alcoves show one wing at a time; switching wings (inside the snap fade) re-fills them. */
palace.onWing = () => {
  for (const a of palace.alcoves) a.clear();
  for (const m of store.data.memories) showMemory(ctx, m);
};
palace.onWing(0);
  });
  const { missedDays } = arrive(store);
  if (!store.data.onboarded) await firstFive(ctx);
  else palace.setWarmth(1, 800);
  await home(missedDays);
}

const INBOX_POLL_MS = 15_000;

/** The palace at rest: browse alcoves, start the daily session, co-create the inbox, capture, settings. */
async function home(missedDays: number) {
  stage.onBrowseSelect = (slot) => {
    // Inspect only; snapping here would chain-snap in gaze-only mode as new alcoves slide under the reticle.
    const m = store.data.memories.find((x) => x.slot === slot);
    if (m) stage.show(`${m.display} · ${m.cue}`, `${m.question}\n${m.mnemonic}`);
  };
  let inbox: InboxItem[] = await cloud.inbox();
  for (;;) {
    const msg = arrivalMessage(store, missedDays);
    const lines = readinessLines(store);
    stage.browsing = true;
    stage.showArrows(true);
    stage.show(msg.title, [msg.body, ...lines].join('\n'));
    type Action = 'start' | 'practise' | 'inbox' | 'capture' | 'settings' | 'refresh' | 'wing';
    const wings = Math.max(1, ...store.data.memories.map((m) => Palace.wingOf(m.slot) + 1));
    // Items sent from the phone or an agent arrive while the menu is up; re-render when the count changes.
    let stopPoll = () => {};
    const inboxChanged = new Promise<Action>((res) => {
      const timer = setInterval(async () => {
        const next = await cloud.inbox();
        if (next.length !== inbox.length) {
          if (next.length > inbox.length) play('light');
          inbox = next;
          res('refresh');
        }
      }, INBOX_POLL_MS);
      stopPoll = () => clearInterval(timer);
    });
    const action = await Promise.race([
      stage.ask<Action>([
        msg.due ? { label: 'Start', value: 'start' } : { label: 'Practise anyway', value: 'practise' },
        ...(inbox.length ? [{ label: `Inbox (${inbox.length})`, value: 'inbox' as const }] : []),
        ...(wings > 1 ? [{ label: `Wing ${((palace.wing + 1) % wings) + 1} of ${wings}`, value: 'wing' as const }] : []),
        { label: 'Remember this', value: 'capture' },
        { label: 'Settings', value: 'settings' },
      ]),
      inboxChanged,
    ]);
    stopPoll();
    stage.browsing = false;
    stage.showArrows(false);
    if (action === 'refresh') {
      stage.clearRow();
      continue;
    }
    if (action === 'wing') await palace.focus(((palace.wing + 1) % wings) * SLOT_COUNT);
    else if (action === 'settings') await settings();
    else if (action === 'inbox') await inboxFlow(ctx, inbox);
    else if (action === 'capture') await captureFlow(ctx);
    else {
      await dailySession(ctx, missedDays, action === 'practise');
      missedDays = 0;
    }
    inbox = await cloud.inbox();
  }
}

/** Show a pairing QR in front of the user; returns a function that removes it. */
function showQr(url: string, code: string) {
  const panel = makeQrPanel(url, code);
  panel.position.set(0, 1.22, -0.8);
  palace.root.add(panel);
  return () => {
    palace.root.remove(panel);
    panel.dispose();
  };
}

async function settings() {
  for (;;) {
    const s = store.data.settings;
    stage.show('Settings', `Gaze-only: dwell 1 s to select, no gestures.${cloud.online ? '' : ' Cloud: offline.'}`);
    const pick = await stage.ask([
      { label: 'Connect phone', value: 'pair' },
      { label: `Gaze-only: ${s.gazeOnly ? 'on' : 'off'}`, value: 'gaze' },
      { label: `Narration: ${s.narration ? 'on' : 'off'}`, value: 'narration' },
      { label: 'More…', value: 'more' },
      { label: 'Back', value: 'back' },
    ]);
    if (pick === 'back') return;
    if (pick === 'pair') await pairFlow(ctx, showQr);
    if (pick === 'gaze') input.gazeOnly = s.gazeOnly = !s.gazeOnly;
    if (pick === 'narration') setNarration((s.narration = !s.narration));
    if (pick === 'more') {
      const more = await stage.ask([
        { label: 'Wind-down walk', value: 'wind' },
        { label: 'Larger text', value: 'text' },
        { label: 'Erase everything', value: 'reset' },
        { label: 'Back', value: 'back' },
      ]);
      if (more === 'wind') return void (await windDown(ctx));
      if (more === 'text') setTextScale(1.2);
      if (more === 'reset') {
        stage.show('Erase everything?', 'This deletes your palace here and your account in the cloud. It cannot be undone.');
        const sure = await stage.ask([{ label: 'Erase', value: true }, { label: 'Cancel', value: false }]);
        if (sure) {
          await cloud.deleteAccount();
          store.reset();
          location.reload();
        }
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
