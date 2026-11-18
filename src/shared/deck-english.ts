import type { DeckItem } from './types';

/**
 * Ten everyday English words for Chinese-speaking learners, as a journey: the question is asked in Chinese, the
 * answer is the English word, and each stop is the thing itself in 3D. The links make the ten one short story.
 */
const w = (en: string, zh: string, prop: DeckItem['scenes'][0]['props'][0]['prop'], mnemonic: string, link: string): DeckItem => ({
  id: `en-${en}`, cue: `${zh}`, question: `“${zh}”用英语怎么说？`, lang: 'en-US', display: en, answers: [en],
  gestureHint: 'Trace the shape in the air', scenes: [{ mnemonic, props: [{ prop, pos: [0, 0, 0] }] }], link,
});

export const ENGLISH_JOURNEY = { id: 'english-10', name: '10 English words · 十个英语单词' };

export const ENGLISH: DeckItem[] = [
  w('sun', '太阳', 'sun', 'SUN · 太阳：清晨，一轮金色的太阳升起。', '阳光照在一朵云上……'),
  w('cloud', '云', 'cloud', 'CLOUD · 云：一朵软软的白云飘过来。', '云下有一棵大树……'),
  w('tree', '树', 'tree', 'TREE · 树：一棵高大的绿树。', '树枝上站着一只小鸟……'),
  w('bird', '鸟', 'bird', 'BIRD · 鸟：一只蓝色的小鸟在唱歌。', '小鸟飞向一座小房子……'),
  w('house', '房子', 'house', 'HOUSE · 房子：一座长满青苔的小屋。', '屋门口趴着一只猫……'),
  w('cat', '猫', 'cat', 'CAT · 猫：一只橘猫戴着绿围巾。', '猫在追一只小狗……'),
  w('dog', '狗', 'dog', 'DOG · 狗：一只开心的小狗。', '小狗叼来一本书……'),
  w('book', '书', 'book', 'BOOK · 书：一摞金边的书。', '书上放着一把伞……'),
  w('umbrella', '伞', 'umbrella', 'UMBRELLA · 伞：一把红色的樱花伞。', '伞下面是一座山……'),
  w('mountain', '山', 'mountain', 'MOUNTAIN · 山：一座雪山。', ''),
];
