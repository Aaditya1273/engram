import { answerMatches } from '../core/answer';
import { enrol, match } from '../core/gesture';
import { gradeRecall } from '../core/grade';
import { DESIRED_RETENTION } from '../core/model';
import { canRepair, dayKey, daysBetween, rollover } from '../core/streak';
import { planSession } from '../core/triage';
import { applyTwist, isEmptyTwist, parseTwist } from '../core/twist';
import { isLandmark, journeyStops, namedInOrder, recallOrder, rehearsalReport, stopPrompt, type RecallMode } from '../core/journey';
import { ELEMENTS, ELEMENTS_JOURNEY } from '../shared/deck-elements';
import { RARITY_RANK, rarityOf, type Rarity } from '../core/rarity';
import { JA_STARTER } from '../shared/deck-ja';
import type { DeckItem, GestureSignature, InboxItem, Memory, SceneSpec } from '../shared/types';
import { play } from './audio';
import type { Cloud } from './cloud';
import { Palace } from './palace';
import type { Input } from './input';
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
 * One personal twist, mapped onto the prop kit (keyword parser offline, the AI model when online).
 * Guardrail: never let the AI finish the memory alone. After three skips in a row, ask one
 * personal question instead.
 */
async function addTwist({ stage, store, cloud, input }: Ctx, scene: SceneSpec): Promise<{ scene: SceneSpec; twist?: string }> {
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
  let spoken = text;
  let twist = text ? await cloud.twist(text, parseTwist(text)) : parseTwist('');
  // Anything at all can become a 3D object, even with no matching prop: a gold star holds its place meanwhile.
  const anyObject = (t: string) => (isEmptyTwist(twist) && t && cloud.lux3d && cloud.online ? { add: ['star' as const] } : twist);
  twist = anyObject(spoken);
  if (isEmptyTwist(twist)) {
    if (text) stage.show('Add a twist', `I heard "${text}". Pick one instead:`);
    const TYPE = '\u0000type';
    // On a computer, typing your own detail is the quickest way to the personal 3D object.
    const canType = !input.xr && cloud.lux3d;
    text = await stage.ask([
      ...(canType ? [{ label: 'Type my own', value: TYPE }] : []),
      { label: 'Red hat', value: 'red hat' },
      { label: 'Glasses', value: 'glasses' },
      { label: 'Make it gold', value: 'gold' },
      { label: 'Skip', value: '' },
    ]);
    spoken = '';
    if (text === TYPE) {
      stage.show('Add a twist', 'Type one personal detail, then press Enter. For example: my grandmother\'s round glasses.');
      text = spoken = await stage.typeText('my grandmother\'s round glasses');
      twist = text ? await cloud.twist(text, parseTwist(text)) : parseTwist('');
      twist = anyObject(spoken);
    } else twist = parseTwist(text);
  }
  if (isEmptyTwist(twist)) {
    twistSkips++;
    return { scene };
  }
  twistSkips = 0;
  play('light');
  let out = applyTwist(scene, twist);
  // Words the learner chose (not a preset button) become their own 3D object; the painting stands in meanwhile.
  if (spoken && out.props.length > scene.props.length) {
    const id = await cloud.requestModel(spoken);
    // The object carries the words now; a colour read from the same words would just repaint the scene.
    if (id && twist.color) out = applyTwist(scene, { ...twist, color: undefined });
    const added = out.props[scene.props.length];
    if (id) {
      added.model = { id };
      await stage.say('Making it in 3D. It will appear on the pedestal in a few minutes; a placeholder holds its spot.', 'Add a twist');
    }
  }
  return { scene: out, twist: text };
}

const MODEL_POLL_MS = 6000;
const watching = new Set<string>();

/**
 * Polls this memory's pending twist-to-3D objects; when one is ready, it swaps in on the pedestal with a
 * burst. Survives reloads: the pending id is saved on the prop, and the app calls this again at start.
 */
export function watchModels(ctx: Ctx, m: Memory) {
  for (const p of m.scene.props) {
    const job = p.model;
    if (!job || job.ready || watching.has(job.id)) continue;
    watching.add(job.id);
    void (async () => {
      for (let i = 0; i < 250; i++) {
        await new Promise((r) => setTimeout(r, MODEL_POLL_MS));
        const s = await ctx.cloud.modelStatus(job.id);
        if (s === 'generating' || s === 'optimising' || s === 'unknown') continue;
        if (s === 'ready') job.ready = true;
        else delete p.model; // failed: the painting stays, for good
        ctx.store.touch(m);
        showMemory(ctx, m);
        if (s === 'ready' && Palace.wingOf(m.slot) === ctx.palace.wing) {
          ctx.palace.alcove(m.slot).burst();
          play('light');
        }
        break;
      }
      watching.delete(job.id);
    })();
  }
}

function placeMemory(
  ctx: Ctx, item: DeckItem, scene: SceneSpec, slot: number, gesture?: GestureSignature, twist?: string,
  where: { topic: string; goalId?: string; journey?: Memory['journey'] } = { topic: 'Japanese starter' },
): Memory {
  const { store, palace } = ctx;
  const now = store.now();
  const m: Memory = {
    id: item.id, cue: item.cue, question: item.question, lang: item.lang, answers: item.answers, display: item.display,
    mnemonic: scene.mnemonic, scene, twist, gesture, topic: where.topic, goalId: where.goalId,
    goalWeight: where.goalId ? 1.5 : 1, slot, createdAt: now, ...(where.journey ? { journey: where.journey } : {}),
  };
  store.addMemory(m);
  watchModels(ctx, m);
  // Encoding counts as the first successful study; FSRS then schedules the learning steps.
  store.addReview({ memoryId: m.id, at: now, grade: 'good', answerOk: true, gestureScore: null, latencyMs: 0 });
  const a = palace.alcove(slot);
  a.setScene(scene);
  a.setLabel(labelOf(m));
  a.setLandmark(m.journey && isLandmark(m.journey.index) ? m.journey.index + 1 : null);
  a.setRecall(store.recall(m));
  a.burst();
  play('light');
  return m;
}

/** The pedestal plaque: a journey stop shows its number, anything else its word and meaning. */
export const labelOf = (m: Memory) => (m.journey ? `${m.journey.index + 1} · ${m.display}` : `${m.display} · ${m.cue}`);

export function showMemory(ctx: Ctx, m: Memory) {
  if (Palace.wingOf(m.slot) !== ctx.palace.wing || ctx.palace.borrowed) return;
  const a = ctx.palace.alcove(m.slot);
  // The palace blooms with what you keep: a mastered memory stands in its earned finish (bronze, silver, gold),
  // while a fading one loses its colour (the lantern does the rest).
  a.setScene(m.scene, { finish: rarityFor(ctx.store, m) ?? undefined });
  a.setLabel(labelOf(m));
  a.setLandmark(m.journey && isLandmark(m.journey.index) ? m.journey.index + 1 : null);
  a.setRecall(ctx.store.recall(m), true);
}

/**
 * Graded recall: say the answer and perform the gesture; Atrium checks both. No self-rating.
 * Without speech, three pinchable answers replace the spoken one (still graded, never self-rated).
 */
export async function recallOne(ctx: Ctx, m: Memory, others: Memory[], opts: { prompt?: string } = {}): Promise<boolean> {
  const { stage, palace, input, store } = ctx;
  await stage.whilePaused();
  const alcove = palace.alcove(m.slot);
  alcove.setVeiled(true);
  const doGesture = !!m.gesture && input.canGesture && m.gesture.modality === input.modality;
  const prompt = opts.prompt ?? m.question;
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
  alcove.setLabel(labelOf(m));
  alcove.setRecall(store.recall(m));

  if (answerOk) {
    alcove.burst();
    play('relight');
    const note = gesture === null ? '' : gesture.ok ? ' Gesture matched.' : " Gesture didn't quite match, but it still counts.";
    await stage.say(`Yes, ${m.display}.${note}`, '✦ Relit');
  } else {
    play('miss');
    await stage.say(`It was ${m.display}. ${m.mnemonic}`, `${m.display} · ${m.cue}`, 'attention');
    await strengthenLeech(ctx, m);
  }
  return answerOk;
}

/** Misses after which a memory counts as a leech and earns a new, stranger object. */
const LEECH_MISSES = 3;

/**
 * A memory missed again and again gets a bolder image, made by the learner: they name something strange
 * that belongs with it, and it's generated in 3D beside the scene. Effort goes where memory actually fails,
 * and the learner, not the AI, supplies the idea (self-made mnemonics stick better). Offered once per memory.
 */
async function strengthenLeech(ctx: Ctx, m: Memory) {
  const { stage, store, cloud, input } = ctx;
  if (!cloud.online || !cloud.lux3d || m.scene.props.some((p) => p.model)) return;
  const misses = store.data.reviews.filter((r) => r.memoryId === m.id && !r.answerOk).length;
  if (misses < LEECH_MISSES) return;
  const title = 'Make it stranger';
  await stage.say(`${m.display} keeps slipping away. Name something strange that belongs with it, and I'll build it in 3D.`, title);
  let text = '';
  if (speechAvailable()) {
    stage.show(title, 'Listening… for example: a giant golden fish.');
    text = (await listen(store.data.settings.twistLang, 7000).result)[0]?.trim() ?? '';
  }
  if (!text) {
    const choice = await stage.ask([...(input.xr ? [] : [{ label: 'Type it', value: 'type' }]), { label: 'Not now', value: '' }]);
    if (choice === 'type') {
      stage.show(title, 'Type something strange that belongs with it, then press Enter.');
      text = await stage.typeText('a giant golden fish');
    }
  }
  if (!text) return;
  const id = await cloud.requestModel(text);
  if (!id) return;
  m.scene = { ...m.scene, props: [...m.scene.props, { prop: 'star', pos: [0.1, 0, 0.06], scale: 0.6, model: { id } }] };
  m.twist = m.twist ? `${m.twist}; ${text}` : text;
  store.touch(m);
  showMemory(ctx, m);
  watchModels(ctx, m);
  await stage.say('Building it now. It will appear beside the scene in a minute or two.', title);
}

// ---------------------------------------------------------------- the first five minutes

// ---------------------------------------------------------------- journeys

const ordinal = (n: number) => ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'][n - 1] ?? `Number ${n}`;

/**
 * A short walk along the empty path before it is filled: a briefly explored space holds new memories as well
 * as a familiar one, and the gold medallions give the path its landmarks.
 */
async function explorationWalk(ctx: Ctx, startSlot: number, n: number) {
  const { stage, palace } = ctx;
  for (let i = 0; i < n; i++) if (isLandmark(i)) palace.alcove(startSlot + i).setLandmark(i + 1);
  await stage.say(`This is your path: ${n} pedestals, in order. A gold medallion marks every fifth one.`, 'Your path');
  for (let i = 2; i < n; i += 2) {
    await palace.focus(startSlot + i);
    await stage.sleep(350);
  }
  await palace.focus(startSlot);
}

/**
 * Walks the path placing one memory per stop: its scene, its keyword story, then the line that carries you to
 * the next stop. The learner moves on when ready.
 */
export async function encodeJourney(
  ctx: Ctx, items: DeckItem[], startSlot: number, journey: { id: string; name: string },
  where: { topic?: string; goalId?: string } = {},
): Promise<Memory[]> {
  const { stage, palace } = ctx;
  const placed: Memory[] = [];
  for (const [i, item] of items.entries()) {
    const slot = startSlot + i;
    await palace.focus(slot);
    const scene = item.scenes[0];
    palace.alcove(slot).setScene(scene);
    const title = `${i + 1} · ${item.display}`;
    if (item.room && item.room !== items[i - 1]?.room) await stage.say(`Room: ${item.room}.`, item.room);
    await stage.say(`${ordinal(i + 1)}: ${item.display}. ${scene.mnemonic}`, title);
    placed.push(placeMemory(ctx, item, scene, slot, undefined, undefined, {
      topic: where.topic ?? journey.name, goalId: where.goalId, journey: { ...journey, index: i, link: item.link || undefined },
    }));
    if (item.link) await stage.say(item.link, title);
    await stage.ask([{ label: i < items.length - 1 ? 'Next stop' : 'Done', value: true }]);
  }
  return placed;
}

/**
 * Graded recall along a journey: forwards or backwards walks the path stop by stop, position jumps ("what's
 * number 7?") without walking there first. Every stop is veiled until it's answered, so nothing gives the
 * answer away. Every answer is an FSRS review. Returns how many were right.
 */
export async function journeyRecall(ctx: Ctx, stops: Memory[], mode: RecallMode, count = 3): Promise<number> {
  const { palace } = ctx;
  for (const m of stops) palace.alcove(m.slot).setVeiled(true);
  let right = 0;
  for (const i of recallOrder(stops.length, mode, count)) {
    const m = stops[i];
    if (mode !== 'position') await palace.focus(m.slot);
    if (await recallOne(ctx, m, stops, { prompt: stopPrompt(mode, i, stops.length) })) right++;
    if (mode === 'position') await palace.focus(m.slot);
  }
  for (const m of stops) palace.alcove(m.slot).setVeiled(false);
  return right;
}

/**
 * Rehearsal, for a talk or a procedure walked as a journey: speak it through without looking, then hear which
 * points you covered, which you skipped, and how many came in order. Up to 90 seconds.
 */
async function rehearse(ctx: Ctx, stops: Memory[]) {
  const { stage, palace, store } = ctx;
  const name = stops[0].journey!.name;
  for (const m of stops) palace.alcove(m.slot).setVeiled(true);
  await stage.say('Say it all the way through, in your own words, as if you were giving it. Pause for a few seconds when you are done.', 'Rehearse');
  stage.show('Rehearse', 'Listening… take your time.');
  const l = listen(store.data.settings.answerLang, 90_000, { long: true });
  stage.offer([{ label: "I'm done", onSelect: () => l.stop() }]);
  const said = (await l.result).join(' ');
  stage.clearRow();
  for (const m of stops) palace.alcove(m.slot).setVeiled(false);
  const r = rehearsalReport(said, stops.map((m) => m.display));
  if (!said.trim()) return void (await stage.say("I didn't hear anything. Try again when you're ready.", 'Rehearse'));
  const missed = r.missed.map((i) => `${i + 1}, ${stops[i].display}`);
  await stage.say(
    `You covered ${r.covered.length} of ${stops.length} points, ${r.inOrder} in order.${missed.length ? ` You skipped: ${missed.slice(0, 3).join('; ')}${missed.length > 3 ? ', and more' : ''}.` : ' Nothing skipped.'}`,
    `${r.covered.length} of ${stops.length} · ${name}`,
  );
  for (const i of r.missed.slice(0, 3)) {
    await palace.focus(stops[i].slot);
    await stage.say(`${i + 1}: ${stops[i].display}. ${stops[i].mnemonic}`, `${i + 1} · ${stops[i].display}`);
  }
}

/**
 * Lumen's quiz: your weakest few memories (lowest recall, most misses), each asked a fresh way, graded like any
 * recall. Lumen says what it has noticed first, so the learner knows why these.
 */
export async function quizMe(ctx: Ctx) {
  const { stage, store, palace, cloud } = ctx;
  const misses = (id: string) => store.data.reviews.filter((r) => r.memoryId === id && !r.answerOk).length;
  const weakest = [...store.data.memories].sort((a, b) => store.recall(a) - misses(a.id) * 0.1 - (store.recall(b) - misses(b.id) * 0.1)).slice(0, 5);
  if (!weakest.length) return void (await stage.say('Nothing to quiz yet. Build a palace first.', 'Lumen'));
  const slipping = weakest.filter((m) => misses(m.id) > 0).slice(0, 2).map((m) => m.display);
  stage.show('Lumen', 'Thinking of good questions…');
  const fresh = new Map((await cloud.quiz(weakest.map((m) => ({ id: m.id, question: m.question, answer: m.display, cue: m.cue })))).map((q) => [q.id, q.prompt]));
  await stage.say(`${slipping.length ? `I've noticed ${slipping.join(' and ')} keep slipping.` : "Let's test the faintest few."} ${weakest.length} questions, asked a new way.`, 'Lumen');
  let right = 0;
  for (const m of weakest) {
    await palace.focus(m.slot);
    if (await recallOne(ctx, m, store.data.memories, { prompt: fresh.get(m.id) ?? m.question })) right++;
  }
  void cloud.sync();
  await stage.say(`${right} of ${weakest.length}. ${right === weakest.length ? 'Nothing slipped today.' : "I'll bring the misses back soon."}`, 'Lumen');
}

// ---------------------------------------------------------------- collection

/** A memory's rarity from its FSRS card and review log (null: not mastered yet). */
export function rarityFor(store: Store, m: Memory): Rarity | null {
  const now = store.now();
  const first = store.data.reviews.reduce((t, r) => (r.memoryId === m.id ? Math.min(t, r.at) : t), Infinity);
  return rarityOf({ stabilityDays: store.card(m).stability, recall: store.recall(m, now), firstReviewAt: first, now });
}

export function collectibles(store: Store): { m: Memory; rarity: Rarity }[] {
  return store.data.memories.flatMap((m) => {
    const rarity = rarityFor(store, m);
    return rarity ? [{ m, rarity }] : [];
  }).sort((a, b) => RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity]);
}

const FINISH_NAME: Record<Rarity, string> = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' };

/**
 * The collection: mastered memories on show in their finish (gold models and silver models re-materialed with
 * Aholo Lux3D material transfer). With nothing mastered yet, a preview of what your newest memory earns.
 * The wing is borrowed for the viewing and refilled after.
 */
export async function collectionFlow(ctx: Ctx) {
  const { stage, palace, store } = ctx;
  const items = collectibles(store);
  const base = palace.wing * 20;
  palace.borrowed = true;
  try {
    if (items.length) {
      const shown = items.slice(0, 10);
      shown.forEach(({ m, rarity }, i) => {
        const a = palace.alcove(base + i);
        a.setScene(m.scene, { finish: rarity });
        a.setLabel(`${FINISH_NAME[rarity]} · ${m.display}`);
        a.setRecall(1, true);
      });
      await palace.focus(base + Math.min(2, shown.length - 1));
      const counts = (['gold', 'silver', 'bronze'] as Rarity[]).map((r) => [r, items.filter((x) => x.rarity === r).length] as const).filter(([, n]) => n);
      await stage.say(`Your collection: ${counts.map(([r, n]) => `${n} ${r}`).join(', ')}. Bronze when mastered, silver at thirty days kept, gold at ninety.`, 'Collection');
    } else {
      const m = [...store.data.memories].sort((a, b) => b.createdAt - a.createdAt)[0];
      if (!m) return void (await stage.say('Your collection fills as memories are mastered. Build a palace first.', 'Collection'));
      (['bronze', 'silver', 'gold'] as Rarity[]).forEach((r, i) => {
        const a = palace.alcove(base + i);
        a.setScene(m.scene, { finish: r });
        a.setLabel(`${FINISH_NAME[r]} · ${['mastered', '30 days', '90 days'][i]}`);
        a.setRecall(1, true);
      });
      await palace.focus(base + 1);
      await stage.say(`Nothing mastered yet. This is what ${m.display} becomes: bronze once you've mastered it, silver after thirty days, gold after ninety.`, 'Collection');
    }
    await stage.ask([{ label: 'Back to the palace', value: true }]);
  } finally {
    palace.borrowed = false;
    palace.onWing(palace.wing);
  }
}

/** Walk one of your journeys again: pick it, then the direction. */
export async function walkJourney(ctx: Ctx, id: string) {
  const { stage, store } = ctx;
  const stops = journeyStops(store.data.memories, id);
  if (!stops.length) return;
  const name = stops[0].journey!.name;
  stage.show(name, `${stops.length} stops. How do you want to walk it?`);
  const mode = await stage.ask<RecallMode | 'rehearse' | null>([
    { label: 'Forwards', value: 'forwards' },
    { label: 'Backwards', value: 'backwards' },
    { label: 'By number', value: 'position' },
    ...(speechAvailable() ? [{ label: 'Rehearse it', value: 'rehearse' as const }] : []),
    { label: 'Back', value: null },
  ]);
  if (!mode) return;
  if (mode === 'rehearse') return rehearse(ctx, stops);
  const right = await journeyRecall(ctx, stops, mode, Math.min(5, stops.length));
  const asked = mode === 'position' ? Math.min(5, stops.length) : stops.length;
  void ctx.cloud.sync();
  await stage.say(`${right} of ${asked}. ${right === asked ? 'Perfect.' : 'The ones you missed will come round again soon.'}`, name);
}

// ---------------------------------------------------------------- the first five minutes

/**
 * The first session ends with a feat: the first ten elements, in order, forwards, backwards, and "what's number 7?",
 * learned in a few minutes with the method memory champions use. No text tutorial, no menus before the feat,
 * fully offline, and every step works by voice, by pinch, or by gaze.
 */
export async function firstFive(ctx: Ctx) {
  const { stage, palace, store, input } = ctx;
  const pinch = pinchWord(input);
  const n = ELEMENTS.length;
  palace.setWarmth(0, 1);
  palace.alcove(0).setRecall(1, true);

  // 0:00 – a promise, one lantern, one pinch.
  stage.show('Atrium', `${pinch} the glowing lantern to light it.`);
  void stage.say(`Welcome. I'm Lumen. I'll show you how memory champions remember anything. ${input.xr ? 'Look at' : 'Point at'} the glowing lantern, and ${pinch.toLowerCase()} to light it.`, 'Lumen');
  await stage.waitAlcove(0);
  play('light');
  palace.setWarmth(1, 1600);
  palace.alcove(0).setRecall(null);

  // 0:20 – the gap: most people can't do this.
  await stage.say('Quick test first. Can you name the first ten chemical elements, in order? Try it now, out loud.', 'Quick test');
  let before: number;
  if (speechAvailable()) {
    stage.show('Quick test', 'Listening… say as many as you can, in order.');
    before = namedInOrder((await listen('en-US', 12_000).result).join(' '), ELEMENTS.map((e) => [e.display]));
  } else {
    before = await stage.ask([{ label: 'All ten', value: 10 }, { label: 'A few', value: 3 }, { label: 'Not really', value: 0 }]);
  }
  await stage.say(
    before >= n ? 'Impressive. Now watch how to make it permanent, and reversible.'
      : `${before ? `You got ${before} in order.` : "Most people can't."} In three minutes you'll know all ten, forwards and backwards.`,
    'Quick test',
  );

  // 0:45 – moving without standing.
  stage.showArrows(true);
  const flickHow = input.xr ? 'pinch and flick your hand sideways' : 'press an arrow key';
  await stage.say(`The room turns, so you never have to. To look around, ${flickHow}, or ${pinch.toLowerCase()} an arrow.`, 'Turning');
  await palace.snap(await stage.waitFlick());
  stage.showArrows(false);

  // 1:00 – walk the empty path, then fill it: one vivid scene per stop, each leading to the next.
  await explorationWalk(ctx, 0, n);
  const placed = await encodeJourney(ctx, ELEMENTS, 0, ELEMENTS_JOURNEY, { topic: 'Elements' });

  // 3:00 – the lights go down; the path stays.
  await palace.focus(4.5);
  palace.setWarmth(0.3, 900);
  await stage.say('Now the lights go down. The path is in your head. Walk it.', 'Recall');
  palace.setWarmth(1, 1600);

  // 3:10 – forwards, backwards, and a jump.
  const forwards = await journeyRecall(ctx, placed, 'forwards');
  await stage.say(`${forwards} of ${n} forwards. Now the hard part: backwards.`, 'Backwards');
  const backwards = await journeyRecall(ctx, placed, 'backwards');
  await palace.focus(4.5);
  await stage.say('Last one. No walking this time.', 'Jump');
  const seven = await recallOne(ctx, placed[6], placed, { prompt: "What's number 7?" });
  await palace.focus(placed[6].slot);

  // 4:20 – the payoff, and the real use.
  store.streakSession(dayKey(store.now()));
  store.data.onboarded = true;
  store.save();
  void ctx.cloud.sync();
  await stage.say(
    `You went from ${before} to ${forwards} forwards and ${backwards} backwards${seven ? ', and you jumped straight to nitrogen' : ''}. That's how memory champions do it. Tomorrow I'll check you again, for just a few minutes.`,
    `${forwards} forwards · ${backwards} backwards`,
  );
}

/** The original six Japanese words, kept as a language demo: choose a scene, add a twist, invent a gesture. */
export async function languageDemo(ctx: Ctx) {
  const { stage, palace, store } = ctx;
  const start = store.nextFreeSlot();
  const placed: Memory[] = [];
  for (const [i, item] of JA_STARTER.entries()) {
    if (store.data.memories.some((m) => m.id === item.id)) continue;
    const slot = start + placed.length;
    await palace.focus(slot);
    await stage.say(`${item.display} means ${item.cue}. Pick the scene that sticks for you.`, `${item.display} · ${item.cue}`);
    let scene = item.scenes[await stage.chooseScene(item)];
    palace.alcove(slot).setScene(scene);
    await stage.say(scene.mnemonic, `${item.display} · ${item.cue}`);
    let twist: string | undefined;
    if (i === 1) {
      ({ scene, twist } = await addTwist(ctx, scene));
      palace.alcove(slot).setScene(scene);
    }
    const gesture = await enrolGesture(ctx, item.gestureHint);
    placed.push(placeMemory(ctx, item, scene, slot, gesture, twist));
  }
  let score = 0;
  for (const m of shuffle(placed)) {
    await palace.focus(m.slot);
    if (await recallOne(ctx, m, placed)) score++;
  }
  void ctx.cloud.sync();
  if (placed.length) await stage.say(`You remembered ${score} of ${placed.length}.`, 'Japanese');
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
  for (const m of all) if (Palace.wingOf(m.slot) === palace.wing) palace.alcove(m.slot).setRecall(store.recall(m));
}

export function arrivalMessage(store: Store, missedDays: number): { title: string; body: string; due: number } {
  const plan = dueSummary(store, missedDays);
  const n = plan.ids.length;
  if (plan.comeback) return { title: 'Welcome back', body: "Let's walk through the ones that matter most. No pile, no count.", due: n };
  if (store.data.memories.length === 0) return { title: 'An empty palace', body: 'Build a palace from anything you need to remember, or walk a journey.', due: 0 };
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
    // Journeys first, whole and in order; then single items.
    const groups = new Map<string, InboxItem[]>();
    for (const e of items) if (e.item.journey) groups.set(e.item.journey.id, [...(groups.get(e.item.journey.id) ?? []), e]);
    for (const group of groups.values()) if (!(await placeJourney(ctx, group.sort((a, b) => a.item.journey!.index - b.item.journey!.index)))) return;
    await coCreate(ctx, items.filter((e) => !e.item.journey));
  } finally {
    // Whatever path ended the round (done, "Later", palace full), new memories go up now.
    void ctx.cloud.sync();
  }
}

/**
 * A journey from the World Builder: a free run of pedestals, a short walk along it, then each stop placed in
 * order with its scene and story link. Returns false if the learner chose "Later".
 */
async function placeJourney(ctx: Ctx, entries: InboxItem[]): Promise<boolean> {
  const { stage, palace, store, cloud } = ctx;
  const j = entries[0].item.journey!;
  const from = entries[0].source === 'agent' ? 'An agent built this' : 'Built from what you gave me';
  stage.show(`${j.name} · ${from}`, `${entries.length} stops: ${entries.slice(0, 4).map((e) => e.item.display).join(', ')}${entries.length > 4 ? '…' : ''}`);
  const action = await stage.ask([
    { label: 'Walk it in', value: 'make' as const },
    { label: 'Discard', value: 'discard' as const },
    { label: 'Later', value: 'later' as const },
  ]);
  if (action === 'later') return false;
  if (action === 'discard') {
    for (const e of entries) await cloud.discard(e.id);
    return true;
  }
  const start = store.freeRun(entries.length);
  await palace.focus(start);
  await explorationWalk(ctx, start, entries.length);
  const placed = await encodeJourney(ctx, entries.map((e) => e.item), start, { id: j.id, name: j.name }, { topic: j.name, goalId: entries[0].goalId });
  for (const e of entries) await cloud.markPlaced(e.id);
  stage.show(j.name, 'Walk it once now, while it is fresh?');
  if (await stage.ask([{ label: 'Walk it', value: true }, { label: 'Later', value: false }])) {
    const right = await journeyRecall(ctx, placed, 'forwards');
    await stage.say(`${right} of ${placed.length}, first time through.`, j.name);
  }
  return true;
}

async function coCreate(ctx: Ctx, items: InboxItem[]) {
  const { stage, palace, store, cloud } = ctx;
  for (const entry of items.slice(0, 3)) {
    const slot = store.nextFreeSlot();
    const it = entry.item;
    const opensWing = Palace.wingOf(slot) > 0 && !store.data.memories.some((m) => Palace.wingOf(m.slot) === Palace.wingOf(slot));
    await palace.focus(slot);
    if (opensWing) {
      play('relight');
      await stage.say(`A new wing opens: wing ${Palace.wingOf(slot) + 1}. Your palace grows with you.`, 'New wing');
    }
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
    palace.alcove(slot).setScene(scene);
    await stage.say(scene.mnemonic, it.cue);
    let twist: string | undefined;
    ({ scene, twist } = await addTwist(ctx, scene));
    palace.alcove(slot).setScene(scene);
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
