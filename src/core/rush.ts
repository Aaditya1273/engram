/**
 * Recall Rush rules: 90 seconds, a lantern at a time flying in with a cue; answer before it arrives.
 * Pure functions so the feel can be tuned and tested away from the renderer.
 */

export const RUSH_MS = 90_000;

/** Time for a lantern to arrive: 6 s at first, quicker with every link in the combo, never under 2.6 s. */
export const flightMs = (combo: number) => Math.max(2600, 6000 - combo * 250);

/** Music brightens every three in a row, up to level 4. */
export const musicLevel = (combo: number) => Math.min(4, Math.floor(combo / 3));

/** Beat interval for the music: a little faster as the combo builds. */
export const beatMs = (combo: number) => Math.max(260, 480 - combo * 12);

/** 100 a hit, times a multiplier that grows every five in a row, plus up to 50 for answering early. */
export function rushPoints(combo: number, latencyMs: number, flight: number): number {
  const multiplier = 1 + Math.floor(combo / 5);
  const early = Math.max(0, 1 - latencyMs / flight);
  return Math.round((100 + 50 * early) * multiplier);
}

/**
 * The next memory to fly in: the faintest first (lowest recall), never one of the last two shown, so a short
 * palace still mixes. `recall` is each memory's current recall probability.
 */
export function nextPick<T extends { id: string }>(pool: T[], recall: (m: T) => number, recent: string[], rng = Math.random): T {
  const fresh = pool.filter((m) => !recent.slice(-2).includes(m.id));
  const from = fresh.length ? fresh : pool;
  // Weight by forgetting: a memory at 50% recall is twice as likely as one at 75%.
  const weights = from.map((m) => 0.15 + (1 - recall(m)));
  let r = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < from.length; i++) if ((r -= weights[i]) <= 0) return from[i];
  return from[from.length - 1];
}

/** ISO week key ("2026-W47"): weekly bests reset on Mondays. */
export function weekKey(t: number): string {
  const d = new Date(t);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - first.getTime()) / 86_400_000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
