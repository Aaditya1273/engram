import * as THREE from 'three';
import { answerMatches } from '../core/answer';
import { beatMs, flightMs, musicLevel, nextPick, RUSH_MS, rushPoints, weekKey } from '../core/rush';
import type { Memory } from '../shared/types';
import { beat, play } from './audio';
import type { Ctx } from './flows';
import { listen, speechAvailable } from './speech';
import { glowTexture, Panel } from './ui';

const lanternTex = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}art/props/lantern.webp`);
lanternTex.colorSpace = THREE.SRGBColorSpace;

/** The lane: lanterns start far down the room and arrive just in front of the seated user. */
const FROM = new THREE.Vector3(0, 1.5, -2.6), TO = new THREE.Vector3(0, 1.3, -1.1);
const shuffle = <T>(a: T[]) => a.map((v) => [Math.random(), v] as const).sort((x, y) => x[0] - y[0]).map((x) => x[1]);

/**
 * Recall Rush: 90 seconds against your own memories. One lantern at a time flies in carrying a cue; say the
 * answer or pick it before it arrives. Every answer is a real FSRS review, so playing is studying.
 * One lantern, one glow and one cue panel on screen at a time: a handful of draw calls.
 */
export async function recallRush(ctx: Ctx) {
  const { stage, palace, store } = ctx;
  const pool = store.data.memories;
  if (pool.length < 3) {
    await stage.say('Recall Rush needs at least three memories in your palace. Build a palace first.', 'Recall Rush');
    return;
  }
  await stage.say('Recall Rush. Ninety seconds. Answer each lantern before it reaches you. Every one in a row speeds it up.', 'Recall Rush');
  await stage.countdown('Recall Rush');

  // The flying lantern, its glow, and the cue it carries.
  const lane = new THREE.Group();
  const lantern = new THREE.Sprite(new THREE.SpriteMaterial({ map: lanternTex, transparent: true, depthWrite: false }));
  lantern.scale.set(0.14, 0.29, 1);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.setScalar(0.6);
  // The question rides on the lantern as a short tag; the full question sits on the caption card, where it reads.
  const cue = new Panel(0.36, 0.09, { size: 0.03, frame: 'pill' });
  cue.position.y = 0.22;
  const flyer = new THREE.Group();
  flyer.add(glow, lantern, cue);
  lane.add(flyer);
  palace.root.add(lane);

  let combo = 0, best = 0, score = 0, right = 0, total = 0, step = 0;
  let flight = { from: 0, ms: 1 }, sinceBeat = 0, elapsed = 0;
  const tick = (dt: number) => {
    elapsed += dt * 1000;
    const p = Math.min(1, (elapsed - flight.from) / flight.ms);
    flyer.position.lerpVectors(FROM, TO, p * p * (3 - 2 * p));
    glow.material.opacity = 0.5 + 0.5 * p;
    sinceBeat += dt * 1000;
    if (sinceBeat >= beatMs(combo)) {
      sinceBeat = 0;
      beat(step++, musicLevel(combo));
    }
  };
  palace.tickers.add(tick);

  const recent: string[] = [];
  try {
    while (elapsed < RUSH_MS) {
      await stage.whilePaused();
      const m = nextPick(pool, (x) => store.recall(x), recent);
      recent.push(m.id);
      const ms = flightMs(combo);
      flight = { from: elapsed, ms };
      cue.set({ body: m.cue });
      stage.show(m.question, `Score ${score} · combo ${combo} · ${Math.max(0, Math.ceil((RUSH_MS - elapsed) / 1000))} s left`);
      const others = shuffle(pool.filter((o) => o.display !== m.display)).slice(0, 2).map((o) => o.display);
      const t0 = performance.now();
      const answer = await firstAnswer(ctx, m, shuffle([m.display, ...others]), ms);
      const latencyMs = performance.now() - t0;
      const ok = answer !== null && (answer === m.display || answerMatches([answer], m.answers));
      total++;
      store.addReview({ memoryId: m.id, at: store.now(), grade: ok ? (latencyMs < ms * 0.6 ? 'good' : 'hard') : 'again', answerOk: ok, gestureScore: null, latencyMs: Math.round(latencyMs), source: 'headset' });
      if (ok) {
        right++;
        score += rushPoints(combo, latencyMs, ms);
        combo++;
        best = Math.max(best, combo);
        play('tick');
        glow.scale.setScalar(1.1);
        setTimeout(() => glow.scale.setScalar(0.6), 220);
      } else {
        combo = 0;
        play('miss');
        stage.show(`It was ${m.display}.`, `Score ${score} · combo 0`);
        await stage.sleep(900);
      }
    }
  } finally {
    palace.tickers.delete(tick);
    palace.root.remove(lane);
    cue.dispose();
    stage.clearRow();
  }

  const week = weekKey(store.now());
  const prev = store.data.rush ?? { best: 0, bestCombo: 0, week, weekBest: 0 };
  const weekBest = prev.week === week ? prev.weekBest : 0;
  const newBest = score > prev.best;
  store.data.rush = { best: Math.max(prev.best, score), bestCombo: Math.max(prev.bestCombo, best), week, weekBest: Math.max(weekBest, score) };
  store.save();
  void ctx.cloud.sync();
  void ctx.cloud.reportRush(store.data.rush.best);
  play(newBest ? 'relight' : 'light');
  await stage.say(
    `${score} points. ${right} of ${total} right, best combo ${best}.${newBest ? ' A new personal best!' : ` Your best is ${prev.best}.`}`,
    newBest ? 'New best' : 'Recall Rush',
  );
}

/** The first of: a picked answer, a spoken one, or the lantern arriving (null). */
function firstAnswer(ctx: Ctx, m: Memory, options: string[], ms: number): Promise<string | null> {
  const { stage, store } = ctx;
  return new Promise((res) => {
    let done = false;
    const finish = (v: string | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      stage.clearRow();
      heard?.stop();
      res(v);
    };
    const timer = setTimeout(() => finish(null), ms);
    void stage.ask(options.map((o) => ({ label: o, value: o }))).then(finish);
    const heard = speechAvailable() ? listen(m.lang ?? store.data.settings.answerLang, ms) : null;
    void heard?.result.then((alts) => {
      const hit = alts.find((a) => answerMatches([a], m.answers));
      if (hit) finish(m.display);
      else if (alts.length) finish(alts[0]);
    });
  });
}
