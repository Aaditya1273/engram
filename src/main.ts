import * as THREE from 'three';
import './shared/theme.css';
import { SCENE } from './shared/theme';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { setModelEnvironment, setPreferPaintings } from './shared/props';
import { FrameGuard } from './core/frame-guard';
import { journeys } from './core/journey';
import { play, unlockAudio } from './headset/audio';
import { Cloud } from './headset/cloud';
import {
  arrivalMessage, arrive, captureFlow, languageDemo, walkJourney, watchModels, dailySession, firstFive, inboxFlow, pairFlow, readinessLines, showMemory, windDown, type Ctx,
} from './headset/flows';
import { Input } from './headset/input';
import { EYE_Y, Palace, SLOT_COUNT } from './headset/palace';
import { setNarration, setTranscriber, warmMicrophone } from './headset/speech';
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
// Soft studio light baked into a small cube map: only the generated 3D props use it (see props.ts).
setModelEnvironment(new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture);
scene.background = new THREE.Color(SCENE.sky);
// Subtle atmosphere: the far walls soften into the dusk; everything active is well inside the fog start.
scene.fog = new THREE.Fog(SCENE.sky, 2.4, 8);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.05, 30);
camera.position.set(0, EYE_Y, 0);
// On a flat screen, look a little down: the pedestals sit mid-frame and the caption below them stays in view.
// (In the headset your head sets the view.)
const DESKTOP_PITCH = -0.085;
camera.rotation.x = DESKTOP_PITCH;
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
  camera.rotation.set(DESKTOP_PITCH, 0, 0);
});

// ---------------------------------------------------------------- loop

// Sustained slow frames step quality down: first hide distant scenes, then swap 3D models for paintings.
const guard = new FrameGuard((level) => {
  if (level === 1) palace.nearOnly = true;
  if (level === 2) {
    setPreferPaintings(true);
    for (const m of store.data.memories) showMemory(ctx, m);
  }
});

let last = performance.now();
renderer.setAnimationLoop((time, frame) => {
  guard.sample(time - last, time, renderer.xr.isPresenting);
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
  palace.pointer = input.pointer;
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
  // After a sync, show anything new from other devices. Never clear here: a flow may be mid-scene.
  void cloud.connect().then(() => {
    // No browser recogniser (Quest): answers are recorded and transcribed by the server instead.
    if (cloud.stt) setTranscriber((audio, lang) => cloud.transcribe(audio, lang));
    return Promise.all([cloud.sync(), cloud.refreshGoals()]);
  }).then(() => {
    for (const m of store.data.memories) {
      showMemory(ctx, m);
      watchModels(ctx, m);
    }
  });
  const { missedDays } = arrive(store);
  if (!store.data.onboarded) {
    try {
      await firstFive(ctx);
    } catch (err) {
      // Never strand a first-time user in a broken tutorial: what they placed is saved; carry on to the palace.
      await recover(err);
      store.data.onboarded = true;
      store.save();
    }
  } else palace.setWarmth(1, 800);
  await home(missedDays);
}

/** Something threw inside a flow: say so plainly, tidy the stage, and go back to the palace. */
async function recover(err: unknown) {
  console.error('[atrium]', err);
  stage.clearRow();
  stage.showArrows(false);
  await stage.say('Something went wrong. Back to the palace.', 'Atrium').catch(() => {});
}

// Errors outside a flow (a background sync, a model load) can't derail anything; just record them.
addEventListener('unhandledrejection', (e) => console.error('[atrium] unhandled', e.reason));
addEventListener('error', (e) => console.error('[atrium] error', e.error ?? e.message));

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
    type Action = 'start' | 'practise' | 'journeys' | 'inbox' | 'capture' | 'agent' | 'print' | 'settings' | 'refresh' | 'wing';
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
        { label: 'Journeys', value: 'journeys' },
        ...(inbox.length ? [{ label: `Inbox (${inbox.length})`, value: 'inbox' as const }] : []),
        ...(wings > 1 ? [{ label: `Wing ${((palace.wing + 1) % wings) + 1} of ${wings}`, value: 'wing' as const }] : []),
        { label: 'Remember this', value: 'capture' },
        ...(cloud.online && cloud.ai ? [{ label: 'Ask an agent', value: 'agent' as const }] : []),
        ...(!input.xr && keepsakes().length ? [{ label: 'Print a keepsake', value: 'print' as const }] : []),
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
    try {
      if (action === 'wing') await palace.focus(((palace.wing + 1) % wings) * SLOT_COUNT);
      else if (action === 'settings') await settings();
      else if (action === 'journeys') await journeysMenu();
      else if (action === 'inbox') await inboxFlow(ctx, inbox);
      else if (action === 'capture') await captureFlow(ctx);
      else if (action === 'agent') await agentFlow();
      else if (action === 'print') await printFlow();
      else {
        await dailySession(ctx, missedDays, action === 'practise');
        missedDays = 0;
      }
    } catch (err) {
      await recover(err);
    }
    inbox = await cloud.inbox();
  }
}

/**
 * The agent loop on one device: a study agent writes five facts on a topic and files them in the inbox,
 * the same path Claude or any MCP agent uses. The learner still co-creates every scene.
 */
async function agentFlow() {
  const title = 'Ask an agent';
  stage.show(title, 'Pick a topic. A study agent will write five facts and send them to your inbox, just as any connected agent can.');
  let topic = await stage.ask([
    { label: 'Planets', value: 'The planets of the solar system' },
    { label: 'Cranial nerves', value: 'The cranial nerves' },
    { label: 'Spanish food', value: 'Spanish words for food' },
    ...(input.xr ? [] : [{ label: 'Type a topic', value: '' }]),
    { label: 'Back', value: 'back' },
  ]);
  if (topic === 'back') return;
  if (!topic) {
    stage.show(title, 'Type any topic, then press Enter.');
    topic = await stage.typeText('e.g. Capitals of Europe');
    if (!topic) return;
  }
  stage.show(title, 'The agent is writing…');
  try {
    const r = await cloud.agentFacts(topic);
    play('light');
    await stage.say(`The agent sent ${r.count} facts about ${r.topic} to your inbox. Open the inbox to make each one yours.`, title);
  } catch (e) {
    await stage.say(`The agent couldn't reach you just now. ${(e as Error).message}`, title);
  }
}

/** Walk any journey again (forwards, backwards, by number), or try the Japanese language demo. */
async function journeysMenu() {
  const mine = journeys(store.data.memories);
  stage.show('Journeys', mine.length ? 'Walk one of your journeys again.' : 'No journeys yet.');
  const pick = await stage.ask<string | null>([
    ...mine.slice(0, 4).map((j) => ({ label: `${j.name} (${j.length})`, value: j.id })),
    ...(store.data.memories.some((m) => m.id === 'ja-neko') ? [] : [{ label: 'Japanese words', value: 'ja' }]),
    { label: 'Back', value: null },
  ]);
  if (pick === 'ja') await languageDemo(ctx);
  else if (pick) await walkJourney(ctx, pick);
}

/** Memories with an object the learner had generated, newest first. */
const keepsakes = () => store.data.memories.filter((m) => m.scene.props.some((p) => p.model?.ready)).reverse();

/** A keepsake: the learner's own generated object as a file for a 3D printer, a physical cue for the desk. */
async function printFlow() {
  const title = 'Print a keepsake';
  stage.show(title, 'Your own 3D objects can be printed. Pick one; you get an STL file for any 3D printer or print service.');
  const m = await stage.ask([...keepsakes().slice(0, 4).map((k) => ({ label: k.display, value: k })), { label: 'Back', value: null }]);
  if (!m) return;
  stage.show(title, 'Preparing the printable file…');
  const url = await cloud.printable(m.scene.props.find((p) => p.model?.ready)!.model!.id);
  if (url) window.open(url, '_blank', 'noopener');
  await stage.say(url ? 'Your keepsake is downloading. Print it and keep it where you study.' : 'The printable file could not be made just now. Try again later.', title);
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
        { label: 'About', value: 'about' },
        { label: 'Erase everything', value: 'reset' },
        { label: 'Back', value: 'back' },
      ]);
      if (more === 'wind') return void (await windDown(ctx));
      if (more === 'text') setTextScale(1.2);
      if (more === 'about') {
        stage.show('About Atrium', [
          'A memory palace that keeps what you learn, with spaced recall (FSRS), your own gestures, and scenes you co-create.',
          'The 3D objects are generated by Aholo Lux3D (Manycore): every painted prop, and anything you name in a twist.',
          'Speech by Whisper on Groq. Built with three.js and WebXR.',
        ].join('\n'));
        await stage.ask([{ label: 'Back', value: 'back' }]);
      }
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
// The doorway: "Enter Atrium" goes into VR when the device can, otherwise onto the desktop; the two
// explicit choices beneath it do exactly what they say. The hero and the closing section both have a set.
let xrSupported = false;
void navigator.xr?.isSessionSupported('immersive-vr').then((ok) => (xrSupported = ok), () => {});
let started = false;
const start = () => {
  if (started) return;
  started = true;
  // The doorway fades out as the palace takes over.
  overlay.classList.add('leaving');
  setTimeout(() => (overlay.hidden = true), 450);
  void run();
};
const enterDesktop = () => {
  unlockAudio();
  start();
};
const enterVr = async () => {
  unlockAudio();
  const session = await navigator.xr!.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'hand-tracking'] });
  await renderer.xr.setSession(session);
  start();
  void cloud.health().then(() => warmMicrophone(cloud.stt));
};
const each = (sel: string, f: (b: HTMLButtonElement) => void) => document.querySelectorAll<HTMLButtonElement>(sel).forEach(f);
each('[data-desktop]', (b) => (b.onclick = enterDesktop));
each('[data-enter]', (b) => (b.onclick = () => (xrSupported ? void enterVr() : enterDesktop())));
each('[data-vr]', (b) => {
  b.onclick = () => {
    if (xrSupported) return void enterVr();
    const note = b.closest('section')?.querySelector<HTMLElement>('.vr-note');
    if (note) note.hidden = false;
  };
});

// Dev-only handle for automated walkthroughs (stripped from production builds).
if (import.meta.env.DEV) Object.assign(window, { atrium: { ctx, camera, scene, THREE } });
