import type { DeckItem } from './types';

/**
 * The default first journey: the first ten elements, in order. Universal school knowledge most adults have lost,
 * so recalling it forwards, backwards and by position is a feat anyone can see. Each element is a keyword scene
 * built from the 3D prop kit, and `link` is the story line that carries you to the next pedestal: recalling one
 * pulls the next. Landmarks (gold medallions) stand at 5 (boron) and 10 (neon).
 */
/** Chinese names are accepted answers too, for Chinese-speaking learners. */
const ZH = ['氢', '氦', '锂', '铍', '硼', '碳', '氮', '氧', '氟', '氖'];

const item = (n: number, display: string, symbol: string, mnemonic: string, props: DeckItem['scenes'][0]['props'], link: string): DeckItem => ({
  id: `el-${symbol.toLowerCase()}`,
  cue: `element ${n}`,
  question: `What is element number ${n}?`,
  lang: 'en-US',
  display,
  answers: [display, symbol, ZH[n - 1]],
  gestureHint: 'Trace the scene in the air',
  scenes: [{ mnemonic, props }],
  link,
});

export const ELEMENTS_JOURNEY = { id: 'elements-10', name: 'The first 10 elements' };

export const ELEMENTS: DeckItem[] = [
  item(1, 'Hydrogen', 'H', 'A fountain bursts like a fire HYDRANT: HYDRO-gen.', [
    { prop: 'fountain', pos: [0, 0, 0], scale: 0.85 },
    { prop: 'drop', pos: [-0.028, 0.152, 0.01], scale: 0.28 },
    { prop: 'drop', pos: [0.03, 0.162, 0.01], scale: 0.32 },
  ], 'Its spray lifts a red balloon up into the sky…'),
  item(2, 'Helium', 'He', 'A red ball floats up like a HELIUM balloon, into a cloud.', [
    { prop: 'ball', pos: [0, 0.07, 0.02], scale: 0.8 },
    { prop: 'cloud', pos: [0, 0.16, -0.02], scale: 0.6 },
  ], 'The balloon drifts down onto a cottage whose window glows…'),
  item(3, 'Lithium', 'Li', 'A little cottage, every window LIT up: LITH-ium.', [
    { prop: 'house', pos: [0, 0, 0] },
    { prop: 'star', pos: [0.06, 0.15, 0.02], scale: 0.3 },
  ], 'Out of its garden grows a tree heavy with berries…'),
  item(4, 'Beryllium', 'Be', 'A tree so heavy with BERRIES it bends: BERY-llium.', [
    { prop: 'tree', pos: [0, 0, 0] },
    { prop: 'ball', pos: [0.05, 0.02, 0.04], scale: 0.28 },
    { prop: 'ball', pos: [-0.045, 0.02, 0.05], scale: 0.24 },
  ], 'A berry drops onto a pile of BORING books…'),
  item(5, 'Boron', 'B', 'A cat falls asleep on a BORing book: BOR-on.', [
    { prop: 'cat-books', pos: [0, 0, 0] },
  ], 'The cat dreams of a dark mountain, where a diamond sparkles…'),
  item(6, 'Carbon', 'C', 'A diamond star sparkles on a mountain of coal: CARBON.', [
    { prop: 'mountain', pos: [0, 0, 0], scale: 0.7 },
    { prop: 'star', pos: [0, 0.16, 0], scale: 0.4 },
  ], 'Night falls on the mountain, and a bird settles down to sleep…'),
  item(7, 'Nitrogen', 'N', 'At NIGHT a bird sleeps under the stars: NIGHT-rogen.', [
    { prop: 'bird', pos: [0, 0.03, 0.02], scale: 0.9 },
    { prop: 'star', pos: [0.055, 0.15, -0.02], scale: 0.3 },
    { prop: 'star', pos: [-0.05, 0.13, -0.02], scale: 0.24 },
  ], 'At dawn a dog races past it, panting for air…'),
  item(8, 'Oxygen', 'O', 'A dog runs so hard it gasps for OXYGEN.', [
    { prop: 'dog', pos: [0, 0, 0] },
    { prop: 'cloud', pos: [0.06, 0.12, 0], scale: 0.3 },
  ], 'Its muddy paws skid onto a shiny floor…'),
  item(9, 'Fluorine', 'F', 'A boot skids on a freshly polished FLOOR: FLUOR-ine.', [
    { prop: 'shoe', pos: [0, 0, 0] },
  ], 'And slides right into a pair of glowing neon glasses.'),
  item(10, 'Neon', 'Ne', 'Glasses glow like a NEON sign under the sun.', [
    { prop: 'glasses', pos: [0, 0.02, 0.02], scale: 1.4 },
    { prop: 'sun', pos: [0, 0.13, -0.02], scale: 0.5 },
  ], ''),
];
