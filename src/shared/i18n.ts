/**
 * English and Simplified Chinese. English is the default; the choice is remembered per device (localStorage)
 * and can be forced with ?lang=zh / ?lang=en. In-app strings are keyed by their English text, so `t('Next stop')`
 * reads like the code it replaces and falls back to English for anything not yet translated.
 * ponytail: the most visible text (website, menus, onboarding, journeys) is translated; deeper flows stay English.
 */
export type Lang = 'en' | 'zh';
const KEY = 'atrium:lang';

let lang: Lang = (() => {
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'zh' || q === 'en') {
      localStorage.setItem(KEY, q);
      return q;
    }
    return localStorage.getItem(KEY) === 'zh' ? 'zh' : 'en';
  } catch {
    return 'en';
  }
})();

export const getLang = () => lang;
export function setLang(l: Lang) {
  lang = l;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    // private mode: this page only
  }
}

/** The speech-synthesis / caption locale for the current language. */
export const speechLocale = () => (lang === 'zh' ? 'zh-CN' : 'en-US');

const ZH: Record<string, string> = {
  // Menus and buttons
  Start: '开始', Practise: '练习', Journeys: '记忆之旅', 'Recall Rush': '记忆冲刺', 'Build a palace': '建造宫殿', 'More…': '更多…',
  'Remember this': '记住这个', 'Ask an agent': '让助手发送', Settings: '设置', Back: '返回', 'Quiz me': '考考我', Collection: '收藏',
  'Daily challenge': '每日挑战', 'Memory Athlete': '记忆运动员', 'Print a keepsake': '打印纪念品', 'Next stop': '下一站', Done: '完成',
  'Walk it in': '走进去', 'Walk it': '走一遍', Later: '稍后', Discard: '丢弃', Forwards: '正序', Backwards: '倒序', 'By number': '按编号',
  'Rehearse it': '排练', 'Share it': '分享', 'Not really': '不太会', 'A few': '几个', 'All ten': '全部十个', "I'm ready": '我准备好了',
  Next: '下一个', Previous: '上一个', 'Take the test': '开始测试', "Today's practice": '今日练习', 'Test again': '再测一次',
  'Back to the palace': '回到宫殿', 'Copy a shared palace': '复制分享的宫殿', 'Japanese words': '日语单词', 'English words': '英语单词',
  'Type my own': '自己输入', 'Red hat': '红帽子', Glasses: '眼镜', 'Make it gold': '变成金色', Skip: '跳过', 'Save the clip': '保存片段',
  'Language: English': '语言：中文', "I'm done": '我说完了',
  // Titles
  Atrium: 'Atrium', Lumen: '光灵', 'Quick test': '小测验', Turning: '转动', 'Your path': '你的路径', Recall: '回忆', Jump: '跳跃',
  'All lanterns lit': '灯笼全亮', 'An empty palace': '空荡的宫殿', 'Welcome back': '欢迎回来',
  // Onboarding narration
  "Welcome. I'm Lumen. I'll show you how memory champions remember anything. Point at the glowing lantern, and click to light it.":
    '欢迎。我是光灵。我会教你记忆冠军如何记住任何东西。指向发光的灯笼，点击点亮它。',
  "Welcome. I'm Lumen. I'll show you how memory champions remember anything. Look at the glowing lantern, and pinch to light it.":
    '欢迎。我是光灵。我会教你记忆冠军如何记住任何东西。看向发光的灯笼，捏合手指点亮它。',
  'Quick test first. Can you name the first ten chemical elements, in order? Try it now, out loud.': '先来个小测验。你能按顺序说出前十个化学元素吗？现在大声试试。',
  'Listening… say as many as you can, in order.': '正在聆听……按顺序尽量多说。',
  "Most people can't.": '大多数人做不到。',
  "In three minutes you'll know all ten, forwards and backwards.": '三分钟后，你会正背倒背全部十个。',
  'Now the lights go down. The path is in your head. Walk it.': '现在灯光暗下。路径已在你脑中。走一遍吧。',
  'Last one. No walking this time.': '最后一题。这次不用走。',
  "That's how memory champions do it. Tomorrow I'll check you again, for just a few minutes.": '记忆冠军就是这样做的。明天我会再考你几分钟。',
  // Journey prompts
  "From the start. What's at number 1?": '从头开始。第1站是什么？',
  'Pick the answer.': '选出答案。',
  'Build a palace from anything you need to remember, or walk a journey.': '用任何你需要记住的内容建造宫殿，或走一段记忆之旅。',
};

/** In-app text in the current language (English when there's no translation yet). */
export const t = (en: string) => (lang === 'zh' ? ZH[en] ?? en : en);

/** Templates with numbers: t2('Next stop, number {n}?', { n: 3 }). */
const ZH_T: Record<string, string> = {
  'Next stop, number {n}?': '下一站，第{n}站？',
  'And before that, number {n}?': '再往前，第{n}站？',
  "Backwards now. What's at the end, number {n}?": '现在倒着来。最后一站，第{n}站是什么？',
  "What's number {n}?": '第{n}站是什么？',
  '{a} of {b} forwards. Now the hard part: backwards.': '正序 {a}/{b}。现在难的来了：倒序。',
  'You got {n} in order.': '你按顺序说对了{n}个。',
  'This is your path: {n} pedestals, in order. A gold medallion marks every fifth one.': '这是你的路径：{n}个底座，按顺序排列。每第五个有一枚金色徽章。',
};
export function t2(en: string, vars: Record<string, string | number>): string {
  const tpl = lang === 'zh' ? ZH_T[en] ?? en : en;
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

/** Website copy, by data-i18n key: [English, Chinese]. */
export const SITE: Record<string, [string, string]> = {
  tagline: ['Paste anything. Walk through it. Never forget it.', '粘贴任何内容，走进它，永远记住它。'],
  enter: ['Enter Atrium', '进入 Atrium'],
  desktop: ['Try on Desktop', '在电脑上试用'],
  vrNote: ['To step inside in VR, open this page in the Meta Quest browser.', '要在 VR 中进入，请在 Meta Quest 浏览器中打开此页面。'],
  howEyebrow: ['How it works', '如何运作'],
  howTitle: ['Anything becomes a world you walk through', '任何内容，都能变成可以走进去的世界'],
  howLede: ['Atrium turns notes, a chapter or a talk into a journey through your palace: a vivid 3D scene at every stop, each one leading to the next. The order is kept, which flashcards lose.',
    'Atrium 把笔记、章节或演讲变成穿过你记忆宫殿的旅程：每一站都是生动的 3D 场景，一站连着一站。顺序被保留下来，而这正是闪卡做不到的。'],
  s1Title: ['Paste anything', '粘贴任何内容'],
  s1Text: ['A chapter, a speech, a list, a web page or a PDF. Or just say a topic: “the twelve cranial nerves”.', '一章书、一篇演讲、一份清单、一个网页或 PDF。或者只说一个主题：“十二对脑神经”。'],
  s2Title: ['Walk through it', '走进它'],
  s2Text: ['Every stop is a real 3D scene, and anything you name becomes its own object. Write each one with a gesture of your own.', '每一站都是真实的 3D 场景，你说出的任何东西都会变成专属物件。用你自己的手势写下每一个。'],
  s3Title: ['Never forget it', '永远记住它'],
  s3Text: ['Lanterns dim as memories fade. Recall forwards, backwards or straight to number seven, and they bloom back to gold.', '记忆淡去时灯笼变暗。正序、倒序或直接跳到第七站回忆，它们就会重新绽放金光。'],
  firstEyebrow: ['Your first five minutes', '你的前五分钟'],
  firstTitle: ['The first ten elements, forwards and backwards', '前十个化学元素，正背倒背'],
  firstLede: ["Most adults can't name them in order. Five minutes later you can: forwards, backwards, and straight to number seven. Offline, no account, no typing.",
    '大多数成年人无法按顺序说出它们。五分钟后你可以：正背、倒背，还能直接说出第七个。离线、无需账号、无需打字。'],
  castNote: ['And a cast of 3D props for everything you add yourself.', '还有一整套 3D 道具，供你添加自己的内容。'],
  promiseEyebrow: ['The promise', '承诺'],
  promiseTitle: ['You never fall behind', '你永远不会落后'],
  promiseLede: ['Most study apps punish a missed week with a mountain of reviews. Atrium does the opposite.', '大多数学习应用会用堆积如山的复习惩罚你错过的一周。Atrium 恰恰相反。'],
  companionEyebrow: ['Off the headset', '摘下头显之后'],
  companionTitle: ['Your palace, in your pocket', '口袋里的记忆宫殿'],
  companionLede: ['The companion app pairs with a six-letter code: build palaces from text, a web page or a PDF, play the daily challenge, and see your friends.', '配套应用用六位代码配对：用文字、网页或 PDF 建造宫殿，参加每日挑战，查看好友。'],
  closingEyebrow: ['Ready when you are', '准备好了就开始'],
  closingTitle: ['Your palace is waiting', '你的宫殿在等你'],
  closingLede: ["Five minutes, ten elements, and a memory you didn't know you had.", '五分钟，十个元素，以及你从未发现的记忆力。'],
  hint: ['Sit down, put the controllers away and raise your hands. On desktop: point with the mouse, click to select, arrow keys to turn, Esc to pause.',
    '坐下，放下手柄，举起双手。在电脑上：用鼠标指向，点击选择，方向键转动，Esc 暂停。'],
};

/** Fills every [data-i18n] element in the page with the current language. */
export function applySite(root: ParentNode = document) {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const entry = SITE[el.dataset.i18n!];
    if (!entry) continue;
    // Keep any icon inside a button; replace only its text.
    const text = [...el.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim());
    if (text) text.textContent = entry[lang === 'zh' ? 1 : 0];
    else el.textContent = entry[lang === 'zh' ? 1 : 0];
  }
}
