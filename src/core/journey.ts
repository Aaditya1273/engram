import { answerMatches } from './answer';
import type { Memory } from '../shared/types';

/**
 * Journeys: ordered memories along a fixed path of pedestals, the method of loci proper. Order is what
 * flashcards lose and a palace keeps: walk it forwards or backwards, or jump straight to "number 7".
 */

export type RecallMode = 'forwards' | 'backwards' | 'position';

/** Every fifth stop carries a gold numbered medallion, so you can find "number 15" without counting from 1. */
export const isLandmark = (index: number) => (index + 1) % 5 === 0;

/** The memories of one journey, in path order. */
export function journeyStops(memories: Memory[], id: string): Memory[] {
  return memories.filter((m) => m.journey?.id === id).sort((a, b) => a.journey!.index - b.journey!.index);
}

/** Every journey the learner has, by name, with its length. */
export function journeys(memories: Memory[]): { id: string; name: string; length: number }[] {
  const out = new Map<string, { id: string; name: string; length: number }>();
  for (const m of memories) {
    if (!m.journey) continue;
    const j = out.get(m.journey.id) ?? { id: m.journey.id, name: m.journey.name, length: 0 };
    j.length++;
    out.set(j.id, j);
  }
  return [...out.values()];
}

/**
 * The stops to ask, by index. Forwards and backwards walk the whole path; position asks a few stops in random
 * order, never two neighbours in a row (that would just be walking).
 */
export function recallOrder(n: number, mode: RecallMode, count = 3, rng = Math.random): number[] {
  const all = Array.from({ length: n }, (_, i) => i);
  if (mode === 'forwards') return all;
  if (mode === 'backwards') return all.reverse();
  const picked: number[] = [];
  const pool = [...all];
  while (picked.length < Math.min(count, n) && pool.length) {
    const options = pool.filter((i) => picked.length === 0 || Math.abs(i - picked[picked.length - 1]) > 1);
    const from = options.length ? options : pool;
    const i = from[Math.floor(rng() * from.length)];
    picked.push(i);
    pool.splice(pool.indexOf(i), 1);
  }
  return picked;
}

/** The question for one stop in a given mode. */
export function stopPrompt(mode: RecallMode, index: number, total: number): string {
  if (mode === 'position') return `What's number ${index + 1}?`;
  if (mode === 'backwards') return index === total - 1 ? `Backwards now. What's at the end, number ${total}?` : `And before that, number ${index + 1}?`;
  return index === 0 ? "From the start. What's at number 1?" : `Next stop, number ${index + 1}?`;
}

/**
 * How many items someone named in the right order, from one free answer ("hydrogen, helium, lithium…").
 * Used for the quick test before a journey: the before in a before-and-after. Counts the longest run from the
 * start, so naming item 3 without 1 and 2 doesn't count.
 */
export function namedInOrder(transcript: string, answers: string[][]): number {
  const words = transcript.toLowerCase().split(/[\s,.;:!?、。]+/).filter(Boolean);
  let at = 0, n = 0;
  for (const accepted of answers) {
    let found = -1;
    for (let w = at; w < words.length && found < 0; w++) {
      // Two-word answers ("carbon dioxide") are tried as a pair.
      if (answerMatches([words[w]], accepted) || (w + 1 < words.length && answerMatches([`${words[w]} ${words[w + 1]}`], accepted))) found = w;
    }
    if (found < 0) break;
    n++;
    at = found + 1;
  }
  return n;
}
