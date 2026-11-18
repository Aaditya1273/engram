export type PropId =
  | 'cat' | 'dog' | 'bird' | 'book' | 'umbrella' | 'house' | 'mountain' | 'tree'
  | 'drop' | 'cloud' | 'fountain' | 'glasses' | 'hat' | 'ball' | 'star' | 'shoe' | 'sun' | 'person'
  // Whole-scene paintings used by the starter deck (not offered to the AI drafter).
  | 'cat-hug' | 'summit' | 'cat-books' | 'cat-ball' | 'dog-hat' | 'coins';

export interface PropPlacement {
  prop: PropId;
  /** Offset on the pedestal, metres. y is up. */
  pos: [number, number, number];
  scale?: number;
  color?: string;
  /** Yaw in radians. */
  rot?: number;
  /** A one-off 3D object generated for this memory from the learner's own words (twist-to-3D). */
  model?: { id: string; ready?: boolean };
}

export interface SceneSpec {
  mnemonic: string;
  props: PropPlacement[];
  /** Index of the subject prop that a twist recolours or dresses up. Default 0. */
  focus?: number;
}

/** Speech-recognition languages the pipeline may assign to an answer. */
export const LANGS = ['en-US', 'ja-JP', 'zh-CN', 'ko-KR', 'es-ES', 'fr-FR', 'de-DE', 'it-IT', 'pt-BR', 'hi-IN'] as const;
export type Lang = (typeof LANGS)[number];

/** A memory before co-creation: a preset deck item, or a drafted inbox item. */
export interface DeckItem {
  id: string;
  /** Short label for the alcove: "cat", "CN X". */
  cue: string;
  /** The recall prompt: 'What is "cat" in Japanese?'. */
  question: string;
  /** Language the answer is spoken in. */
  lang: Lang;
  /** What recall is checked against; first entry is the display form. */
  answers: string[];
  /** Romanised display, e.g. "neko". */
  display: string;
  gestureHint: string;
  /** Scene options to choose from: three for a free item, one for a journey stop (its scene is part of the story). */
  scenes: SceneSpec[];
  /** Journey items: the story line that carries you from this stop to the next. */
  link?: string;
  /** Journey items: the room (group) this stop belongs to, e.g. "Nerves of the eye". */
  room?: string;
}

export type Grade = 'again' | 'hard' | 'good' | 'easy';

export interface GestureSignature {
  /** 'hands' = WebXR joints, 'pointer' = mouse path. Matching is only done within one modality. */
  modality: 'hands' | 'pointer';
  takes: [number[][], number[][]];
  tolerance: number;
}

export interface Memory {
  id: string;
  cue: string;
  question: string;
  lang: Lang;
  answers: string[];
  display: string;
  mnemonic: string;
  scene: SceneSpec;
  twist?: string;
  gesture?: GestureSignature;
  /** Part of an ordered journey: which one, this stop's position (0-based), and the story line to the next stop. */
  journey?: { id: string; name: string; index: number; link?: string };
  topic: string;
  goalId?: string;
  goalWeight: number;
  slot: number;
  createdAt: number;
}

/** A drafted item waiting in the inbox until the user co-creates it. */
export interface InboxItem {
  id: string;
  source: 'voice' | 'phone' | 'agent';
  topic: string;
  goalId?: string;
  /** Set when the item is one stop of a journey built by the World Builder; the headset places them together, in order. */
  item: DeckItem & { journey?: { id: string; name: string; index: number; room?: string } };
  createdAt: string;
}

export interface Goal {
  id: string;
  name: string;
  /** YYYY-MM-DD */
  deadline: string;
  target: number;
}

export interface Review {
  /** Client-generated; makes sync idempotent. */
  id: string;
  memoryId: string;
  at: number;
  grade: Grade;
  answerOk: boolean;
  gestureScore: number | null;
  latencyMs: number;
  source?: 'headset' | 'phone';
}
