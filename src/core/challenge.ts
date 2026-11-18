import { answerMatches } from './answer';

/**
 * The daily challenge, the memory-sports "words" discipline: everyone gets the same 20 concrete words for the
 * day (or a duel's seed), memorises them in order in their palace, then recalls them in order. Shared by the
 * headset (to show the words) and the server (to score answers and check the timing), so neither trusts the other.
 */

export const CHALLENGE_SIZE = 20;
/** Seconds to memorise; recall is untimed but the whole run must finish within the limit. */
export const MEMORISE_S = 150;
export const RUN_LIMIT_S = 900;
/** A finish faster than this can't have involved reading 20 words and answering 20 questions. */
export const MIN_RUN_S = 30;

/** Concrete, easily pictured nouns: the kind memory athletes are tested on. */
export const WORDS = [
  'anchor', 'apple', 'arrow', 'axe', 'balloon', 'banana', 'barrel', 'basket', 'bell', 'bicycle', 'blanket', 'boot', 'bottle', 'bridge',
  'broom', 'bucket', 'butterfly', 'cactus', 'cake', 'camel', 'candle', 'cannon', 'carpet', 'castle', 'chain', 'chair', 'cheese', 'cherry',
  'chimney', 'clock', 'cloud', 'coconut', 'comb', 'compass', 'crown', 'cup', 'curtain', 'diamond', 'dolphin', 'door', 'dragon', 'drum',
  'duck', 'eagle', 'egg', 'elephant', 'envelope', 'feather', 'fence', 'flag', 'flute', 'fork', 'fountain', 'frog', 'giraffe', 'glove',
  'goat', 'guitar', 'hammer', 'harp', 'helmet', 'honey', 'horse', 'iceberg', 'igloo', 'island', 'jacket', 'jelly', 'kettle', 'key',
  'kite', 'ladder', 'lamp', 'lemon', 'lighthouse', 'lion', 'lizard', 'lock', 'magnet', 'map', 'mask', 'mirror', 'monkey', 'moon',
  'mushroom', 'needle', 'nest', 'octopus', 'onion', 'owl', 'paddle', 'parrot', 'peach', 'pearl', 'pencil', 'penguin', 'piano', 'pillow',
  'pineapple', 'pirate', 'pizza', 'pumpkin', 'pyramid', 'rabbit', 'rainbow', 'robot', 'rocket', 'rope', 'rose', 'sail', 'saw', 'scarf',
  'scissors', 'shark', 'shell', 'ship', 'skull', 'snail', 'snowman', 'sock', 'spider', 'spoon', 'squirrel', 'statue', 'strawberry', 'submarine',
  'sword', 'teapot', 'telescope', 'tent', 'tiger', 'tomato', 'torch', 'tractor', 'train', 'treasure', 'trumpet', 'turtle', 'umbrella', 'vase',
  'violin', 'volcano', 'wagon', 'waterfall', 'whale', 'wheel', 'whistle', 'window', 'wizard', 'yacht', 'zebra',
];

/** Small, fast, deterministic PRNG from a string seed (FNV-1a hash into mulberry32). */
function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The day's (or duel's) words: the same for everyone with the same key. */
export function challengeItems(key: string, n = CHALLENGE_SIZE): string[] {
  const r = rng(key), pool = [...WORDS];
  const out: string[] = [];
  while (out.length < n) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return out;
}

/** Today's challenge key, by UTC date so everyone shares one board. */
export const dailyKey = (t: number) => `daily-${new Date(t).toISOString().slice(0, 10)}`;

/**
 * Score: 100 per word recalled in its right place, and a bonus for finishing fast that only counts when at
 * least half are right (so racing through wrong answers never pays).
 */
export function scoreChallenge(items: string[], answers: string[], seconds: number): { correct: number; score: number } {
  const correct = items.reduce((n, w, i) => n + (answers[i] && answerMatches([answers[i]], [w]) ? 1 : 0), 0);
  const speed = correct * 2 >= items.length ? Math.max(0, Math.round((RUN_LIMIT_S - seconds) / 3)) : 0;
  return { correct, score: correct * 100 + speed };
}
