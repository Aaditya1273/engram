import type { Card } from 'ts-fsrs';
import { cardFrom, dueAt, recallProbability } from '../core/model';
import { newStreak, type StreakState } from '../core/streak';
import type { Memory, Review } from '../shared/types';

export interface Settings {
  /** Dwell-to-select, no gestures required. */
  gazeOnly: boolean;
  narration: boolean;
  /** Recogniser language for answers. */
  answerLang: string;
  /** Recogniser language for twists. */
  twistLang: string;
  /** Demo/testing: shifts the clock forward (ms). Set with ?skip=3d. */
  clockOffset: number;
}

interface SaveData {
  v: 1;
  memories: Memory[];
  reviews: Review[];
  streak: StreakState;
  onboarded: boolean;
  settings: Settings;
}

const KEY = 'atrium:v1';

const fresh = (): SaveData => ({
  v: 1,
  memories: [],
  reviews: [],
  streak: newStreak(),
  onboarded: false,
  settings: { gazeOnly: false, narration: true, answerLang: 'ja-JP', twistLang: 'en-US', clockOffset: 0 },
});

/**
 * Local, offline-first store. Reviews are append-only and FSRS cards are derived from them,
 * so the future sync layer only has to upload new reviews.
 * ponytail: localStorage JSON. Fine for hundreds of memories; move to IndexedDB past a few MB.
 */
export class Store {
  data: SaveData;
  private cards = new Map<string, Card>();

  constructor() {
    this.data = fresh();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SaveData;
        if (parsed.v === 1) this.data = { ...fresh(), ...parsed, settings: { ...fresh().settings, ...parsed.settings } };
      }
    } catch {
      // Private mode or corrupt data: start fresh rather than crash.
    }
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // Storage full or blocked: the session still works, it just won't persist.
    }
  }

  reset() {
    this.data = fresh();
    this.cards.clear();
    this.save();
  }

  now = () => Date.now() + this.data.settings.clockOffset;

  card(m: Memory): Card {
    let c = this.cards.get(m.id);
    if (!c) {
      c = cardFrom(this.data.reviews.filter((r) => r.memoryId === m.id), m.createdAt);
      this.cards.set(m.id, c);
    }
    return c;
  }

  recall(m: Memory, at = this.now()) {
    return recallProbability(this.card(m), at);
  }

  due(m: Memory) {
    return dueAt(this.card(m));
  }

  addMemory(m: Memory) {
    this.data.memories.push(m);
    this.save();
  }

  addReview(r: Review) {
    this.data.reviews.push(r);
    this.cards.delete(r.memoryId);
    this.save();
  }

  nextFreeSlot(): number {
    const used = new Set(this.data.memories.map((m) => m.slot));
    let i = 0;
    while (used.has(i)) i++;
    return i;
  }
}
