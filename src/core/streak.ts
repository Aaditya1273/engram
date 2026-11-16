/** Ember streak: forgiving by design. Day keys are local 'YYYY-MM-DD'. */

export const MAX_FREEZES = 3;
/** A broken streak can be repaired on the day you return or the day after (≈48 h). */
export const REPAIR_WINDOW_DAYS = 1;

export interface StreakState {
  count: number;
  best: number;
  lastDay: string | null;
  freezes: number;
  broken: { day: string; count: number } | null;
  sessionsToday: { day: string; n: number };
}

export const newStreak = (): StreakState => ({
  count: 0, best: 0, lastDay: null, freezes: 0, broken: null, sessionsToday: { day: '', n: 0 },
});

export function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number), [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** Call when the app opens. Spends freezes on missed days, or breaks the streak. Returns missed days. */
export function rollover(s: StreakState, today: string): { state: StreakState; missedDays: number } {
  if (!s.lastDay) return { state: s, missedDays: 0 };
  const missed = Math.max(0, daysBetween(s.lastDay, today) - 1);
  if (missed === 0) return { state: s, missedDays: 0 };
  if (s.freezes >= missed) {
    // Frozen days keep the streak alive; move lastDay up to yesterday so it continues today.
    return { state: { ...s, freezes: s.freezes - missed, lastDay: addDays(today, -1) }, missedDays: missed };
  }
  const broken = s.count > 0 ? { day: today, count: s.count } : s.broken;
  return { state: { ...s, count: 0, freezes: 0, lastDay: null, broken }, missedDays: missed };
}

export function addDays(k: string, n: number): string {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Any single recall (≥ 60 s of practice, in headset or on phone) counts the day. */
export function recordRecall(s: StreakState, today: string): StreakState {
  if (s.lastDay === today) return s;
  const count = s.count + 1;
  return { ...s, count, best: Math.max(s.best, count), lastDay: today };
}

/** A full headset session earns a freeze; two in one day inside the repair window restore a broken streak. */
export function recordFullSession(s: StreakState, today: string): StreakState {
  const n = s.sessionsToday.day === today ? s.sessionsToday.n + 1 : 1;
  let next: StreakState = { ...recordRecall(s, today), sessionsToday: { day: today, n } };
  next.freezes = Math.min(MAX_FREEZES, next.freezes + 1);
  if (next.broken && n >= 2 && daysBetween(next.broken.day, today) <= REPAIR_WINDOW_DAYS) {
    const count = next.broken.count + next.count;
    next = { ...next, count, best: Math.max(next.best, count), broken: null };
  }
  return next;
}

export function canRepair(s: StreakState, today: string): boolean {
  return !!s.broken && daysBetween(s.broken.day, today) <= REPAIR_WINDOW_DAYS;
}
