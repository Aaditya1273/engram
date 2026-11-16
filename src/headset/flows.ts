import { answerMatches } from '../core/answer';
import { enrol, match } from '../core/gesture';
import { gradeRecall } from '../core/grade';
import { DESIRED_RETENTION } from '../core/model';
import { canRepair, dayKey, daysBetween, rollover } from '../core/streak';
import { planSession } from '../core/triage';
import { applyTwist, isEmptyTwist, parseTwist } from '../core/twist';
import { JA_STARTER } from '../shared/deck-ja';
import type { DeckItem, GestureSignature, InboxItem, Memory, SceneSpec } from '../shared/types';
import { play } from './audio';
import type { Cloud } from './cloud';
import { SLOT_COUNT } from './palace';
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
  cloud: Cloud;
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
    stage.show('Your gesture', why);
    const again = await stage.ask([{ label: 'Try again', value: true }, { label: 'Skip gesture', value: false }]);
    if (!again) return undefined;
  }
  return undefined;
}

let twistSkips = 0;

/**
 * One personal twist, mapped onto the prop kit (keyword parser offline, Claude when online).
 * Guardrail: never let the AI finish the memory alone. After three skips in a row, ask one
 * personal question instead.
 */
async function addTwist({ stage, store, cloud }: Ctx, scene: SceneSpec): Promise<{ scene: SceneSpec; twist?: string }> {
  const personal = twistSkips >= 3;
  const prompt = personal
    ? 'Quick question instead: who or what does this remind you of? Say a colour or a thing they would wear.'
    : 'Make it yours. Say one personal detail, like "give it my red hat" or "add glasses".';
  await stage.say(prompt, personal ? 'Make it personal' : 'Add a twist');
  let text = '';
  if (speechAvailable()) {
    stage.show('Add a twist', 'Listening…');
    text = (await listen(store.data.settings.twistLang, 6000).result)[0] ?? '';
  }
  let twist = text ? await cloud.twist(text, parseTwist(text)) : parseTwist('');
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
  if (isEmptyTwist(twist)) {
    twistSkips++;
    return { scene };
  }
  twistSkips = 0;
  play('light');
  return { scene: applyTwist(scene, twist), twist: text };
}

function placeMemory(
  ctx: Ctx, item: DeckItem, scene: SceneSpec, slot: number, gesture?: GestureSignature, twist?: string,
  where: { topic: string; goalId?: string } = { topic: 'Japanese starter' },
): Memory {
  const { store, palace } = ctx;
  const now = store.now();
  const m: Memory = {
    id: item.id, cue: item.cue, question: item.question, lang: item.lang, answers: item.answers, display: item.display,
    mnemonic: scene.mnemonic, scene, twist, gesture, topic: where.topic, goalId: where.goalId,
    goalWeight: where.goalId ? 1.5 : 1, slot, createdAt: now,
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
  const prompt = m.question;
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
      const l = listen(m.lang ?? store.data.settings.answerLang, 6000);
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
  store.streakSession(dayKey(store.now()));
  store.data.onboarded = true;
  store.save();
  void ctx.cloud.sync();
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
  const deadlines = new Map(store.data.cloud.goals.map((g) => [g.id, new Date(`${g.deadline}T12:00:00`).getTime()]));
  const items = store.data.memories.map((m) => ({
    id: m.id, r: store.recall(m, now), due: store.due(m), goalWeight: m.goalWeight, deadline: m.goalId ? deadlines.get(m.goalId) : undefined,
  }));
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
    store.streakRecall(dayKey(store.now()));
  }

  const today = dayKey(store.now());
  const wasBroken = !!store.data.streak.broken;
  if (queue.length === 0) store.streakSession(today);
  void ctx.cloud.sync();
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

// ---------------------------------------------------------------- inbox: co-create captured items

/** Up to three new memories per round, each co-created: pick a scene, add a twist, invent a gesture. */
export async function inboxFlow(ctx: Ctx, items: InboxItem[]) {
  try {
    await coCreate(ctx, items);
  } finally {
    // Whatever path ended the round (done, "Later", palace full), new memories go up now.
    void ctx.cloud.sync();
  }
}

async function coCreate(ctx: Ctx, items: InboxItem[]) {
  const { stage, palace, store, cloud } = ctx;
  for (const entry of items.slice(0, 3)) {
    const slot = store.nextFreeSlot();
    if (slot >= SLOT_COUNT) {
      await stage.say('Your palace is full for now. New wings arrive in a later version.', 'Palace full');
      return;
    }
    const it = entry.item;
    await palace.focus(slot);
    const from = entry.source === 'agent' ? 'An agent sent this' : entry.source === 'voice' ? 'You captured this' : 'From your phone';
    stage.show(`${entry.topic} · ${from}`, `${it.question}\n${it.display}`);
    const action = await stage.ask([
      { label: 'Make it a memory', value: 'make' as const },
      { label: 'Discard', value: 'discard' as const },
      { label: 'Later', value: 'later' as const },
    ]);
    if (action === 'later') return;
    if (action === 'discard') {
      await cloud.discard(entry.id);
      continue;
    }
    await stage.say(`${it.question} ${it.display}. Pick the scene that sticks for you.`, it.cue);
    let scene = it.scenes[await stage.chooseScene(it)];
    palace.alcoves[slot].setScene(scene);
    await stage.say(scene.mnemonic, it.cue);
    let twist: string | undefined;
    ({ scene, twist } = await addTwist(ctx, scene));
    palace.alcoves[slot].setScene(scene);
    const gesture = await enrolGesture(ctx, it.gestureHint);
    placeMemory(ctx, it, scene, slot, gesture, twist, { topic: entry.topic, goalId: entry.goalId });
    await cloud.markPlaced(entry.id);
  }
}

// ---------------------------------------------------------------- capture: "remember this"

export async function captureFlow(ctx: Ctx) {
  const { stage, store, cloud } = ctx;
  if (!speechAvailable()) {
    await stage.say('Voice capture needs speech recognition. Connect your phone in Settings and type it there instead.', 'Remember this');
    return;
  }
  for (;;) {
    await stage.say('What do you need to remember? Say it now: a word list, a fact, anything.', 'Remember this');
    stage.show('Remember this', 'Listening…');
    const heard = (await listen(store.data.settings.twistLang, 15_000).result)[0]?.trim() ?? '';
    if (!heard) {
      const retry = await stage.ask([{ label: 'Try again', value: true }, { label: 'Cancel', value: false }]);
      if (!retry) return;
      continue;
    }
    stage.show('I heard', `"${heard}"`);
    const pick = await stage.ask([
      { label: 'Send', value: 'send' as const },
      { label: 'Try again', value: 'again' as const },
      { label: 'Cancel', value: 'cancel' as const },
    ]);
    if (pick === 'cancel') return;
    if (pick === 'again') continue;
    stage.show('Remember this', cloud.ai ? 'Drafting scenes…' : 'Sending…');
    try {
      const r = await cloud.capture(heard);
      play('light');
      await stage.say(
        r.count ? `${r.count} ${r.count === 1 ? 'item is' : 'items are'} waiting in your inbox.` : "I couldn't find a fact in that. Try \"word, dash, meaning\".",
        'Captured',
      );
    } catch {
      await stage.say("I can't reach the Atrium cloud right now. Nothing was lost: try again when you're online.", 'Offline');
    }
    return;
  }
}

// ---------------------------------------------------------------- pair the phone companion

export async function pairFlow(ctx: Ctx, showQr: (url: string, code: string) => () => void) {
  const { stage, cloud } = ctx;
  if (!(await cloud.connect())) {
    await stage.say("I can't reach the Atrium cloud, so pairing isn't possible right now.", 'Connect phone');
    return;
  }
  try {
    const { url, code } = await cloud.pair();
    const hide = showQr(url, code);
    stage.show(`Code: ${code}`, `On your phone, open ${new URL(url).host}/companion.html and enter the code. Valid for 10 minutes.`);
    await stage.ask([{ label: 'Done', value: true }]);
    hide();
  } catch {
    await stage.say('Pairing failed. Please try again.', 'Connect phone');
  }
}

/** One line per goal for the home screen: the honest forecast, from the same FSRS model. */
export function readinessLines(store: Store): string[] {
  const now = store.now();
  return store.data.cloud.goals.map((g) => {
    const mine = store.data.memories.filter((m) => m.goalId === g.id);
    if (!mine.length) return `${g.name}: no memories yet`;
    const at = Math.max(now, new Date(`${g.deadline}T12:00:00`).getTime());
    const r = mine.reduce((s, m) => s + store.recall(m, at), 0) / mine.length;
    return `${g.name}: ${Math.round(r * 100)}% on ${g.deadline} if you stop today`;
  });
}

// ---------------------------------------------------------------- wind-down

/** Low light, slow narration, no grading: walk through today's new memories before bed. */
export async function windDown(ctx: Ctx) {
  const { stage, palace, store } = ctx;
  const today = dayKey(store.now());
  const fresh = store.data.memories.filter((m) => dayKey(m.createdAt) === today);
  const walk = fresh.length ? fresh : [...store.data.memories].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
  if (!walk.length) return;
  palace.setWarmth(0.25, 2500);
  await stage.say(fresh.length ? "A quiet walk through today's new memories." : 'A quiet walk through your newest memories.', 'Wind-down');
  for (const m of walk) {
    await palace.focus(m.slot);
    await stage.say(`${m.question} ${m.display}. ${m.mnemonic}`, `${m.display} · ${m.cue}`);
    await stage.sleep(1200);
  }
  await stage.say('Sleep helps memories settle. Good night.', 'Wind-down');
  palace.setWarmth(1, 2500);
}
