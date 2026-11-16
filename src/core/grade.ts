import type { Grade } from '../shared/types';
import type { MatchResult } from './gesture';

/** A correct answer slower than this drops one grade. */
export const SLOW_MS = 8000;

/**
 * Spoken answer decides pass/fail; the gesture and speed only refine a pass.
 * A correct answer never grades below 'hard': 'again' resets FSRS stability, which would
 * punish a real recall for a fumbled gesture.
 */
export function gradeRecall(answerOk: boolean, gesture: MatchResult | null, latencyMs: number): Grade {
  if (!answerOk) return 'again';
  const gestureOk = gesture === null || gesture.ok;
  if (!gestureOk || latencyMs > SLOW_MS) return 'hard';
  return 'good';
}
