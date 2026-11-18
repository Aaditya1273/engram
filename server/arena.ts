import { challengeItems, dailyKey, MIN_RUN_S, RUN_LIMIT_S, scoreChallenge } from '../src/core/challenge';
import { weekKey } from '../src/core/rush';
import { MAX_FREEZES, MILESTONES } from '../src/core/streak';
import { DESIRED_RETENTION } from '../src/core/model';
import { newId } from './auth';
import { db } from './db';
import { getStreak, loadKnowledge } from './ops';

/**
 * The social layer, built to reward remembering, not grinding: friends see streaks and lanterns relit, never
 * memories; leagues rank by memories kept (recall at or above the retention target), not reviews done; the
 * daily challenge is scored on the server from the answers and the server's own clock.
 */

const COLORS = ['#D9B76E', '#7FB685', '#E89F71', '#8FB3D9', '#C79BD1', '#E6C35C'];
/** Friend codes: 6 letters without look-alikes (no I, O, 0, 1). */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code = (n = 6) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => ALPHABET[b % ALPHABET.length]).join('');
const LEAGUE_SIZE = 20;

interface Profile { user_id: string; name: string; color: string; code: string; rush_best: number; anonymous: boolean }

/** Every account gets a profile on first use: a friendly default name and a colour. */
export async function profile(userId: string): Promise<Profile> {
  const q = await db();
  const [p] = await q<Profile>('select * from profiles where user_id = $1', [userId]);
  if (p) return p;
  const c = code();
  const fresh = { user_id: userId, name: `Learner ${c.slice(0, 3)}`, color: COLORS[c.charCodeAt(0) % COLORS.length], code: c, rush_best: 0, anonymous: false };
  await q('insert into profiles (user_id, name, color, code) values ($1, $2, $3, $4) on conflict (user_id) do nothing', [userId, fresh.name, fresh.color, fresh.code]);
  return (await q<Profile>('select * from profiles where user_id = $1', [userId]))[0];
}

export async function updateProfile(userId: string, patch: { name?: string; color?: string; rushBest?: number; anonymous?: boolean }) {
  await profile(userId);
  const q = await db();
  if (patch.name) await q('update profiles set name = $2 where user_id = $1', [userId, patch.name]);
  if (patch.color) await q('update profiles set color = $2 where user_id = $1', [userId, patch.color]);
  if (patch.rushBest !== undefined) await q('update profiles set rush_best = greatest(rush_best, $2) where user_id = $1', [userId, patch.rushBest]);
  if (patch.anonymous !== undefined) await q('update profiles set anonymous = $2 where user_id = $1', [userId, patch.anonymous]);
  return profile(userId);
}

/** What a learner shows: no memory contents, only how they're doing. */
async function stats(userId: string, now = Date.now()) {
  const q = await db();
  const all = await loadKnowledge(userId);
  const kept = all.filter((s) => s.r >= DESIRED_RETENTION).length;
  const weekAgo = now - 7 * 86_400_000;
  const [{ n: relitWeek }] = await q<{ n: number }>(`select count(*)::int as n from reviews where user_id = $1 and at > $2 and (data->>'answerOk')::boolean`, [userId, weekAgo]);
  const streak = await getStreak(userId);
  return { kept, relitWeek, streak: streak.count, best: streak.best, total: all.length };
}

/** The full profile for its owner: stats, a year of review counts per day (the heatmap), badges, friends' code. */
export async function myProfile(userId: string, now = Date.now()) {
  const p = await profile(userId);
  const q = await db();
  const since = now - 365 * 86_400_000;
  const rows = await q<{ at: string }>('select at from reviews where user_id = $1 and at > $2', [userId, since]);
  const heatmap: Record<string, number> = {};
  for (const r of rows) {
    const d = new Date(Number(r.at)).toISOString().slice(0, 10);
    heatmap[d] = (heatmap[d] ?? 0) + 1;
  }
  const s = await stats(userId, now);
  const badges = [
    ...MILESTONES.filter((m) => s.best >= m.days).map((m) => `${m.days}-day ember · ${m.name} theme`),
    ...(s.kept >= 10 ? [`${s.kept} memories kept`] : []),
    ...(p.rush_best >= 10_000 ? ['Recall Rush 10k'] : []),
  ];
  return { name: p.name, color: p.color, code: p.code, anonymous: p.anonymous, rushBest: p.rush_best, heatmap, badges, ...s };
}

export async function addFriend(userId: string, friendCode: string): Promise<{ name: string } | null> {
  const q = await db();
  const [f] = await q<Profile>('select * from profiles where code = $1', [friendCode.trim().toUpperCase()]);
  if (!f || f.user_id === userId) return null;
  for (const [a, b] of [[userId, f.user_id], [f.user_id, userId]]) await q('insert into friends (a, b) values ($1, $2) on conflict do nothing', [a, b]);
  return { name: f.name };
}

export async function listFriends(userId: string) {
  const q = await db();
  const rows = await q<Profile>('select p.* from friends f join profiles p on p.user_id = f.b where f.a = $1 order by p.name', [userId]);
  return Promise.all(rows.map(async (p) => ({ name: p.name, color: p.color, code: p.code, rushBest: p.rush_best, ...(await stats(p.user_id)) })));
}

/** A cheer gives a friend one freeze (a free streak repair), at most one per friend per day, never past the cap. */
export async function cheer(userId: string, friendCode: string, today: string): Promise<'sent' | 'already' | 'not-friend'> {
  const q = await db();
  const [f] = await q<{ user_id: string }>('select p.user_id from profiles p join friends f on f.b = p.user_id where f.a = $1 and p.code = $2', [userId, friendCode.toUpperCase()]);
  if (!f) return 'not-friend';
  const inserted = await q('insert into cheers (from_id, to_id, day) values ($1, $2, $3) on conflict do nothing returning day', [userId, f.user_id, today]);
  if (!inserted.length) return 'already';
  const streak = await getStreak(f.user_id);
  await q('update users set streak = $2 where id = $1', [f.user_id, JSON.stringify({ ...streak, freezes: Math.min(MAX_FREEZES, streak.freezes + 1) })]);
  return 'sent';
}

// ---------------------------------------------------------------- daily challenge and duels

export async function createDuel(userId: string): Promise<string> {
  const q = await db();
  const c = code(5);
  await q('insert into duels (code, created_by) values ($1, $2)', [c, userId]);
  return c;
}

/** The key a run is scored under: today's daily challenge, or an existing duel. Null for an unknown duel code. */
export async function challengeKey(duel: string | undefined, now = Date.now()): Promise<string | null> {
  if (!duel) return dailyKey(now);
  const q = await db();
  const [d] = await q('select code from duels where code = $1', [duel.toUpperCase()]);
  return d ? `duel-${duel.toUpperCase()}` : null;
}

/** One run per learner per key: starting again returns the unfinished run, a finished one can't be replayed. */
export async function startRun(userId: string, key: string) {
  await profile(userId); // boards join on profiles: a first-time player needs one to appear
  const q = await db();
  const [prev] = await q<{ id: string; finished_at: string | null }>('select id, finished_at from challenge_runs where user_id = $1 and key = $2', [userId, key]);
  if (prev?.finished_at) return { error: 'You have already played this one. See how you rank.' } as const;
  const id = prev?.id ?? newId();
  // Started on the server's clock, the same clock that times the finish.
  if (!prev) await q('insert into challenge_runs (id, user_id, key, started_at) values ($1, $2, $3, $4)', [id, userId, key, new Date().toISOString()]);
  return { runId: id, key, items: challengeItems(key) } as const;
}

/** Scored here, from the answers and the server's clock: a client can't send its own score or time. */
export async function finishRun(userId: string, runId: string, answers: string[], now = Date.now()) {
  const q = await db();
  const [run] = await q<{ key: string; started_at: string; finished_at: string | null }>(
    'select key, started_at, finished_at from challenge_runs where id = $1 and user_id = $2', [runId, userId]);
  if (!run) return { error: 'No such run.' } as const;
  if (run.finished_at) return { error: 'This run is already scored.' } as const;
  const seconds = (now - new Date(run.started_at).getTime()) / 1000;
  if (seconds < MIN_RUN_S) return { error: 'That was too fast to be a real run.' } as const;
  const { correct, score } = seconds > RUN_LIMIT_S ? { correct: 0, score: 0 } : scoreChallenge(challengeItems(run.key), answers, seconds);
  await q('update challenge_runs set finished_at = $2, correct = $3, score = $4 where id = $1', [runId, new Date(now).toISOString(), correct, score]);
  return { correct, score, seconds: Math.round(seconds), key: run.key };
}

/** Top runs for a key, everyone or just friends (and you). Anonymous players show as "Anonymous". */
export async function board(userId: string, key: string, scope: 'global' | 'friends') {
  const q = await db();
  const rows = await q<{ user_id: string; name: string; color: string; anonymous: boolean; correct: number; score: number }>(
    `select r.user_id, p.name, p.color, p.anonymous, r.correct, r.score from challenge_runs r join profiles p on p.user_id = r.user_id
     where r.key = $1 and r.finished_at is not null
       and ($2 = 'global' or r.user_id = $3 or r.user_id in (select b from friends where a = $3))
     order by r.score desc, r.finished_at asc limit 20`,
    [key, scope, userId]);
  return rows.map((r, i) => ({ rank: i + 1, name: r.anonymous && r.user_id !== userId ? 'Anonymous' : r.name, color: r.color, correct: r.correct, score: r.score, you: r.user_id === userId }));
}

// ---------------------------------------------------------------- leagues

/** Opt in for this week: groups of LEAGUE_SIZE in joining order. */
export async function joinLeague(userId: string, now = Date.now()) {
  const q = await db();
  await profile(userId);
  const week = weekKey(now);
  const [{ n }] = await q<{ n: number }>('select count(*)::int as n from leagues where week = $1', [week]);
  await q('insert into leagues (week, user_id, grp) values ($1, $2, $3) on conflict do nothing', [week, userId, Math.floor(n / LEAGUE_SIZE)]);
  return league(userId, now);
}

/** Your league this week, ranked by memories kept; null if you haven't joined. No demotion, no shaming. */
export async function league(userId: string, now = Date.now()) {
  const q = await db();
  const week = weekKey(now);
  const [me] = await q<{ grp: number }>('select grp from leagues where week = $1 and user_id = $2', [week, userId]);
  if (!me) return null;
  const members = await q<Profile>('select p.* from leagues l join profiles p on p.user_id = l.user_id where l.week = $1 and l.grp = $2', [week, me.grp]);
  const rows = await Promise.all(members.map(async (p) => ({ name: p.anonymous && p.user_id !== userId ? 'Anonymous' : p.name, color: p.color, kept: (await stats(p.user_id, now)).kept, you: p.user_id === userId })));
  return { week, members: rows.sort((a, b) => b.kept - a.kept).map((r, i) => ({ rank: i + 1, ...r })) };
}

