import { describe, expect, it } from 'vitest';
import { enrol, match, resample, dtw } from '../src/core/gesture';
import { gradeRecall } from '../src/core/grade';
import { planSession } from '../src/core/triage';
import { newStreak, rollover, recordRecall, recordFullSession, addDays, unlockedThemes, milestoneAt, weeklyStreak } from '../src/core/streak';
import { challengeItems, dailyKey, scoreChallenge, WORDS } from '../src/core/challenge';
import { answerMatches } from '../src/core/answer';
import { parseTwist, applyTwist } from '../src/core/twist';
import { cardFrom, recallProbability } from '../src/core/model';
import { lanternLook } from '../src/core/lantern';
import { JA_STARTER } from '../src/shared/deck-ja';
import { PROP_IDS, pickVariant } from '../src/shared/props';
import { SCENE_ART_IDS } from '../src/shared/props-catalog';
import { migrate } from '../src/headset/store';
import { wrap } from '../src/headset/ui';
import { FrameGuard } from '../src/core/frame-guard';
import { freeRecallScore, planDay, programmeDay } from '../src/core/athlete';
import { rarityOf } from '../src/core/rarity';
import { beatMs, flightMs, musicLevel, nextPick, rushPoints, weekKey } from '../src/core/rush';
import { isLandmark, journeys, journeyStops, namedInOrder, recallOrder, rehearsalReport, stopPrompt } from '../src/core/journey';
import { ELEMENTS } from '../src/shared/deck-elements';
import { ENGLISH } from '../src/shared/deck-english';
import { bakeTemplate } from '../src/shared/props';
import * as THREE from 'three';
import { sceneFit } from '../src/headset/scene-builder';

// Deterministic noise so tests never flake.
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;

const path = (fn: (t: number) => [number, number], n = 60, noise = 0.03, warp = 1) =>
  Array.from({ length: n }, (_, i) => {
    const t = (i / (n - 1)) ** warp;
    const [x, y] = fn(t);
    return [x + rand() * noise, y + rand() * noise];
  });

const circle = (t: number): [number, number] => [Math.cos(t * 2 * Math.PI), Math.sin(t * 2 * Math.PI)];
const line = (t: number): [number, number] => [t * 2 - 1, 0];
const zigzag = (t: number): [number, number] => [t * 2 - 1, (Math.floor(t * 4) % 2 ? 1 : -1) * 0.8];

describe('gesture matcher', () => {
  const enrolled = enrol('pointer', path(circle), path(circle, 45));
  if (!enrolled.ok) throw new Error('enrolment failed');
  const sig = enrolled.signature;

  it('accepts the same gesture done slower, faster and noisier', () => {
    expect(match(sig, path(circle, 80, 0.06, 1.4), 'pointer')!.ok).toBe(true);
    expect(match(sig, path(circle, 30, 0.05, 0.7), 'pointer')!.ok).toBe(true);
  });

  it('ignores where the gesture starts', () => {
    const shifted = path(circle).map(([x, y]) => [x + 3, y - 2]);
    expect(match(sig, shifted, 'pointer')!.ok).toBe(true);
  });

  it('rejects different gestures', () => {
    expect(match(sig, path(line), 'pointer')!.ok).toBe(false);
    expect(match(sig, path(zigzag), 'pointer')!.ok).toBe(false);
  });

  it('rejects standing still and refuses cross-modality matches', () => {
    expect(match(sig, path(() => [0, 0], 60, 0), 'pointer')!.ok).toBe(false);
    expect(match(sig, path(circle), 'hands')).toBeNull();
  });

  it('flags still or inconsistent enrolments', () => {
    expect(enrol('pointer', path(() => [0, 0], 60, 0), path(circle))).toEqual({ ok: false, reason: 'still' });
    expect(enrol('pointer', path(circle), path(line))).toEqual({ ok: false, reason: 'inconsistent' });
  });

  it('keeps a tolerance floor when both takes are identical', () => {
    const p = path(circle, 60, 0);
    const r = enrol('pointer', p, p);
    expect(r.ok && r.signature.tolerance).toBeGreaterThan(0.1);
  });

  it('dtw is zero for identical sequences', () => {
    const a = resample(path(circle, 50, 0));
    expect(dtw(a, a)).toBe(0);
  });
});

describe('grading', () => {
  it('fails only on a wrong answer, and never grades a correct answer below hard', () => {
    expect(gradeRecall(false, { ok: true, score: 1 }, 1000)).toBe('again');
    expect(gradeRecall(true, { ok: true, score: 0.9 }, 2000)).toBe('good');
    expect(gradeRecall(true, { ok: false, score: 0.2 }, 2000)).toBe('hard');
    expect(gradeRecall(true, { ok: false, score: 0.2 }, 20000)).toBe('hard');
    expect(gradeRecall(true, null, 2000)).toBe('good');
  });
});

describe('FSRS model', () => {
  const t0 = Date.UTC(2026, 0, 1);
  const card = cardFrom([
    { id: 'a', memoryId: 'm', at: t0, grade: 'good', answerOk: true, gestureScore: null, latencyMs: 0 },
    { id: 'b', memoryId: 'm', at: t0 + 180_000, grade: 'good', answerOk: true, gestureScore: 1, latencyMs: 1500 },
  ], t0);

  it('decays smoothly within a day and passes the retention target at the due date', () => {
    const r1 = recallProbability(card, t0 + 3_600_000);
    const r2 = recallProbability(card, t0 + 12 * 3_600_000);
    expect(r1).toBeGreaterThan(r2);
    expect(r1).toBeLessThan(1);
    const atDue = recallProbability(card, new Date(card.due).getTime());
    expect(atDue).toBeGreaterThan(0.85);
    expect(atDue).toBeLessThan(0.95);
  });

  it('maps recall to lantern looks monotonically', () => {
    expect(lanternLook(0.99).intensity).toBe(1);
    expect(lanternLook(0.99).flicker).toBe(false);
    expect(lanternLook(0.8).flicker).toBe(true);
    expect(lanternLook(0.65).saturation).toBeLessThan(1);
    expect(lanternLook(0.7).intensity).toBeLessThan(lanternLook(0.85).intensity);
  });
});

describe('session triage', () => {
  const now = Date.UTC(2026, 5, 1);
  const items = Array.from({ length: 60 }, (_, i) => ({
    id: `m${i}`, r: 0.5 + i * 0.008, due: now + 86_400_000, goalWeight: 1,
  }));

  it('fills only the time budget, most-forgotten first', () => {
    const plan = planSession(items, now);
    expect(plan.ids.length).toBe(21);
    expect(plan.ids[0]).toBe('m0');
    expect(plan.overflow).toBeGreaterThan(0);
    expect(plan.estimatedSec).toBeLessThanOrEqual(7 * 60);
  });

  it('runs a comeback walk of 10 with no due count after 3 missed days', () => {
    const plan = planSession(items, now, { missedDays: 4 });
    expect(plan.ids.length).toBe(10);
    expect(plan.hideCount).toBe(true);
  });

  it('includes short learning steps that are due even at high recall', () => {
    const plan = planSession([{ id: 'x', r: 0.999, due: now - 1, goalWeight: 1 }], now);
    expect(plan.ids).toEqual(['x']);
  });

  it('weights goal deadlines', () => {
    const a = { id: 'a', r: 0.8, due: now, goalWeight: 1 };
    const b = { id: 'b', r: 0.8, due: now, goalWeight: 1, deadline: now + 2 * 86_400_000 };
    expect(planSession([a, b], now).ids[0]).toBe('b');
  });
});

describe('ember streak', () => {
  const d0 = '2026-03-01';
  it('counts consecutive days, spends freezes on missed days', () => {
    let s = recordFullSession(newStreak(), d0); // count 1, 1 freeze
    s = recordRecall(rollover(s, addDays(d0, 1)).state, addDays(d0, 1)); // count 2
    const r = rollover(s, addDays(d0, 3)); // missed 1 day, freeze covers it
    expect(r.missedDays).toBe(1);
    s = recordRecall(r.state, addDays(d0, 3));
    expect(s.count).toBe(3);
    expect(s.freezes).toBe(0);
  });

  it('breaks without freezes and repairs with a double session within the window', () => {
    let s = recordRecall(newStreak(), d0);
    s = recordRecall(rollover(s, addDays(d0, 1)).state, addDays(d0, 1)); // 2
    s = rollover(s, addDays(d0, 4)).state;
    expect(s.count).toBe(0);
    expect(s.broken?.count).toBe(2);
    const day = addDays(d0, 5);
    s = recordFullSession(s, day);
    s = recordFullSession(s, day);
    expect(s.broken).toBeNull();
    expect(s.count).toBe(3);
  });

  it('can repair for 48 hours after coming back, not longer', () => {
    const broken = (back: number) => {
      let s = recordRecall(newStreak(), d0);
      s = recordRecall(rollover(s, addDays(d0, 1)).state, addDays(d0, 1));
      return rollover(s, addDays(d0, back)).state; // broken on the day you come back
    };
    const late = (gap: number) => {
      const s = broken(4), day = addDays(d0, 4 + gap);
      return recordFullSession(recordFullSession(s, day), day);
    };
    expect(late(2).broken).toBeNull();
    expect(late(3).broken).not.toBeNull();
  });

  it('handles month boundaries', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });
});

describe('answer matching', () => {
  it('accepts kanji, kana, katakana and romaji, with one slip on long words', () => {
    expect(answerMatches(['猫'], JA_STARTER[0].answers)).toBe(true);
    expect(answerMatches(['ネコです'], JA_STARTER[0].answers)).toBe(true);
    expect(answerMatches(['Necko'], JA_STARTER[0].answers)).toBe(true);
    expect(answerMatches(['hon.'], JA_STARTER[4].answers)).toBe(true);
  });

  it('finds multi-word answers inside a sentence', () => {
    expect(answerMatches(["it's the vagus nerve"], ['vagus nerve'])).toBe(true);
    expect(answerMatches(['olfactori'], ['olfactory'])).toBe(true);
    expect(answerMatches(['optic nerve'], ['vagus nerve'])).toBe(false);
  });

  it('rejects wrong answers and slips on short words', () => {
    expect(answerMatches(['犬'], JA_STARTER[0].answers)).toBe(false);
    expect(answerMatches(['han'], JA_STARTER[4].answers)).toBe(false);
    expect(answerMatches([''], JA_STARTER[0].answers)).toBe(false);
  });
});

describe('twist + deck schema', () => {
  it('parses colours and props from speech', () => {
    expect(parseTwist('make the cat wear my grandmother\'s glasses')).toEqual({ add: ['cat', 'glasses'], color: undefined });
    expect(parseTwist('a red hat')).toEqual({ color: '#d94848', add: ['hat'] });
  });

  it('dresses the focus prop', () => {
    const scene = JA_STARTER[0].scenes[0];
    const out = applyTwist(scene, { color: '#ff0000', add: ['glasses'] });
    expect(out.props[scene.focus ?? 0].color).toBe('#ff0000');
    expect(out.props.at(-1)!.prop).toBe('glasses');
    expect(scene.props.length).toBe(out.props.length - 1); // original untouched
  });

  it('puts a plain hat on a dog by using the straw-hatted dog painting', () => {
    const scene = JA_STARTER[1].scenes[0];
    expect(applyTwist(scene, { add: ['hat'] }).props.map((p) => p.prop)).toEqual(['dog-hat']);
    expect(applyTwist(scene, { color: '#d94848', add: ['hat'] }).props.map((p) => p.prop)).toEqual(['dog', 'hat']);
  });

  it('every preset scene uses known props and a valid focus', () => {
    expect(JA_STARTER).toHaveLength(6);
    for (const item of JA_STARTER) {
      expect(item.scenes).toHaveLength(3);
      for (const s of item.scenes) {
        expect(s.mnemonic.length).toBeGreaterThan(5);
        for (const p of s.props) expect([...PROP_IDS, ...SCENE_ART_IDS]).toContain(p.prop);
        expect(s.props[s.focus ?? 0]).toBeDefined();
      }
    }
  });
});

describe('painted prop variants', () => {
  it('uses the closest painting, tints anything else, and falls back when there is no art', () => {
    expect(pickVariant('cat')).toEqual({ file: 'cat-orange', tint: null });
    expect(pickVariant('cat', '#444444')).toEqual({ file: 'cat-black', tint: null });
    expect(pickVariant('cat', '#f2f2f2')).toEqual({ file: 'cat-white', tint: null });
    expect(pickVariant('drop', '#e0a628')).toEqual({ file: 'drop-honey', tint: null });
    expect(pickVariant('umbrella', '#2f6fd1')).toEqual({ file: 'umbrella', tint: '#2f6fd1' });
    expect(pickVariant('person')).toBeNull();
  });
});

describe('scene fit', () => {
  it('scales every starter scene to the same box on the pedestal', () => {
    const big = { mnemonic: 'x', props: [{ prop: 'cat-hug' as const, pos: [0, 0, 0] as [number, number, number] }] };
    const small = { mnemonic: 'x', props: [{ prop: 'dog' as const, pos: [0.05, 0, 0] as [number, number, number], scale: 0.4 }] };
    // Same visual size (√(w·h)) after fitting, whatever the props' authored sizes.
    const size = (sc: typeof big | typeof small, p: { prop: 'cat-hug' | 'dog'; scale?: number }) => {
      const h = { 'cat-hug': 0.19, dog: 0.11 }[p.prop] * (p.scale ?? 1), a = { 'cat-hug': 0.7, dog: 1.12 }[p.prop];
      return Math.sqrt(h * h * a) * sceneFit(sc).scale;
    };
    expect(size(big, big.props[0])).toBeCloseTo(size(small, small.props[0]), 4);
    expect(sceneFit(small).scale).toBeGreaterThan(2); // a tiny prop grows to fill
    expect(sceneFit(small).dx).toBeCloseTo(-0.05, 5); // and is re-centred
  });
});

describe('save migration', () => {
  const save = (scene: unknown) => ({
    v: 1, memories: [{ id: 'ja-neko', cue: 'cat', question: 'q', lang: 'ja-JP', answers: ['neko'], display: 'neko', mnemonic: 'x', scene, slot: 0, createdAt: 0, topic: 't', goalWeight: 1 }],
    reviews: [], cloud: { cursor: 0, dirtyMemories: [], pendingReviews: [], streakEvents: [], goals: [] },
  }) as never as Parameters<typeof migrate>[0];

  it('rebuilds an outdated starter scene from the deck', () => {
    const old = { ...JA_STARTER[0].scenes[1], props: [{ prop: 'book', pos: [0, 0, 0] }, { prop: 'cat', pos: [0, 0.09, 0] }] };
    const d = migrate(save(old), true);
    expect(d.memories[0].scene.props.map((p) => p.prop)).toEqual(['cat-books']);
    expect(d.cloud.dirtyMemories).toEqual(['ja-neko']);
  });

  it('never touches a scene holding an object the learner generated', () => {
    const mine = { ...JA_STARTER[0].scenes[1], props: [...JA_STARTER[0].scenes[1].props, { prop: 'star', pos: [0.1, 0, 0.06], model: { id: 'm1', ready: true } }] };
    const d = migrate(save(mine), true);
    expect(d.memories[0].scene.props.at(-1)!.model).toEqual({ id: 'm1', ready: true });
    expect(d.cloud.dirtyMemories).toEqual([]);
  });
});

describe('frame guard', () => {
  const run = (g: FrameGuard, ms: number, dt: number, xr: boolean, t0 = 0) => {
    for (let t = t0; t < t0 + ms; t += dt) g.sample(dt, t, xr);
    return t0 + ms;
  };

  it('leaves a steady 60 Hz flat screen alone', () => {
    const levels: number[] = [];
    run(new FrameGuard((l) => levels.push(l)), 10_000, 16.7, false);
    expect(levels).toEqual([]);
  });

  it('steps down in the headset only after 3 s of slow frames, then again', () => {
    const levels: number[] = [];
    const g = new FrameGuard((l) => levels.push(l));
    let t = run(g, 2000, 13.9, true);
    t = run(g, 2500, 20, true, t);
    expect(levels).toEqual([]); // not sustained long enough yet
    t = run(g, 2000, 20, true, t);
    expect(levels).toEqual([1]);
    run(g, 5000, 20, true, t);
    expect(levels).toEqual([1, 2]);
  });

  it('catches dropped frames on a flat screen', () => {
    const levels: number[] = [];
    const g = new FrameGuard((l) => levels.push(l));
    let t = 0;
    for (let i = 0; i < 600; i++) t = run(g, 100, i % 3 === 0 ? 33.4 : 16.7, false, t);
    expect(levels[0]).toBe(1);
  });
});

describe('3D model baking', () => {
  it('turns quantised meshopt positions into a unit-height model without clamping', () => {
    // Like a meshopt GLB: normalised int16 positions, real size carried by the node's scale.
    const q = (v: number) => Math.round(v * 32767);
    const pos = new THREE.BufferAttribute(new Int16Array([q(-1), q(-1), 0, q(1), q(-1), 0, q(0), q(1), 0]), 3, true);
    const geo = new THREE.BufferGeometry().setAttribute('position', pos);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial());
    const node = new THREE.Group();
    node.scale.set(0.3, 0.2, 0.3); // 0.6 wide, 0.4 tall
    node.position.set(5, 3, 0);
    node.add(mesh);
    const t = bakeTemplate(node);
    t.parts[0].geo.computeBoundingBox();
    const bb = t.parts[0].geo.boundingBox!;
    expect(bb.min.y).toBeCloseTo(0, 3);
    expect(bb.max.y).toBeCloseTo(1, 3);
    expect(bb.min.x).toBeCloseTo(-0.75, 3);
    expect(t.aspect).toBeCloseTo(1.5, 3);
    expect(t.parts[0].geo.getAttribute('position').array).toBeInstanceOf(Float32Array);
  });
});

describe('journeys', () => {
  it('walks forwards and backwards over every stop', () => {
    expect(recallOrder(5, 'forwards')).toEqual([0, 1, 2, 3, 4]);
    expect(recallOrder(5, 'backwards')).toEqual([4, 3, 2, 1, 0]);
  });

  it('asks distinct positions, never two neighbours in a row', () => {
    for (let seed = 0; seed < 50; seed++) {
      let x = seed + 1;
      const rng = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
      const order = recallOrder(10, 'position', 4, rng);
      expect(new Set(order).size).toBe(4);
      for (let i = 1; i < order.length; i++) expect(Math.abs(order[i] - order[i - 1])).toBeGreaterThan(1);
    }
  });

  it('marks every fifth stop as a landmark and phrases prompts by mode', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(isLandmark)).toEqual([false, false, false, false, true, false, true]);
    expect(stopPrompt('position', 6, 10)).toBe("What's number 7?");
    expect(stopPrompt('backwards', 9, 10)).toContain('number 10');
  });

  it('counts items named in order from one free answer', () => {
    const names = ELEMENTS.map((e) => [e.display]);
    expect(namedInOrder('hydrogen, helium, lithium, um, carbon', names)).toBe(3);
    expect(namedInOrder('Hydrogen helium lithium beryllium boron carbon nitrogen oxygen fluorine neon', names)).toBe(10);
    expect(namedInOrder('helium hydrogen', names)).toBe(1);
    expect(namedInOrder('no idea', names)).toBe(0);
  });

  it('reports which talk points were covered and how many in order', () => {
    const points = ['Wet your hands', 'Apply soap', 'Scrub 20 seconds', 'Rinse well', 'Dry with towel'];
    const talk = 'First you wet your hands. Then rinse them well. Oh and before that, apply plenty of soap, then dry them with a towel.';
    const r = rehearsalReport(talk, points);
    expect(r.covered).toEqual([0, 1, 3, 4]);
    expect(r.missed).toEqual([2]);
    expect(r.inOrder).toBe(3); // wet, soap, dry keep order; rinse came too early
    expect(rehearsalReport('', points).covered).toEqual([]);
    expect(rehearsalReport('scrubbing for twenty seconds, scrub scrub 20 seconds', points).covered).toEqual([2]);
  });

  it('groups memories into journeys in path order', () => {
    const mem = (id: string, index: number) => ({ id, journey: { id: 'j', name: 'J', index } }) as never;
    const ms = [mem('c', 2), mem('a', 0), mem('b', 1), { id: 'free' } as never];
    expect(journeyStops(ms, 'j').map((m: { id: string }) => m.id)).toEqual(['a', 'b', 'c']);
    expect(journeys(ms)).toEqual([{ id: 'j', name: 'J', length: 3 }]);
  });

  it('ships the English-for-Chinese journey with known props and Chinese questions', () => {
    expect(ENGLISH).toHaveLength(10);
    for (const e of ENGLISH) {
      expect([...PROP_IDS, ...SCENE_ART_IDS]).toContain(e.scenes[0].props[0].prop);
      expect(e.question).toMatch(/[\u4e00-\u9fff]/);
    }
  });

  it('ships ten element stops built from known props, each linked to the next', () => {
    expect(ELEMENTS.map((e) => e.answers[1])).toEqual(['H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne']);
    for (const [i, e] of ELEMENTS.entries()) {
      expect(e.scenes).toHaveLength(1);
      for (const p of e.scenes[0].props) expect([...PROP_IDS, ...SCENE_ART_IDS]).toContain(p.prop);
      if (i < ELEMENTS.length - 1) expect(e.link!.length).toBeGreaterThan(10);
    }
  });
});

describe('Recall Rush rules', () => {
  it('speeds up with the combo, within limits', () => {
    expect(flightMs(0)).toBe(6000);
    expect(flightMs(8)).toBe(4000);
    expect(flightMs(100)).toBe(2600);
    expect([0, 3, 6, 9, 12, 30].map(musicLevel)).toEqual([0, 1, 2, 3, 4, 4]);
    expect(beatMs(0)).toBeGreaterThan(beatMs(10));
  });

  it('scores hits higher in a long combo and for answering early', () => {
    expect(rushPoints(0, 6000, 6000)).toBe(100);
    expect(rushPoints(0, 0, 6000)).toBe(150);
    expect(rushPoints(5, 6000, 6000)).toBe(200);
  });

  it('picks faint memories more often and never repeats the last two', () => {
    const pool = [{ id: 'strong' }, { id: 'faint' }, { id: 'mid' }];
    const r = (m: { id: string }) => ({ strong: 0.98, faint: 0.3, mid: 0.7 }[m.id]!);
    let x = 7;
    const rng = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
    const counts: Record<string, number> = { strong: 0, faint: 0, mid: 0 };
    for (let i = 0; i < 600; i++) counts[nextPick(pool, r, [], rng).id]++;
    expect(counts.faint).toBeGreaterThan(counts.mid);
    expect(counts.mid).toBeGreaterThan(counts.strong);
    for (let i = 0; i < 50; i++) expect(['faint', 'mid']).not.toContain(nextPick(pool, r, ['faint', 'mid'], rng).id);
  });

  it('keys weeks the ISO way', () => {
    expect(weekKey(Date.UTC(2026, 10, 18))).toBe('2026-W47');
    expect(weekKey(Date.UTC(2027, 0, 1))).toBe('2026-W53');
    expect(weekKey(Date.UTC(2027, 0, 4))).toBe('2027-W01');
  });
});

describe('collection rarity', () => {
  const day = 86_400_000, now = 200 * day;
  it('is earned by mastery, then by time kept', () => {
    expect(rarityOf({ stabilityDays: 5, recall: 0.95, firstReviewAt: now - 100 * day, now })).toBeNull();
    expect(rarityOf({ stabilityDays: 30, recall: 0.7, firstReviewAt: now - 100 * day, now })).toBeNull(); // fading: not on show
    expect(rarityOf({ stabilityDays: 30, recall: 0.92, firstReviewAt: now - 10 * day, now })).toBe('bronze');
    expect(rarityOf({ stabilityDays: 30, recall: 0.92, firstReviewAt: now - 31 * day, now })).toBe('silver');
    expect(rarityOf({ stabilityDays: 60, recall: 0.92, firstReviewAt: now - 95 * day, now })).toBe('gold');
  });
});

describe('milestones and weekly mode', () => {
  it('unlocks themes at 7, 30, 100 and 365 days', () => {
    expect(unlockedThemes(3)).toEqual(['garden']);
    expect(unlockedThemes(30)).toEqual(['garden', 'moonlit', 'autumn']);
    expect(milestoneAt(100)?.name).toBe('Golden hour');
    expect(milestoneAt(8)).toBeNull();
  });

  it('counts runs of weeks with five active days, never breaking on the current week', () => {
    const days = (mon: string, n: number) => Array.from({ length: n }, (_, i) => addDays(mon, i));
    const active = [...days('2026-11-02', 5), ...days('2026-11-09', 6), ...days('2026-11-16', 2)];
    expect(weeklyStreak(active, '2026-11-18')).toBe(2); // this week (2 days so far) doesn't break it
    expect(weeklyStreak([...active, ...days('2026-11-18', 3)], '2026-11-20')).toBe(3);
    expect(weeklyStreak(days('2026-10-26', 5), '2026-11-18')).toBe(0); // a missed week breaks it
  });
});

describe('daily challenge', () => {
  it('gives everyone the same 20 distinct words for a key, different on another day', () => {
    const a = challengeItems(dailyKey(Date.UTC(2026, 10, 18, 9))), b = challengeItems(dailyKey(Date.UTC(2026, 10, 18, 22)));
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(20);
    expect(a.every((w) => WORDS.includes(w))).toBe(true);
    expect(challengeItems(dailyKey(Date.UTC(2026, 10, 19)))).not.toEqual(a);
  });

  it('scores words in their right place, and only pays for speed with half right', () => {
    const items = challengeItems('x');
    const swapped = [items[1], items[0], ...items.slice(2)];
    expect(scoreChallenge(items, items, 300).correct).toBe(20);
    expect(scoreChallenge(items, swapped, 300).correct).toBe(18);
    expect(scoreChallenge(items, items.slice(0, 5), 60)).toEqual({ correct: 5, score: 500 });
    expect(scoreChallenge(items, items, 300).score).toBe(2000 + 200);
  });
});

describe('Memory Athlete', () => {
  it('starts with a baseline, benchmarks every seventh day, and builds the method between', () => {
    expect(planDay(1).activity).toBe('baseline');
    expect(planDay(2).activity).toBe('journey');
    expect([8, 15, 22, 29, 36].map((d) => planDay(d).activity)).toEqual(['benchmark', 'benchmark', 'benchmark', 'benchmark', 'benchmark']);
    expect(planDay(10).title).toBe('Vivid images');
    expect(planDay(99).day).toBe(40);
    expect(programmeDay(0, 0)).toBe(1);
    expect(programmeDay(0, 7.5 * 86_400_000)).toBe(8);
  });

  it('scores free recall in any order, ignoring filler and repeats', () => {
    const words = ['anchor', 'violin', 'tiger', 'teapot'];
    expect(freeRecallScore(words, 'um tiger, then anchor... anchor again, and a violin')).toBe(3);
    expect(freeRecallScore(words, '')).toBe(0);
  });
});

describe('text wrapping', () => {
  // A fake canvas where every character is 10 px wide.
  const ctx = { measureText: (s: string) => ({ width: s.length * 10 }) } as unknown as CanvasRenderingContext2D;
  it('breaks English at spaces and Chinese between characters', () => {
    expect(wrap(ctx, 'the quick brown fox', 100)).toEqual(['the quick', 'brown fox']);
    expect(wrap(ctx, '我会教你记忆冠军如何记住任何东西。', 60)).toEqual(['我会教你记忆', '冠军如何记住', '任何东西。']);
    expect(wrap(ctx, 'one\ntwo', 100)).toEqual(['one', 'two']);
  });
});
