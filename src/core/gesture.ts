import type { GestureSignature } from '../shared/types';

/**
 * Gesture signature matching. Input frames are already turned into feature vectors by
 * the input layer (hand joints or pointer path); this module only resamples and compares.
 */

export const RESAMPLE_N = 32;
/** Minimum tolerance, so two near-identical enrolment takes don't make the gesture impossible to repeat. */
export const TOLERANCE_FLOOR = 0.12;
/** At recall we accept up to tolerance × LENIENT: false rejects hurt more than false accepts here. */
export const LENIENT = 2.2;
/** If the two enrolment takes are further apart than this, ask for a third take. */
export const MAX_ENROL_GAP = 0.9;
/** Below this extent (furthest distance from the first frame) the user didn't really move. */
export const MIN_MOTION = 0.25;

const dist = (a: number[], b: number[]) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
};

/** Linear resample to n frames by index (DTW absorbs speed differences). */
export function resample(frames: number[][], n = RESAMPLE_N): number[][] {
  if (frames.length === 0) return [];
  if (frames.length === 1) return Array.from({ length: n }, () => frames[0].slice());
  const out: number[][] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * (frames.length - 1);
    const lo = Math.floor(t), hi = Math.min(lo + 1, frames.length - 1), f = t - lo;
    out.push(frames[lo].map((v, d) => v + (frames[hi][d] - v) * f));
  }
  return out;
}

/** Extent, not path length: tracking jitter adds up over a path but not over an extent. */
export function motion(frames: number[][]): number {
  let m = 0;
  for (let i = 1; i < frames.length; i++) m = Math.max(m, dist(frames[i], frames[0]));
  return m;
}

/** DTW with a Sakoe–Chiba band, normalised by sequence length. Inputs must be resampled to equal length. */
export function dtw(a: number[][], b: number[][], band = Math.ceil(RESAMPLE_N * 0.25)): number {
  const n = a.length, m = b.length;
  if (n === 0 || m === 0 || a[0].length !== b[0].length) return Infinity;
  const D = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(Infinity));
  D[0][0] = 0;
  for (let i = 1; i <= n; i++) {
    const jFrom = Math.max(1, i - band), jTo = Math.min(m, i + band);
    for (let j = jFrom; j <= jTo; j++) {
      D[i][j] = dist(a[i - 1], b[j - 1]) + Math.min(D[i - 1][j], D[i][j - 1], D[i - 1][j - 1]);
    }
  }
  return D[n][m] / Math.max(n, m);
}

export type EnrolResult =
  | { ok: true; signature: GestureSignature }
  | { ok: false; reason: 'still' | 'inconsistent' };

export function enrol(
  modality: GestureSignature['modality'],
  take1: number[][],
  take2: number[][],
): EnrolResult {
  if (motion(take1) < MIN_MOTION || motion(take2) < MIN_MOTION) return { ok: false, reason: 'still' };
  const a = resample(take1), b = resample(take2);
  const gap = dtw(a, b);
  if (gap > MAX_ENROL_GAP) return { ok: false, reason: 'inconsistent' };
  return { ok: true, signature: { modality, takes: [a, b], tolerance: Math.max(gap, TOLERANCE_FLOOR) } };
}

export interface MatchResult {
  ok: boolean;
  /** 1 = identical, 0.5 = exactly at the accept threshold, 0 = far off. */
  score: number;
}

export function match(sig: GestureSignature, frames: number[][], modality: GestureSignature['modality']): MatchResult | null {
  if (modality !== sig.modality) return null;
  if (motion(frames) < MIN_MOTION) return { ok: false, score: 0 };
  const x = resample(frames);
  const d = Math.min(dtw(x, sig.takes[0]), dtw(x, sig.takes[1]));
  const limit = sig.tolerance * LENIENT;
  return { ok: d <= limit, score: Math.max(0, Math.min(1, 1 - d / (2 * limit))) };
}
