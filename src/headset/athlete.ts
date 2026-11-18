import { BASELINE_MEMORISE_MS, BASELINE_WORDS, freeRecallScore, planDay, programmeDay, PROGRAMME_DAYS } from '../core/athlete';
import { challengeItems } from '../core/challenge';
import { play } from './audio';
import type { Ctx } from './flows';
import { listen, speechAvailable } from './speech';

/**
 * Memory Athlete: the 40-day programme. Shows today's lesson and launches its practice; on day 1 and every
 * seventh day after, runs the 30-word test (5 minutes to memorise, then recall in any order) and keeps the
 * before-and-after record. `launch` opens the practice for an activity (journeys, build, challenge, rush, quiz).
 */
export async function athleteFlow(ctx: Ctx, launch: (activity: string) => Promise<void>) {
  const { stage, store } = ctx;
  const a = (store.data.athlete ??= { startedAt: store.now(), tests: [] });
  const day = programmeDay(a.startedAt, store.now());
  const today = planDay(day);
  const record = a.tests.map((t) => `Day ${t.day}: ${t.score}`).join(' → ');
  if (day === 1 && !a.tests.length) {
    await stage.say('Memory Athlete: forty days to train your memory the way champions do. People with ordinary memories have more than doubled what they can recall this way. First, a baseline: thirty words, five minutes.', 'Memory Athlete');
  }
  const due = (today.activity === 'baseline' || today.activity === 'benchmark') && !a.tests.some((t) => t.day === day);
  stage.show(`Day ${Math.min(day, PROGRAMME_DAYS)} · ${today.title}`, `${today.lesson}${record ? `\nYour record: ${record}` : ''}`);
  const go = await stage.ask([
    { label: due ? 'Take the test' : "Today's practice", value: 'go' },
    ...(!due ? [{ label: 'Test again', value: 'test' }] : []),
    { label: 'Back', value: '' },
  ]);
  if (!go) return;
  if (due || go === 'test') {
    const score = await wordTest(ctx, `athlete-${a.startedAt}-${day}`);
    if (score === null) return;
    a.tests.push({ day, score, at: store.now() });
    store.save();
    const first = a.tests[0].score;
    play('relight');
    await stage.say(a.tests.length === 1
      ? `${score} of ${BASELINE_WORDS}. That's your starting line. Come back each day; on day 8 we measure again.`
      : `${score} of ${BASELINE_WORDS}, against ${first} on day ${a.tests[0].day}. ${score > first ? `Up ${score - first}.` : 'Keep walking the method.'}`, 'Memory Athlete');
    return;
  }
  await launch(today.activity);
}

/** 30 fresh words to memorise (5 minutes, ten at a time), then free recall by voice or typing. Null if abandoned. */
async function wordTest(ctx: Ctx, seed: string): Promise<number | null> {
  const { stage, input } = ctx;
  const words = challengeItems(seed, BASELINE_WORDS);
  const until = performance.now() + BASELINE_MEMORISE_MS;
  let page = 0;
  while (performance.now() < until) {
    const left = Math.ceil((until - performance.now()) / 1000);
    stage.show(`Words ${page * 10 + 1}–${page * 10 + 10} · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} left`, words.slice(page * 10, page * 10 + 10).join(' · '));
    const step = await Promise.race([
      stage.ask([{ label: 'Previous', value: -1 }, { label: 'Next', value: 1 }, { label: "I'm ready", value: 0 }]),
      new Promise<number>((r) => setTimeout(() => r(0), Math.max(0, until - performance.now()))),
    ]);
    stage.clearRow();
    if (step === 0) break;
    page = (page + step + 3) % 3;
  }
  let recalled = '';
  if (!input.xr) {
    stage.show('Recall', 'Type every word you remember, in any order, then press Ctrl+Enter.');
    recalled = await stage.typeText('anchor, violin, …', { multiline: true });
  } else if (speechAvailable()) {
    await stage.say('Now say every word you remember, in any order. Take your time; pause when you are done.', 'Recall');
    const l = listen('en-US', 90_000, { long: true });
    stage.offer([{ label: "I'm done", onSelect: () => l.stop() }]);
    recalled = (await l.result).join(' ');
    stage.clearRow();
  } else {
    await stage.say('The word test needs speech or a keyboard. Try it on a computer or with the microphone on.', 'Memory Athlete');
    return null;
  }
  return freeRecallScore(words, recalled);
}
