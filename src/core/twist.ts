import { PROP_HEIGHT } from '../shared/props-catalog';
import type { PropId, SceneSpec } from '../shared/types';

/**
 * Offline twist parser: maps spoken words onto the prop kit and colours.
 * ponytail: keyword lookup, not language understanding. The cloud LLM pipeline replaces this
 * for captured items; the preset deck must work with no network, so this stays as the fallback.
 */

const COLORS: Record<string, string> = {
  red: '#d94848', blue: '#2f6fd1', green: '#3f9a4f', yellow: '#f2c230', orange: '#e8873a',
  purple: '#7a4fbf', pink: '#e87aa8', black: '#2b2b2b', white: '#f2f2f2', gold: '#e0a628',
  brown: '#8a5a32', grey: '#8a8a8a', gray: '#8a8a8a',
};

const PROPS: Record<string, PropId> = {
  glasses: 'glasses', spectacles: 'glasses', hat: 'hat', cap: 'hat', ball: 'ball', star: 'star',
  umbrella: 'umbrella', book: 'book', bird: 'bird', tree: 'tree', sun: 'sun', cloud: 'cloud',
  shoe: 'shoe', shoes: 'shoe', house: 'house', home: 'house', cat: 'cat', dog: 'dog',
};

export interface Twist {
  color?: string;
  add: PropId[];
}

export function parseTwist(text: string): Twist {
  const words = text.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const color = words.map((w) => COLORS[w]).find(Boolean);
  const add = [...new Set(words.map((w) => PROPS[w]).filter((p): p is PropId => !!p))].slice(0, 2);
  return { color, add };
}

export const isEmptyTwist = (t: Twist) => !t.color && t.add.length === 0;

/** Wearables sit on top of the main prop; other additions stand beside it. */
const WEARABLE: PropId[] = ['glasses', 'hat'];

export function applyTwist(scene: SceneSpec, twist: Twist): SceneSpec {
  const props = scene.props.map((p) => ({ ...p }));
  const main = props[scene.focus ?? 0];
  // Wearables sit just under the top of the main prop's painting (its head), a little toward its face (+x).
  const mainTop = main ? PROP_HEIGHT[main.prop] * 0.92 : 0;
  if (twist.color && main) main.color = twist.color;
  twist.add.forEach((prop, i) => {
    if (WEARABLE.includes(prop) && main) {
      const s = main.scale ?? 1;
      props.push({ prop, pos: [main.pos[0] + 0.035 * s, main.pos[1] + mainTop * s, main.pos[2]], scale: 0.6 * s, rot: main.rot });
    } else {
      props.push({ prop, pos: [0.11 - i * 0.22, 0, 0.08], scale: 0.6 });
    }
  });
  return { ...scene, props };
}
