import { describe, expect, it } from 'vitest';
import { enrol, match, resample, dtw } from '../src/core/gesture';
import { gradeRecall } from '../src/core/grade';
import { planSession } from '../src/core/triage';
import { newStreak, rollover, recordRecall, recordFullSession, addDays } from '../src/core/streak';
import { answerMatches } from '../src/core/answer';
import { parseTwist, applyTwist } from '../src/core/twist';
import { cardFrom, recallProbability } from '../src/core/model';
import { lanternLook } from '../src/core/lantern';
import { JA_STARTER } from '../src/shared/deck-ja';
import { PROP_IDS, pickVariant } from '../src/shared/props';
import { SCENE_ART_IDS } from '../src/shared/props-catalog';

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
