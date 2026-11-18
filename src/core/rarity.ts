/**
 * Collection rarity, earned only by remembering: bronze when a memory is mastered (FSRS stability of three weeks
 * or more, still above 85% recall), silver once it has been kept 30 days, gold at 90 days. Days kept count from
 * the memory's first review, so a memory that lapses and is relearned keeps its history but must be mastered again.
 */
export type Rarity = 'bronze' | 'silver' | 'gold';

export const MASTERED_STABILITY_DAYS = 21;
export const KEEP_RECALL = 0.85;

export function rarityOf(s: { stabilityDays: number; recall: number; firstReviewAt: number; now: number }): Rarity | null {
  if (s.stabilityDays < MASTERED_STABILITY_DAYS || s.recall < KEEP_RECALL) return null;
  const kept = (s.now - s.firstReviewAt) / 86_400_000;
  return kept >= 90 ? 'gold' : kept >= 30 ? 'silver' : 'bronze';
}

/** For the gallery's order: gold first. */
export const RARITY_RANK: Record<Rarity, number> = { gold: 3, silver: 2, bronze: 1 };
