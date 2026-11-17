import type { Card } from 'ts-fsrs';
import { cardFrom, dueAt, recallProbability } from '../core/model';
import { newStreak, recordFullSession, recordRecall, type StreakState } from '../core/streak';
import { applyTwist, parseTwist } from '../core/twist';
import { JA_STARTER } from '../shared/deck-ja';
import type { Goal, Memory, Review } from '../shared/types';

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

interface CloudState {
  /** Device token from the Atrium API; absent until first contact (the app works offline without it). */
  token?: string;
  cursor: number;
  dirtyMemories: string[];
  pendingReviews: string[];
  streakEvents: { type: 'recall' | 'session'; day: string }[];
  goals: Goal[];
}

interface SaveData {
  v: 1;
  memories: Memory[];
  reviews: Review[];
  streak: StreakState;
  onboarded: boolean;
  settings: Settings;
  cloud: CloudState;
}

const KEY = 'atrium:v1';

const fresh = (): SaveData => ({
  v: 1,
  memories: [],
  reviews: [],
  streak: newStreak(),
  onboarded: false,
  settings: { gazeOnly: false, narration: true, answerLang: 'ja-JP', twistLang: 'en-US', clockOffset: 0 },
  cloud: { cursor: 0, dirtyMemories: [], pendingReviews: [], streakEvents: [], goals: [] },
});

/** Older saves predate review ids, per-memory questions and the cloud block. */
/** Starter mnemonics that were reworded, old → new, so saved scenes still find their deck scene. */
const RENAMED: Record<string, string> = {
  'A HONest person swears on a book.': 'HONest truth: a gold star shines over a book.',
};

export function migrate(d: SaveData, hadCloud: boolean): SaveData {
  d.cloud = { ...fresh().cloud, ...d.cloud };
  // A save from before sync existed: everything in it still needs uploading once.
  if (!hadCloud) d.cloud.dirtyMemories = d.memories.map((m) => m.id);
  for (const r of d.reviews) {
    if (!r.id) {
      r.id = crypto.randomUUID();
      d.cloud.pendingReviews.push(r.id);
    }
  }
  for (const m of d.memories) {
    m.question ??= `What is "${m.cue}" in Japanese?`;
    m.lang ??= 'ja-JP';
    // Starter scenes follow the shipped deck (its colours were retuned for the painted props); the twist is re-applied.
    const mnemonic = RENAMED[m.scene.mnemonic] ?? m.scene.mnemonic;
    const fresh = JA_STARTER.find((i) => i.id === m.id)?.scenes.find((sc) => sc.mnemonic === mnemonic);
    // Never rebuild a scene holding an object the learner generated (twist-to-3D, leech): it isn't in the deck.
    if (fresh && !m.scene.props.some((p) => p.model)) {
      const scene = applyTwist(fresh, parseTwist(m.twist ?? ''));
      if (JSON.stringify(scene) !== JSON.stringify(m.scene)) {
        m.scene = scene;
        m.mnemonic = scene.mnemonic;
        if (!d.cloud.dirtyMemories.includes(m.id)) d.cloud.dirtyMemories.push(m.id);
      }
    }
  }
  return d;
}

/**
 * Local, offline-first store. Reviews are append-only and FSRS cards are derived from them,
 * so sync only uploads new reviews and dirty memories.
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
        if (parsed.v === 1) this.data = migrate({ ...fresh(), ...parsed, settings: { ...fresh().settings, ...parsed.settings } }, !!parsed.cloud);
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

  /** Full local wipe, including the device token: the next contact creates a fresh account. */
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

  /** After changing a memory in place: save it and send it on the next sync. */
  touch(m: Memory) {
    if (!this.data.cloud.dirtyMemories.includes(m.id)) this.data.cloud.dirtyMemories.push(m.id);
    this.save();
  }

  addMemory(m: Memory) {
    this.data.memories.push(m);
    this.data.cloud.dirtyMemories.push(m.id);
    this.save();
  }

  addReview(r: Omit<Review, 'id'>): Review {
    const review = { ...r, id: crypto.randomUUID() };
    this.data.reviews.push(review);
    this.data.cloud.pendingReviews.push(review.id);
    this.cards.delete(r.memoryId);
    this.save();
    return review;
  }

  /** Streak changes apply locally at once and are replayed on the server at the next sync. */
  streakRecall(day: string) {
    this.data.streak = recordRecall(this.data.streak, day);
    this.data.cloud.streakEvents.push({ type: 'recall', day });
    this.save();
  }

  streakSession(day: string) {
    this.data.streak = recordFullSession(this.data.streak, day);
    this.data.cloud.streakEvents.push({ type: 'session', day });
    this.save();
  }

  /** Merge a sync response: add what's new from other devices, adopt the server's streak. */
  merge(res: { memories: Memory[]; reviews: Review[]; cursor: number; streak: StreakState }, sent: { memories: string[]; reviews: string[]; events: number }) {
    const c = this.data.cloud;
    c.dirtyMemories = c.dirtyMemories.filter((id) => !sent.memories.includes(id));
    c.pendingReviews = c.pendingReviews.filter((id) => !sent.reviews.includes(id));
    c.streakEvents = c.streakEvents.slice(sent.events);
    const haveM = new Set(this.data.memories.map((m) => m.id));
    for (const m of res.memories) if (!haveM.has(m.id)) this.data.memories.push(m);
    const haveR = new Set(this.data.reviews.map((r) => r.id));
    for (const r of res.reviews) {
      if (!haveR.has(r.id)) {
        this.data.reviews.push(r);
        this.cards.delete(r.memoryId);
      }
    }
    c.cursor = res.cursor;
    // Server streak already includes our events (or adopted ours); replay any queued since on top of it.
    let streak = res.streak;
    for (const e of c.streakEvents) streak = e.type === 'session' ? recordFullSession(streak, e.day) : recordRecall(streak, e.day);
    this.data.streak = streak;
    this.save();
  }

  nextFreeSlot(): number {
    const used = new Set(this.data.memories.map((m) => m.slot));
    let i = 0;
    while (used.has(i)) i++;
    return i;
  }
}
