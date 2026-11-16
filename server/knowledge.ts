import type { Card } from 'ts-fsrs';
import { cardFrom, dueAt, nextCard, recallProbability, DESIRED_RETENTION } from '../src/core/model';
import { planSession } from '../src/core/triage';
import type { Goal, Memory, Review } from '../src/shared/types';

/** What the user knows, computed from the review log with the same FSRS model the headset uses. */

const DAY = 86_400_000;

export interface MemoryState {
  m: Memory;
  card: Card;
  r: number;
  due: number;
  rAt(t: number): number;
}

export function states(memories: Memory[], reviews: Review[]): MemoryState[] {
  const byMemory = new Map<string, Review[]>();
  for (const r of reviews) byMemory.set(r.memoryId, [...(byMemory.get(r.memoryId) ?? []), r]);
  const now = Date.now();
  return memories.map((m) => {
    const card = cardFrom(byMemory.get(m.id) ?? [], m.createdAt);
    return { m, card, r: recallProbability(card, now), due: dueAt(card), rAt: (t: number) => recallProbability(card, t) };
  });
}

const fact = (s: MemoryState, r = s.r) => ({ id: s.m.id, topic: s.m.topic, question: s.m.question, answer: s.m.display, recall: Math.round(r * 100) / 100 });

export function listDue(all: MemoryState[]) {
  const now = Date.now();
  const plan = planSession(all.map((s) => ({ id: s.m.id, r: s.r, due: s.due, goalWeight: s.m.goalWeight })), now);
  const byId = new Map(all.map((s) => [s.m.id, s]));
  return {
    fading: plan.ids.length + plan.overflow,
    session_items: plan.ids.length,
    session_minutes: Math.max(plan.ids.length ? 1 : 0, Math.round(plan.estimatedSec / 60)),
    items: plan.ids.map((id) => fact(byId.get(id)!)),
  };
}

/** Facts reliably recalled right now (predicted recall ≥ 90%). */
export function known(all: MemoryState[], topic?: string) {
  return all
    .filter((s) => s.r >= DESIRED_RETENTION && (!topic || s.m.topic.toLowerCase() === topic.toLowerCase()))
    .map((s) => fact(s));
}

const deadlineMs = (g: Goal) => new Date(`${g.deadline}T12:00:00Z`).getTime();

/** Facts in a goal most likely to be forgotten by its deadline (or now, without a goal). */
export function gaps(all: MemoryState[], goal?: Goal, limit = 10) {
  const at = goal ? Math.max(Date.now(), deadlineMs(goal)) : Date.now();
  return all
    .filter((s) => !goal || s.m.goalId === goal.id)
    .map((s) => ({ s, r: s.rAt(at) }))
    .sort((a, b) => a.r - b.r)
    .slice(0, limit)
    .map(({ s, r }) => fact(s, r));
}

/**
 * Two honest numbers: recall on the deadline if you stop today, and the daily review load that keeps
 * every goal memory at the retention target until then (simulated with FSRS, assuming each review passes).
 */
export function readiness(all: MemoryState[], goal: Goal) {
  const now = Date.now();
  const end = Math.max(now, deadlineMs(goal));
  const mine = all.filter((s) => s.m.goalId === goal.id);
  let reviews = 0;
  for (const s of mine) {
    let card = s.card, t = Math.max(now, dueAt(card));
    for (let guard = 0; t < end && guard < 200; guard++) {
      reviews++;
      card = nextCard(card, t, 'good');
      t = dueAt(card);
    }
  }
  const daysLeft = Math.max(1, Math.ceil((end - now) / DAY));
  const ifStopToday = mine.length ? mine.reduce((sum, s) => sum + s.rAt(end), 0) / mine.length : 0;
  return {
    goal: goal.name,
    deadline: goal.deadline,
    memories: mine.length,
    days_left: daysLeft,
    readiness_if_stop_today: Math.round(ifStopToday * 100) / 100,
    readiness_on_track: mine.length ? DESIRED_RETENTION : 0,
    target: goal.target,
    reviews_per_day_on_track: Math.round((reviews / daysLeft) * 10) / 10,
  };
}
