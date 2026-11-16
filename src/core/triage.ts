import { DESIRED_RETENTION } from './model';

export interface TriageItem {
  id: string;
  /** Recall probability now. */
  r: number;
  /** FSRS due time (covers short learning steps where r is still ~1). */
  due: number;
  goalWeight: number;
  /** Goal deadline, ms epoch. */
  deadline?: number;
}

export interface SessionPlan {
  ids: string[];
  /** Due items that didn't fit; they simply wait, ranked again tomorrow. Nothing piles up visibly. */
  overflow: number;
  comeback: boolean;
  /** Comeback walk never shows a due count. */
  hideCount: boolean;
  estimatedSec: number;
}

export const SESSION_BUDGET_SEC = 7 * 60;
export const SEC_PER_RECALL = 20;
export const COMEBACK_AFTER_MISSED_DAYS = 3;
export const COMEBACK_SIZE = 10;

const DAY = 86_400_000;

export function priority(item: TriageItem, now: number): number {
  const urgency = item.deadline === undefined ? 1 : 1 + 7 / Math.max(1, (item.deadline - now) / DAY);
  return (1 - item.r) * item.goalWeight * urgency;
}

export const isDue = (item: TriageItem, now: number) => item.r < DESIRED_RETENTION || item.due <= now;

export function planSession(
  items: TriageItem[],
  now: number,
  { budgetSec = SESSION_BUDGET_SEC, missedDays = 0 } = {},
): SessionPlan {
  const due = items.filter((i) => isDue(i, now)).sort((a, b) => priority(b, now) - priority(a, now));
  const comeback = missedDays >= COMEBACK_AFTER_MISSED_DAYS;
  const cap = comeback ? COMEBACK_SIZE : Math.max(1, Math.floor(budgetSec / SEC_PER_RECALL));
  const ids = due.slice(0, cap).map((i) => i.id);
  return {
    ids,
    overflow: due.length - ids.length,
    comeback,
    hideCount: comeback,
    estimatedSec: ids.length * SEC_PER_RECALL,
  };
}
