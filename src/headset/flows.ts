import { answerMatches } from '../core/answer';
import { enrol, match } from '../core/gesture';
import { gradeRecall } from '../core/grade';
import { DESIRED_RETENTION } from '../core/model';
import { canRepair, dayKey, daysBetween, recordFullSession, recordRecall, rollover } from '../core/streak';
import { planSession } from '../core/triage';
import { applyTwist, isEmptyTwist, parseTwist } from '../core/twist';
import { JA_STARTER } from '../shared/deck-ja';
import type { DeckItem, GestureSignature, Memory, SceneSpec } from '../shared/types';
import { play } from './audio';
import type { Input } from './input';
import type { Palace } from './palace';
import { listen, speechAvailable } from './speech';
import type { Stage } from './stage';
import type { Store } from './store';

export interface Ctx {
  stage: Stage;
  palace: Palace;
  input: Input;
  store: Store;
}

const DAY = 86_400_000;
const GESTURE_MS = 2000;
const RECALL_GESTURE_MS = 3000;
/** Gentle stop: "Your memory needs time to settle." */
const SESSION_CAP_MS = 20 * 60_000;
const shuffle = <T>(a: T[]) => a.map((v) => [Math.random(), v] as const).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
const pinchWord = (input: Input) => (input.xr ? 'Pinch' : 'Click');

// ---------------------------------------------------------------- shared steps

/** Record a gesture twice and enrol it. Returns undefined if the user skips or the device can't track hands. */
async function enrolGesture({ stage, input }: Ctx, hint: string): Promise<GestureSignature | undefined> {
  if (!input.canGesture) return undefined;
  const how = input.modality === 'hands' ? 'with your hands' : 'by moving the mouse';
  await stage.say(`Now invent a gesture for it, ${how}. Idea: ${hint.toLowerCase()}. Make it your own.`, 'Your gesture');
  for (let attempt = 0; attempt < 3; attempt++) {
    const takes: number[][][] = [];
    for (const n of [1, 2]) {
      await stage.countdown(`Take ${n} of 2`);
      takes.push((await input.captureGesture(GESTURE_MS)).frames);
    }
    const r = enrol(input.modality, takes[0], takes[1]);
    if (r.ok) {
      play('tick');
      return r.signature;
    }
    const why = r.reason === 'still' ? "I didn't see much movement." : 'Those two takes were quite different.';
    const again = await stage.ask([{ label: 'Try again', value: true }, { label: 'Skip gesture', value: false }]);
    stage.show('Your gesture', why);
    if (!again) return undefined;
  }
  return undefined;
}

/** One voice twist, mapped onto the prop kit. Falls back to pinchable twists without speech. */
async function addTwist({ stage, store }: Ctx, scene: SceneSpec): Promise<{ scene: SceneSpec; twist?: string }> {
  await stage.say('Make it yours. Say one personal detail, like "give it my red hat" or "add glasses".', 'Add a twist');
  let text = '';
  if (speechAvailable()) {
    stage.show('Add a twist', 'Listening…');
    text = (await listen(store.data.settings.twistLang, 6000).result)[0] ?? '';
  }
  let twist = parseTwist(text);
  if (isEmptyTwist(twist)) {
    if (text) stage.show('Add a twist', `I heard "${text}". Pick one instead:`);
    text = await stage.ask([
      { label: 'Red hat', value: 'red hat' },
      { label: 'Glasses', value: 'glasses' },
      { label: 'Make it gold', value: 'gold' },
      { label: 'Skip', value: '' },
    ]);
    twist = parseTwist(text);
  }
  if (isEmptyTwist(twist)) return { scene };
  play('light');
  return { scene: applyTwist(scene, twist), twist: text };
}

function placeMemory(ctx: Ctx, item: DeckItem, scene: SceneSpec, slot: number, gesture?: GestureSignature, twist?: string): Memory {
  const { store, palace } = ctx;
  const now = store.now();
  const m: Memory = {
    id: item.id, cue: item.cue, answers: item.answers, display: item.display, mnemonic: scene.mnemonic, scene,
    twist, gesture, topic: 'Japanese starter', goalWeight: 1, slot, createdAt: now,
  };
  store.addMemory(m);
  // Encoding counts as the first successful study; FSRS then schedules the learning steps.
  store.addReview({ memoryId: m.id, at: now, grade: 'good', answerOk: true, gestureScore: null, latencyMs: 0 });
  const a = palace.alcoves[slot];
  a.setScene(scene);
  a.setLabel(`${m.display} · ${m.cue}`);
  a.setRecall(store.recall(m));
  a.burst();
  play('light');
  return m;
}

export function showMemory(ctx: Ctx, m: Memory) {
  const a = ctx.palace.alcoves[m.slot];
  a.setScene(m.scene);
  a.setLabel(`${m.display} · ${m.cue}`);
  a.setRecall(ctx.store.recall(m), true);
}

/**
 * Graded recall: say the answer and perform the gesture; Atrium checks both. No self-rating.
 * Without speech, three pinchable answers replace the spoken one (still graded, never self-rated).
 */
export async function recallOne(ctx: Ctx, m: Memory, others: Memory[]): Promise<boolean> {
  const { stage, palace, input, store } = ctx;
  await stage.whilePaused();
  const alcove = palace.alcoves[m.slot];
  alcove.setVeiled(true);
  const doGesture = !!m.gesture && input.canGesture && m.gesture.modality === input.modality;
  const prompt = `What is "${m.cue}" in Japanese?`;
  let t0 = performance.now();
  let answerOk = false, revealed = false, heard: string[] = [];
  // Held in an object: it's assigned inside a promise callback, which TS narrowing can't see.
  const g: { result: ReturnType<typeof match> } = { result: null };

  if (speechAvailable()) {
    await stage.say(doGesture ? 'Say it, and do your gesture.' : 'Say it out loud.', prompt);
    t0 = performance.now(); // latency counts from when we start listening, not from the narration
    for (let tries = 0; tries < 2 && !revealed && !answerOk; tries++) {
      const watching = input.modality === 'hands' ? 'watching your hands' : 'watching your gesture';
      stage.show(prompt, doGesture ? `Listening… and ${watching}.` : 'Listening…');
      const l = listen(store.data.settings.answerLang, 6000);
      stage.offer([{ label: 'Show me', onSelect: () => { revealed = true; l.stop(); } }]);
      const capture = doGesture && tries === 0 ? input.captureGesture(RECALL_GESTURE_MS) : null;
      [heard] = await Promise.all([l.result, capture?.then((r) => (g.result = match(m.gesture!, r.frames, r.modality)))]);
      stage.clearRow();
      answerOk = answerMatches(heard, m.answers);
      // Retry once only if nothing was heard at all; a wrong answer is a real miss.
      if (heard.length > 0 || revealed || !speechAvailable()) break;
      stage.show(prompt, "I didn't catch that. Once more?");
      await stage.sleep(900);
    }
  }
  if (!speechAvailable() && !revealed && !answerOk && heard.length === 0) {
    if (doGesture) {
      await stage.countdown('Your gesture first');
      const r = await input.captureGesture(RECALL_GESTURE_MS);
      g.result = match(m.gesture!, r.frames, r.modality);
    }
    stage.show(prompt, 'Pick the answer.');
    t0 = performance.now();
    const pool = shuffle(others.filter((o) => o.id !== m.id)).slice(0, 2).map((o) => o.display);
    const pick = await stage.ask(shuffle([m.display, ...pool, ...(pool.length < 2 ? ['—'] : [])]).map((d) => ({ label: d, value: d })));
    answerOk = pick === m.display;
  }

  const gesture = g.result;
  const latencyMs = performance.now() - t0;
  const grade = gradeRecall(answerOk, gesture, latencyMs);
  store.addReview({ memoryId: m.id, at: store.now(), grade, answerOk, gestureScore: gesture?.score ?? null, latencyMs: Math.round(latencyMs) });
  alcove.setVeiled(false);
  alcove.setLabel(`${m.display} · ${m.cue}`);
  alcove.setRecall(store.recall(m));

  if (answerOk) {
    alcove.burst();
    play('relight');
    const note = gesture === null ? '' : gesture.ok ? ' Gesture matched.' : " Gesture didn't quite match, but it still counts.";
    await stage.say(`Yes, ${m.display}.${note}`, '✦ Relit');
  } else {
    play('miss');
    await stage.say(`It was ${m.display}. ${m.mnemonic}`, `${m.display} · ${m.cue}`);
  }
  return answerOk;
}

// ---------------------------------------------------------------- the first five minutes

export async function firstFive(ctx: Ctx) {
  const { stage, palace, store, input } = ctx;
  const pinch = pinchWord(input);
  palace.setWarmth(0, 1);
  palace.alcoves[0].setRecall(1, true);

  // 0:00 – one lantern, one pinch.
  stage.show('Atrium', `${pinch} the glowing lantern to light it.`);
  void stage.say(`Welcome. ${input.xr ? 'Look at' : 'Point at'} the glowing lantern, and ${pinch.toLowerCase()} to light it.`, 'Atrium');
  await stage.waitAlcove(0);
  play('light');
  palace.setWarmth(1, 1600);
  palace.alcoves[0].setRecall(null);
  await stage.say('Light means memory. Each alcove will hold one thing you know.', 'Atrium');

  // 0:20 – moving without standing.
  stage.showArrows(true);
  const flickHow = input.xr ? 'pinch and flick your hand sideways' : 'press an arrow key';
  await stage.say(`The room turns, so you never have to. To move, ${flickHow}, or ${pinch.toLowerCase()} an arrow.`, 'Turning');
  const dir = await stage.waitFlick();
  await palace.snap(dir);
  await stage.say('Everything comes to you. Now, six Japanese words.', 'Turning');
  await palace.focus(0);
  stage.showArrows(false);

  // 0:45 – six words: choose a scene, add a twist (word 2), invent a gesture, place it.
  const placed: Memory[] = [];
  for (const [i, item] of JA_STARTER.entries()) {
    await palace.focus(i);
    await stage.say(`${item.display} means ${item.cue}. Pick the scene that sticks for you.`, `${item.display} · ${item.cue}`);
    let scene = item.scenes[await stage.chooseScene(item)];
    palace.alcoves[i].setScene(scene);
    await stage.say(scene.mnemonic, `${item.display} · ${item.cue}`);
    let twist: string | undefined;
    if (i === 1) {
      ({ scene, twist } = await addTwist(ctx, scene));
      palace.alcoves[i].setScene(scene);
    }
    const gesture = await enrolGesture(ctx, item.gestureHint);
    placed.push(placeMemory(ctx, item, scene, i, gesture, twist));
  }

  // 2:45 – this is what forgetting looks like (the real model, on a simulated clock).
  await palace.focus(2.5);
  await stage.say('This is what forgetting looks like.', 'Three weeks, without practice');
  const now = store.now();
  for (let s = 0; s <= 1; s += 1 / 45) {
    for (const m of placed) palace.alcoves[m.slot].setRecall(store.recall(m, now + s * s * 21 * DAY), true);
    await stage.sleep(60);
  }
  await stage.say("Your lanterns dim as memories fade. Let's beat it.", 'Three weeks, without practice');

  // 3:15 – graded recall.
  let score = 0;
  for (const m of shuffle(placed)) {
    await palace.focus(m.slot);
    if (await recallOne(ctx, m, placed)) score++;
  }
  for (const m of placed) palace.alcoves[m.slot].setRecall(store.recall(m));

  // 4:15 – the payoff and the daily promise.
  await palace.focus(2.5);
  const today = dayKey(store.now());
  store.data.streak = recordFullSession(store.data.streak, today);
  store.data.onboarded = true;
  store.save();
  await stage.say(
    `${score >= 5 ? 'Brilliant. ' : ''}You remembered ${score} of ${placed.length}. Tomorrow I'll check you again, for just a few minutes.`,
    `${score} of ${placed.length}`,
  );
}

// ---------------------------------------------------------------- daily session

export interface Arrival {
  missedDays: number;
}

/**
 * Call once when the app opens: rolls the streak over (spending freezes) and reports days away.
 * Days away come from the review log, not the streak: a broken streak forgets its last day.
 */
export function arrive(store: Store): Arrival {
  const today = dayKey(store.now());
  store.data.streak = rollover(store.data.streak, today).state;
  store.save();
  const last = store.data.reviews.reduce((t, r) => Math.max(t, r.at), 0);
  return { missedDays: last ? Math.max(0, daysBetween(dayKey(last), today) - 1) : 0 };
}

export function dueSummary(store: Store, missedDays: number) {
  const now = store.now();
  const items = store.data.memories.map((m) => ({ id: m.id, r: store.recall(m, now), due: store.due(m), goalWeight: m.goalWeight }));
  return planSession(items, now, { missedDays });
}

export async function dailySession(ctx: Ctx, missedDays: number, practiceAnyway = false) {
  const { stage, palace, store } = ctx;
  const all = store.data.memories;
  let plan = dueSummary(store, missedDays);
  if (plan.ids.length === 0 && practiceAnyway) {
    // Nothing due: pick the dimmest few. Reviewing early is harmless in FSRS, just less efficient.
    const now = store.now();
    plan = { ...plan, ids: [...all].sort((a, b) => store.recall(a, now) - store.recall(b, now)).slice(0, 4).map((m) => m.id) };
  }
  if (plan.ids.length === 0) return;

  const queue = plan.ids.map((id) => all.find((m) => m.id === id)!);
  const repaired = new Set<string>();
  const relit = new Set<string>(), seen = new Set<string>();
  const started = performance.now();
  while (queue.length) {
    if (performance.now() - started > SESSION_CAP_MS) {
      await stage.say('Your memory needs time to settle. See you tomorrow.', 'That’s enough for today');
      break;
    }
    const m = queue.shift()!;
    await palace.focus(m.slot);
    const hit = await recallOne(ctx, m, all);
    seen.add(m.id);
    if (hit) relit.add(m.id);
    else if (!repaired.has(m.id)) {
      // Repair: ask again two items later, once.
      repaired.add(m.id);
      queue.splice(Math.min(2, queue.length), 0, m);
    }
    store.data.streak = recordRecall(store.data.streak, dayKey(store.now()));
    store.save();
  }

  const today = dayKey(store.now());
  const wasBroken = !!store.data.streak.broken;
  if (queue.length === 0) store.data.streak = recordFullSession(store.data.streak, today);
  store.save();
  const s = store.data.streak;
  const tomorrow = store.now() + DAY;
  const dimming = all.filter((m) => store.recall(m, tomorrow) < DESIRED_RETENTION).length;
  const repairNote = wasBroken && !s.broken ? ' Streak repaired!' : canRepair(s, today) ? ' One more session today repairs your streak.' : '';
  await stage.say(
    `Relit ${relit.size} of ${seen.size}. Ember streak: ${s.count} ${s.count === 1 ? 'day' : 'days'}, ${s.freezes} of 3 freezes banked.${repairNote} ${dimming ? `${dimming} ${dimming === 1 ? 'lantern' : 'lanterns'} will dim overnight.` : 'All lanterns hold overnight.'}`,
    'Session complete',
  );
  for (const m of all) palace.alcoves[m.slot].setRecall(store.recall(m));
}

export function arrivalMessage(store: Store, missedDays: number): { title: string; body: string; due: number } {
  const plan = dueSummary(store, missedDays);
  const n = plan.ids.length;
  if (plan.comeback) return { title: 'Welcome back', body: "Let's walk through the ones that matter most. No pile, no count.", due: n };
  if (n === 0) {
    const next = Math.min(...store.data.memories.map((m) => store.due(m)));
    const mins = Math.max(1, Math.round((next - store.now()) / 60_000));
    const hours = Math.round(mins / 60);
    const when = mins < 60 ? `${mins} ${mins === 1 ? 'minute' : 'minutes'}`
      : hours < 36 ? `${hours} ${hours === 1 ? 'hour' : 'hours'}` : `${Math.round(hours / 24)} days`;
    return { title: 'All lanterns lit', body: `The next one starts to fade in about ${when}.`, due: 0 };
  }
  const min = Math.max(1, Math.round(plan.estimatedSec / 60));
  return { title: `${n} fading`, body: `About ${min} ${min === 1 ? 'minute' : 'minutes'} to relight them.`, due: n };
}
