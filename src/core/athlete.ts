import { answerMatches } from './answer';

/**
 * Memory Athlete: a 40-day method-of-loci programme in the shape of the training that took people with ordinary
 * memories from about 26 to 62 of 72 words in 40 days (Dresler et al., Neuron, 2017). Day 1 is a baseline;
 * every seventh day is a benchmark with fresh words; the days between build the method a step at a time.
 * Atrium's own results come from its own benchmarks, never from the study.
 */

export const BASELINE_WORDS = 30;
export const BASELINE_MEMORISE_MS = 5 * 60_000;
export const PROGRAMME_DAYS = 40;

export type Activity = 'baseline' | 'benchmark' | 'journey' | 'build' | 'challenge' | 'rush' | 'quiz';

export interface PlanDay { day: number; title: string; lesson: string; activity: Activity }

const PHASES: { until: number; title: string; lesson: string; activity: Activity }[] = [
  { until: 1, title: 'Baseline', lesson: 'How many of 30 words can you hold right now? This is your "before".', activity: 'baseline' },
  { until: 6, title: 'Loci', lesson: 'A memory palace is a route you already know. Walk your first journey forwards and backwards until it is effortless.', activity: 'journey' },
  { until: 13, title: 'Vivid images', lesson: 'Make every image strange, moving and exaggerated: a giant, glowing, noisy version sticks. Build a palace from something you need.', activity: 'build' },
  { until: 20, title: 'Story links', lesson: 'Chain each place to the next with a short action, so recalling one pulls the next along. Play the daily challenge using links.', activity: 'challenge' },
  { until: 27, title: 'Speed', lesson: 'Champions see an image in under a second. Train quick, confident retrieval.', activity: 'rush' },
  { until: 34, title: 'Depth', lesson: 'Ask yourself the same things in new ways: reversed, applied, out of order.', activity: 'quiz' },
  { until: 40, title: 'Mastery', lesson: 'Put it all together on new material, then measure how far you have come.', activity: 'challenge' },
];

/** The plan for a programme day (1-based). Every seventh day after the first is a benchmark. */
export function planDay(day: number): PlanDay {
  const d = Math.min(PROGRAMME_DAYS, Math.max(1, Math.floor(day)));
  if (d > 1 && (d - 1) % 7 === 0) return { day: d, title: 'Benchmark', lesson: 'Thirty fresh words, five minutes: see what the method has done for you.', activity: 'benchmark' };
  const p = PHASES.find((x) => d <= x.until)!;
  return { day: d, ...p };
}

/** Programme day from its start: day 1 is the start day itself. */
export const programmeDay = (startedAt: number, now: number) => Math.floor((now - startedAt) / 86_400_000) + 1;

/** Free recall: how many of the words appear anywhere in what was said or written (order doesn't matter here). */
export function freeRecallScore(words: string[], recalled: string): number {
  const said = recalled.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return words.filter((w) => said.some((s) => answerMatches([s], [w]))).length;
}
