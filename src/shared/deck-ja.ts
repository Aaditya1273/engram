import type { DeckItem } from './types';

/**
 * Preset first-five-minutes deck. Ships with the build: no network, no AI call.
 * Laid out for the painted props: a pedestal top is about ±0.11 wide in scene units, so each scene keeps to
 * one to three props that fit it, layered front to back rather than crowded side by side.
 */
export const JA_STARTER: DeckItem[] = [
  {
    id: 'ja-neko',
    cue: 'cat',
    question: 'What is "cat" in Japanese?',
    lang: 'ja-JP',
    display: 'neko',
    answers: ['neko', 'ねこ', 'ネコ', '猫'],
    gestureHint: 'Stroke a cat along its back',
    scenes: [
      { mnemonic: 'A cat curled around your NECK, purring "neko".', props: [
        { prop: 'cat-hug', pos: [0, 0, 0] },
      ] },
      { mnemonic: 'A cat sneaks up a NECK-tall tower of books.', props: [
        { prop: 'cat-books', pos: [0, 0, 0] },
      ] },
      { mnemonic: '"Neko, neko!" A cat chases a ball under the sun.', props: [
        { prop: 'cat-ball', pos: [0, 0, 0] },
        { prop: 'sun', pos: [0.05, 0.15, -0.03], scale: 0.45 },
      ] },
    ],
  },
  {
    id: 'ja-inu',
    cue: 'dog',
    question: 'What is "dog" in Japanese?',
    lang: 'ja-JP',
    display: 'inu',
    answers: ['inu', 'いぬ', 'イヌ', '犬'],
    gestureHint: 'Pat a dog on the head',
    scenes: [
      { mnemonic: 'A dog leaps up: "I knew you\'d come!" (i-nu).', props: [
        { prop: 'dog', pos: [0, 0, 0], scale: 1.2 },
      ] },
      { mnemonic: 'A dog fetches a shoe, IN-side yoUr house.', focus: 1, props: [
        { prop: 'house', pos: [0.01, 0, -0.05], scale: 0.75 },
        { prop: 'dog', pos: [-0.045, 0, 0.04], scale: 0.55 },
        { prop: 'shoe', pos: [0.055, 0, 0.05], scale: 0.5 },
      ] },
      { mnemonic: 'A dog wearing a hat, howling "iii-nuuu".', props: [
        { prop: 'dog-hat', pos: [0, 0, 0] },
      ] },
    ],
  },
  {
    id: 'ja-mizu',
    cue: 'water',
    question: 'What is "water" in Japanese?',
    lang: 'ja-JP',
    display: 'mizu',
    answers: ['mizu', 'みず', 'ミズ', '水'],
    gestureHint: 'Let rain fall: wiggle your fingers downward',
    scenes: [
      { mnemonic: 'MIst sprays from a fountain: cool water, "mizu".', props: [
        { prop: 'fountain', pos: [0, 0, 0], scale: 0.85 },
        { prop: 'drop', pos: [-0.028, 0.152, 0.01], scale: 0.28 },
        { prop: 'drop', pos: [0.03, 0.162, 0.01], scale: 0.32 },
      ] },
      { mnemonic: 'A cloud says "Me? Zoo!" and rains on a zoo of animals.', props: [
        { prop: 'cloud', pos: [0, 0.138, 0], scale: 0.62 },
        { prop: 'drop', pos: [-0.026, 0.09, 0.01], scale: 0.24 },
        { prop: 'drop', pos: [0.028, 0.1, 0.01], scale: 0.24 },
        { prop: 'dog', pos: [-0.032, 0, 0.02], scale: 0.5 },
        { prop: 'cat', pos: [0.032, 0, 0.02], scale: 0.5, color: '#f2f2f2' },
      ] },
      { mnemonic: 'You MISS the umbrella and water soaks you.', props: [
        { prop: 'umbrella', pos: [-0.02, 0, 0], scale: 0.55 },
        { prop: 'drop', pos: [0.056, 0.105, 0.02], scale: 0.3 },
        { prop: 'drop', pos: [0.064, 0.045, 0.02], scale: 0.28 },
      ] },
    ],
  },
  {
    id: 'ja-yama',
    cue: 'mountain',
    question: 'What is "mountain" in Japanese?',
    lang: 'ja-JP',
    display: 'yama',
    answers: ['yama', 'やま', 'ヤマ', '山'],
    gestureHint: 'Trace a mountain peak in the air',
    scenes: [
      { mnemonic: 'You YAWN at the top of a mountain: "yaaa-ma".', props: [
        { prop: 'summit', pos: [0, 0, 0], scale: 0.95 },
      ] },
      { mnemonic: '"YA, MA!" A child shouts from a snowy mountain.', props: [
        { prop: 'mountain', pos: [0, 0, 0], scale: 0.65 },
        { prop: 'sun', pos: [0.055, 0.17, -0.04], scale: 0.4 },
      ] },
      { mnemonic: 'A star lands on a mountain: "Yay, ma!"', props: [
        { prop: 'mountain', pos: [0, 0, 0], scale: 0.65 },
        { prop: 'star', pos: [0, 0.155, 0], scale: 0.4 },
      ] },
    ],
  },
  {
    id: 'ja-hon',
    cue: 'book',
    question: 'What is "book" in Japanese?',
    lang: 'ja-JP',
    display: 'hon',
    answers: ['hon', 'ほん', 'ホン', '本'],
    gestureHint: 'Open a book in front of your chest',
    scenes: [
      { mnemonic: 'A bird HONKS as it flies out of an open book.', props: [
        { prop: 'book', pos: [0, 0, 0], scale: 1.1 },
        { prop: 'bird', pos: [0.015, 0.125, 0], scale: 0.7 },
      ] },
      { mnemonic: 'HONey drips on a book.', props: [
        { prop: 'book', pos: [0, 0, 0], scale: 1.1 },
        { prop: 'drop', pos: [0, 0.115, 0], scale: 0.5, color: '#e0a628' },
      ] },
      { mnemonic: 'HONest truth: a gold star shines over a book.', props: [
        { prop: 'book', pos: [0, 0, 0], scale: 1.1 },
        { prop: 'star', pos: [0, 0.135, 0], scale: 0.5 },
      ] },
    ],
  },
  {
    id: 'ja-kasa',
    cue: 'umbrella',
    question: 'What is "umbrella" in Japanese?',
    lang: 'ja-JP',
    display: 'kasa',
    answers: ['kasa', 'かさ', 'カサ', '傘'],
    gestureHint: 'Lift an umbrella and push it open',
    scenes: [
      { mnemonic: 'An umbrella is your little CASA (house) in the rain.', props: [
        { prop: 'umbrella', pos: [0, 0, 0], scale: 0.75 },
        { prop: 'house', pos: [0, 0, 0.02], scale: 0.44 },
        { prop: 'drop', pos: [0.08, 0.19, 0], scale: 0.3 },
      ] },
      { mnemonic: 'A CASH-filled umbrella spills coins.', props: [
        { prop: 'umbrella', pos: [0, 0, 0], scale: 0.75 },
        { prop: 'coins', pos: [0.02, 0, 0.05], scale: 0.9 },
      ] },
      { mnemonic: 'A cat hides under an umbrella: "Ka-sa, it\'s raining!"', props: [
        { prop: 'umbrella', pos: [0, 0, 0], scale: 0.75 },
        { prop: 'cat', pos: [0, 0, 0.03], scale: 0.52, color: '#444444' },
        { prop: 'cloud', pos: [0.05, 0.19, -0.04], scale: 0.4 },
      ] },
    ],
  },
];
