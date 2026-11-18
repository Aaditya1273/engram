import { answerMatches } from '../core/answer';
import { MEMORISE_S } from '../core/challenge';
import { PROP_IDS } from '../shared/props-catalog';
import type { PropId, SceneSpec } from '../shared/types';
import { play } from './audio';
import type { Ctx } from './flows';
import { listen, speechAvailable } from './speech';

const shuffle = <T>(a: T[]) => a.map((v) => [Math.random(), v] as const).sort((x, y) => x[0] - y[0]).map((x) => x[1]);

/** A word that names a prop stands on its pedestal as that prop; any other is its plaque alone. */
const sceneFor = (word: string): SceneSpec | null => ((PROP_IDS as string[]).includes(word) ? { mnemonic: word, props: [{ prop: word as PropId, pos: [0, 0, 0] }] } : null);

/**
 * The daily challenge (or a duel), the memory-sports "words" discipline in your own palace: 20 words along 20
 * pedestals, two and a half minutes to walk and memorise them, then recall them in order. The server scores the
 * answers on its own clock and ranks you against everyone, or just your friends.
 */
export async function dailyChallenge(ctx: Ctx, duel?: string) {
  const { stage, palace, cloud, input } = ctx;
  const title = duel ? `Duel ${duel}` : 'Daily challenge';
  if (!cloud.online) return void (await stage.say('The daily challenge needs a connection.', title));
  let run: Awaited<ReturnType<typeof cloud.challengeStart>>;
  try {
    run = await cloud.challengeStart(duel);
  } catch (e) {
    await stage.say((e as Error).message, title);
    return showBoard(ctx, duel);
  }
  const base = palace.wing * 20;
  palace.borrowed = true;
  try {
    // Lay the 20 words along the path.
    run.items.forEach((w, i) => {
      const a = palace.alcove(base + i);
      a.setScene(sceneFor(w));
      a.setLabel(`${i + 1} · ${w}`);
      a.setRecall(1, true);
      a.setLandmark((i + 1) % 5 === 0 ? i + 1 : null);
    });
    await palace.focus(base);
    await stage.say(`Twenty words, one per pedestal. You have ${Math.round(MEMORISE_S / 60 * 2) / 2} minutes. Walk the path and picture each word at its place.`, title);

    // Memorise: walk with the arrows (or the Next button); the clock is the server's, so this one is a guide.
    const until = performance.now() + MEMORISE_S * 1000;
    let at = 0;
    while (performance.now() < until) {
      const left = Math.ceil((until - performance.now()) / 1000);
      stage.show(`${at + 1} · ${run.items[at]}`, `${left} s left. ${input.xr ? 'Flick' : 'Use the arrows'} or press Next to walk on.`);
      const step = await Promise.race([
        stage.ask([{ label: 'Back', value: -1 }, { label: 'Next', value: 1 }, { label: "I'm ready", value: 0 }]),
        new Promise<number>((r) => setTimeout(() => r(0), Math.max(0, until - performance.now()))),
      ]);
      stage.clearRow();
      if (step === 0) break;
      at = Math.max(0, Math.min(run.items.length - 1, at + step));
      await palace.focus(base + at);
    }

    // Recall in order, every pedestal veiled.
    for (let i = 0; i < run.items.length; i++) palace.alcove(base + i).setVeiled(true);
    await palace.focus(base);
    await stage.say('Now walk it from the start. What was at each place?', title);
    const answers: string[] = [];
    for (let i = 0; i < run.items.length; i++) {
      await palace.focus(base + i);
      const prompt = `Number ${i + 1}?`;
      let said = '';
      if (speechAvailable()) {
        stage.show(prompt, 'Say the word, or pick it.');
        const l = listen('en-US', 5000);
        const options = shuffle([run.items[i], ...shuffle(run.items.filter((w) => w !== run.items[i])).slice(0, 2)]);
        said = await Promise.race([
          l.result.then((alts) => alts.find((a) => run.items.some((w) => answerMatches([a], [w]))) ?? alts[0] ?? ''),
          stage.ask(options.map((o) => ({ label: o, value: o }))),
        ]);
        l.stop();
        stage.clearRow();
      } else {
        stage.show(prompt, 'Pick the word.');
        const options = shuffle([run.items[i], ...shuffle(run.items.filter((w) => w !== run.items[i])).slice(0, 2)]);
        said = await stage.ask(options.map((o) => ({ label: o, value: o })));
      }
      answers.push(said);
      palace.alcove(base + i).setVeiled(false);
      play(answerMatches([said], [run.items[i]]) ? 'tick' : 'miss');
    }
    const r = await cloud.challengeFinish(run.runId, answers);
    play(r.correct >= 15 ? 'relight' : 'light');
    await stage.say(`${r.correct} of 20 in order, ${r.score} points in ${Math.floor(r.seconds / 60)} minutes ${r.seconds % 60} seconds.`, title);
  } catch (e) {
    await stage.say(`The run couldn't be scored. ${(e as Error).message}`, title);
  } finally {
    palace.borrowed = false;
    palace.onWing(palace.wing);
  }
  await showBoard(ctx, duel);
}

/** Today's top runs, everyone or friends, with you marked. */
async function showBoard(ctx: Ctx, duel?: string) {
  const { stage, cloud } = ctx;
  for (let scope: 'global' | 'friends' = 'global'; ;) {
    const b = await cloud.board(scope, duel).catch(() => null);
    if (!b) return;
    const lines = b.rows.slice(0, 6).map((r) => `${r.rank}. ${r.you ? 'You' : r.name}: ${r.correct}/20 · ${r.score}`);
    const mine = b.rows.find((r) => r.you);
    stage.show(`${duel ? `Duel ${duel}` : 'Today'} · ${scope === 'global' ? 'Everyone' : 'Friends'}`,
      lines.length ? `${lines.join('\n')}${mine && mine.rank > 6 ? `\n… ${mine.rank}. You: ${mine.score}` : ''}` : 'No runs yet today. Be the first.');
    const next: 'global' | 'friends' | null = await stage.ask<'global' | 'friends' | null>([
      { label: scope === 'global' ? 'Friends' : 'Everyone', value: scope === 'global' ? 'friends' : 'global' },
      { label: 'Back', value: null },
    ]);
    if (!next) return;
    scope = next;
  }
}
