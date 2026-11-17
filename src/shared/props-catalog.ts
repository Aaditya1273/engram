import type { PropId } from './types';

/** The prop kit's ids. Kept free of three.js so the server and the AI pipeline can import it. */
export const PROP_IDS: PropId[] = [
  'cat', 'dog', 'bird', 'book', 'umbrella', 'house', 'mountain', 'tree', 'drop', 'cloud',
  'fountain', 'glasses', 'hat', 'ball', 'star', 'shoe', 'sun', 'person',
];

/** Whole-scene paintings: a boy with a cat hugging his neck; a snowy peak with someone on top; a cat on books; a cat with a ball. */
export const SCENE_ART_IDS: PropId[] = ['cat-hug', 'summit', 'cat-books', 'cat-ball'];

/** Height in metres at scale 1 (the painting's height, or the primitive's). Twists use it to seat a hat on top. */
export const PROP_HEIGHT: Record<PropId, number> = {
  cat: 0.12, dog: 0.11, bird: 0.08, book: 0.09, umbrella: 0.24, house: 0.15, mountain: 0.2, tree: 0.18,
  drop: 0.08, cloud: 0.09, fountain: 0.17, glasses: 0.03, hat: 0.05, ball: 0.07, star: 0.1, shoe: 0.07,
  sun: 0.12, person: 0.17, 'cat-hug': 0.19, summit: 0.2, 'cat-books': 0.18, 'cat-ball': 0.09,
};

/** Width ÷ height of each prop's painting (person: the primitive). With PROP_HEIGHT this gives a prop's footprint. */
export const PROP_ASPECT: Record<PropId, number> = {
  cat: 0.95, dog: 1.12, bird: 1.5, book: 1.23, umbrella: 1.25, house: 1.23, mountain: 1.67, tree: 1.08,
  drop: 0.78, cloud: 1.63, fountain: 1.04, glasses: 2.67, hat: 1.75, ball: 0.96, star: 1.06, shoe: 1.28,
  sun: 1.05, person: 0.7, 'cat-hug': 0.7, summit: 1.35, 'cat-books': 0.88, 'cat-ball': 1.96,
};
