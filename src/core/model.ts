import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type Grade as FsrsGrade } from 'ts-fsrs';
import type { Grade, Review } from '../shared/types';

/** FSRS desired retention: a memory is due when its recall probability drops below this. */
export const DESIRED_RETENTION = 0.9;

const params = generatorParameters({ request_retention: DESIRED_RETENTION, enable_fuzz: false });
const scheduler = fsrs(params);
const DECAY = params.w[20];
const FACTOR = 0.9 ** (-1 / DECAY) - 1;
const DAY = 86_400_000;

const RATING: Record<Grade, FsrsGrade> = {
  again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy,
};

/**
 * The review log is the source of truth; the FSRS card is derived by replaying it.
 * That makes offline sync an append-only merge with no conflicting card state.
 */
export function cardFrom(reviews: Review[], createdAt: number): Card {
  let card = createEmptyCard(new Date(createdAt));
  for (const r of [...reviews].sort((a, b) => a.at - b.at)) {
    card = scheduler.next(card, new Date(r.at), RATING[r.grade]).card;
  }
  return card;
}

/**
 * Recall probability now, on the FSRS-6 forgetting curve, using fractional days.
 * ts-fsrs' own helper floors to whole days, which would make lanterns dim in daily steps.
 */
export function recallProbability(card: Card, now: number): number {
  if (card.state === State.New || !card.last_review || card.stability <= 0) return 1;
  const t = Math.max(0, now - new Date(card.last_review).getTime()) / DAY;
  return (1 + (FACTOR * t) / card.stability) ** -DECAY;
}

export const dueAt = (card: Card) => new Date(card.due).getTime();
