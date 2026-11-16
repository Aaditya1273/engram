import type { DeckItem } from './types';

/** Preset first-five-minutes deck. Ships with the build: no network, no AI call. */
export const JA_STARTER: DeckItem[] = [
  {
    id: 'ja-neko',
    cue: 'cat',
    display: 'neko',
    answers: ['neko', 'ねこ', 'ネコ', '猫'],
    gestureHint: 'Stroke a cat along its back',
    scenes: [
      { mnemonic: 'A cat curled around your NECK, purring "neko".', focus: 1, props: [
        { prop: 'person', pos: [0, 0, 0] },
        { prop: 'cat', pos: [0, 0.095, 0.035], scale: 0.55, color: '#e8873a' },
      ] },
      { mnemonic: 'A cat sneaks up a NECK-tall tower of books.', focus: 2, props: [
        { prop: 'book', pos: [0, 0, 0], color: '#7a4fbf' },
        { prop: 'book', pos: [0, 0.04, 0], color: '#3a7fbf', rot: 0.3 },
        { prop: 'cat', pos: [0, 0.08, 0], scale: 0.8, color: '#444444' },
      ] },
      { mnemonic: '"Neko, neko!" A cat chases a ball under the sun.', props: [
        { prop: 'cat', pos: [-0.06, 0, 0], color: '#f2f2f2' },
        { prop: 'ball', pos: [0.09, 0, 0.03], color: '#d94848' },
        { prop: 'sun', pos: [0.08, 0.2, -0.05], scale: 0.6 },
      ] },
    ],
  },
  {
    id: 'ja-inu',
    cue: 'dog',
    display: 'inu',
    answers: ['inu', 'いぬ', 'イヌ', '犬'],
    gestureHint: 'Pat a dog on the head',
    scenes: [
      { mnemonic: 'A dog leaps up: "I knew you\'d come!" (i-nu).', props: [
        { prop: 'dog', pos: [-0.04, 0, 0], color: '#b07a3e' },
        { prop: 'person', pos: [0.08, 0, -0.02], scale: 0.9 },
      ] },
      { mnemonic: 'A dog fetches a shoe, IN-side yoUr house.', focus: 1, props: [
        { prop: 'house', pos: [0, 0, -0.06], scale: 0.9, color: '#c9a36b' },
        { prop: 'dog', pos: [-0.05, 0, 0.07], scale: 0.8, color: '#333333' },
        { prop: 'shoe', pos: [0.07, 0, 0.07], color: '#2f6fd1' },
      ] },
      { mnemonic: 'A dog wearing a hat, howling "iii-nuuu".', props: [
        { prop: 'dog', pos: [0, 0, 0], color: '#e0c08a' },
        { prop: 'hat', pos: [0.035, 0.115, 0], scale: 0.6, color: '#2b2b2b' },
      ] },
    ],
  },
  {
    id: 'ja-mizu',
    cue: 'water',
    display: 'mizu',
    answers: ['mizu', 'みず', 'ミズ', '水'],
    gestureHint: 'Let rain fall: wiggle your fingers downward',
    scenes: [
      { mnemonic: 'MIst sprays from a fountain: cool water, "mizu".', props: [
        { prop: 'fountain', pos: [0, 0, 0], color: '#8fb8d8' },
        { prop: 'drop', pos: [0.05, 0.18, 0], scale: 0.5 },
        { prop: 'drop', pos: [-0.05, 0.16, 0.02], scale: 0.4 },
      ] },
      { mnemonic: 'A cloud says "Me? Zoo!" and rains on a zoo of animals.', props: [
        { prop: 'cloud', pos: [0, 0.19, 0], scale: 0.8 },
        { prop: 'drop', pos: [-0.04, 0.12, 0], scale: 0.4 },
        { prop: 'drop', pos: [0.04, 0.1, 0], scale: 0.4 },
        { prop: 'dog', pos: [-0.06, 0, 0.03], scale: 0.6, color: '#b07a3e' },
        { prop: 'cat', pos: [0.06, 0, 0.03], scale: 0.6, color: '#e8873a' },
      ] },
      { mnemonic: 'You MISS the umbrella and water soaks you.', props: [
        { prop: 'umbrella', pos: [-0.07, 0, 0], scale: 0.8, color: '#d94848' },
        { prop: 'person', pos: [0.06, 0, 0] },
        { prop: 'drop', pos: [0.06, 0.24, 0], scale: 0.5 },
      ] },
    ],
  },
  {
    id: 'ja-yama',
    cue: 'mountain',
    display: 'yama',
    answers: ['yama', 'やま', 'ヤマ', '山'],
    gestureHint: 'Trace a mountain peak in the air',
    scenes: [
      { mnemonic: 'You YAWN at the top of a mountain: "yaaa-ma".', props: [
        { prop: 'mountain', pos: [0, 0, 0], color: '#6f8a6b' },
        { prop: 'person', pos: [0, 0.2, 0], scale: 0.5 },
      ] },
      { mnemonic: '"YA, MA!" A child shouts from a snowy mountain.', props: [
        { prop: 'mountain', pos: [-0.04, 0, 0], color: '#7d8fa3' },
        { prop: 'mountain', pos: [0.08, 0, -0.04], scale: 0.7, color: '#8ea08b' },
        { prop: 'sun', pos: [0.1, 0.22, -0.06], scale: 0.5 },
      ] },
      { mnemonic: 'A star lands on a mountain: "Yay, ma!"', props: [
        { prop: 'mountain', pos: [0, 0, 0], color: '#a37d5c' },
        { prop: 'star', pos: [0, 0.26, 0], scale: 0.7 },
        { prop: 'tree', pos: [-0.1, 0, 0.05], scale: 0.6 },
      ] },
    ],
  },
  {
    id: 'ja-hon',
    cue: 'book',
    display: 'hon',
    answers: ['hon', 'ほん', 'ホン', '本'],
    gestureHint: 'Open a book in front of your chest',
    scenes: [
      { mnemonic: 'A bird HONKS as it flies out of an open book.', props: [
        { prop: 'book', pos: [0, 0, 0], color: '#3a7fbf' },
        { prop: 'bird', pos: [0.02, 0.12, 0], color: '#f0f0f0' },
      ] },
      { mnemonic: 'HONey drips on a book.', props: [
        { prop: 'book', pos: [0, 0, 0], color: '#c94f3a' },
        { prop: 'drop', pos: [0, 0.1, 0], scale: 0.6, color: '#e0a628' },
      ] },
      { mnemonic: 'A HONest person swears on a book.', focus: 1, props: [
        { prop: 'person', pos: [-0.05, 0, 0] },
        { prop: 'book', pos: [0.07, 0, 0.03], scale: 0.9, color: '#2f2f6f' },
      ] },
    ],
  },
  {
    id: 'ja-kasa',
    cue: 'umbrella',
    display: 'kasa',
    answers: ['kasa', 'かさ', 'カサ', '傘'],
    gestureHint: 'Lift an umbrella and push it open',
    scenes: [
      { mnemonic: 'An umbrella is your little CASA (house) in the rain.', props: [
        { prop: 'umbrella', pos: [0, 0, 0], color: '#2f6fd1' },
        { prop: 'house', pos: [0, 0, 0], scale: 0.45, color: '#c9a36b' },
        { prop: 'drop', pos: [0.1, 0.22, 0], scale: 0.4 },
      ] },
      { mnemonic: 'A CASH-filled umbrella spills coins.', props: [
        { prop: 'umbrella', pos: [0, 0, 0], color: '#e0a628' },
        { prop: 'star', pos: [0.08, 0.02, 0.04], scale: 0.3, color: '#ffd24a' },
        { prop: 'star', pos: [-0.07, 0.02, 0.05], scale: 0.3, color: '#ffd24a' },
      ] },
      { mnemonic: 'A cat hides under an umbrella: "Ka-sa, it\'s raining!"', props: [
        { prop: 'umbrella', pos: [0, 0, 0], color: '#d94848' },
        { prop: 'cat', pos: [0, 0, 0.02], scale: 0.6, color: '#444444' },
        { prop: 'cloud', pos: [0.06, 0.24, -0.04], scale: 0.5 },
      ] },
    ],
  },
];
