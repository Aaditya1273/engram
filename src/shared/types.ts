export type PropId =
  | 'cat' | 'dog' | 'bird' | 'book' | 'umbrella' | 'house' | 'mountain' | 'tree'
  | 'drop' | 'cloud' | 'fountain' | 'glasses' | 'hat' | 'ball' | 'star' | 'shoe' | 'sun' | 'person';

export interface PropPlacement {
  prop: PropId;
  /** Offset on the pedestal, metres. y is up. */
  pos: [number, number, number];
  scale?: number;
  color?: string;
  /** Yaw in radians. */
  rot?: number;
}

export interface SceneSpec {
  mnemonic: string;
  props: PropPlacement[];
  /** Index of the subject prop that a twist recolours or dresses up. Default 0. */
  focus?: number;
}

/** A memory as authored (preset deck) or co-created (from inbox). */
export interface DeckItem {
  id: string;
  /** Shown in the prompt: "cat". */
  cue: string;
  /** What recall is checked against; first entry is the display form. */
  answers: string[];
  /** Romanised display, e.g. "neko". */
  display: string;
  gestureHint: string;
  scenes: [SceneSpec, SceneSpec, SceneSpec];
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
  answers: string[];
  display: string;
  mnemonic: string;
  scene: SceneSpec;
  twist?: string;
  gesture?: GestureSignature;
  topic: string;
  goalWeight: number;
  slot: number;
  createdAt: number;
}

export interface Review {
  memoryId: string;
  at: number;
  grade: Grade;
  answerOk: boolean;
  gestureScore: number | null;
  latencyMs: number;
}
