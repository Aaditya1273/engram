import '../shared/theme.css';
import { answerMatches } from '../core/answer';
import { dayKey } from '../core/streak';
import { SLOT_DEG } from '../headset/layout';
import type { Goal, Memory, Review } from '../shared/types';
import { MEMORISE_S } from '../core/challenge';

/** Phone companion: pair with the headset, capture, a typed mental walk, goals, agents, data. */

const TOKEN_KEY = 'atrium:companion-token';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

let token = (() => {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
})();

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });
  if (res.status === 401 && token) signOut();
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

function setToken(t: string) {
  token = t;
  try {
    t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);
  } catch {
    // private mode: works for this tab only
  }
}

function signOut() {
  setToken('');
  render();
}

function status(id: string, text: string, kind: 'ok' | 'bad' | '' = '') {
  const el = $(id);
  el.textContent = text;
  el.className = `status ${kind}`;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// ---------------------------------------------------------------- state from the server

interface Me {
  streak: { count: number; freezes: number; broken: unknown };
  goals: (Goal & { readiness: { memories: number; readiness_if_stop_today: number; reviews_per_day_on_track: number; days_left: number } })[];
  memories: (Memory & { recall: number })[];
  due: { fading: number; session_minutes: number };
}
let me: Me | null = null;

async function refresh() {
  me = await api<Me>('/me');
  const s = me.streak;
  $('ember').textContent = `Ember ${s.count} ${s.count === 1 ? 'day' : 'days'} · ${s.freezes} ${s.freezes === 1 ? 'freeze' : 'freezes'}`;
  $('ember').title = 'Ember streak and banked freezes';
  renderGoals();
  renderWalkSetup();
  void renderAgents();
}

// ---------------------------------------------------------------- pairing

async function pair(code: string) {
  status('pair-status', 'Connecting…');
  try {
    const { token: t } = await api<{ token: string }>('/pair/claim', { method: 'POST', body: JSON.stringify({ code }) });
    setToken(t);
    history.replaceState(null, '', location.pathname);
    render();
  } catch (e) {
    status('pair-status', (e as Error).message, 'bad');
  }
}

// ---------------------------------------------------------------- capture

/** World Builder: text, a topic, a web page or a PDF becomes one ordered journey in the headset inbox. */
async function buildPalace() {
  const text = $<HTMLTextAreaElement>('pal-text').value.trim();
  const url = $<HTMLInputElement>('pal-url').value.trim();
  const pdf = $<HTMLInputElement>('pal-pdf').files?.[0];
  if (!text && !url && !pdf) return status('pal-status', 'Give a topic, some text, a web address or a PDF.', 'bad');
  const btn = $<HTMLButtonElement>('pal-btn');
  btn.disabled = true;
  status('pal-status', 'Building: finding the order, the rooms, and a scene for every stop…');
  try {
    let r: { name: string; count: number };
    if (pdf) {
      if (pdf.size > 8_000_000) throw new Error('That PDF is too large (8 MB at most).');
      const res = await fetch(`/api/palace${text && text.length < 80 ? `?name=${encodeURIComponent(text)}` : ''}`, {
        method: 'POST', body: pdf, headers: { 'content-type': 'application/pdf', authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
      r = data as typeof r;
    } else {
      const short = text.length < 80 && !text.includes('\n');
      r = await api('/palace', { method: 'POST', body: JSON.stringify(url ? { url, name: short && text ? text : undefined } : short ? { name: text } : { text }) });
    }
    status('pal-status', `"${r.name}": ${r.count} stops, waiting in your headset inbox. Walk it in from the palace.`, 'ok');
    $<HTMLTextAreaElement>('pal-text').value = '';
    $<HTMLInputElement>('pal-url').value = '';
    $<HTMLInputElement>('pal-pdf').value = '';
  } catch (e) {
    status('pal-status', (e as Error).message, 'bad');
  } finally {
    btn.disabled = false;
  }
}

async function capture() {
  const text = $<HTMLTextAreaElement>('cap-text').value.trim();
  if (!text) return status('cap-status', 'Type or paste something first.', 'bad');
  const btn = $<HTMLButtonElement>('cap-btn');
  btn.disabled = true;
  status('cap-status', 'Drafting scenes… this can take a few seconds.');
  try {
    const r = await api<{ count: number; topic: string; drafter: string }>('/capture', {
      method: 'POST',
      body: JSON.stringify({ text, topic: $<HTMLInputElement>('cap-topic').value || undefined, goal: $<HTMLSelectElement>('cap-goal').value || undefined, source: 'phone' }),
    });
    if (r.count) {
      status('cap-status', `${r.count} ${r.count === 1 ? 'item' : 'items'} sent to your headset inbox (${r.topic}).`, 'ok');
      $<HTMLTextAreaElement>('cap-text').value = '';
    } else {
      status('cap-status', 'No facts found. Try one per line, like "neko - cat".', 'bad');
    }
  } catch (e) {
    status('cap-status', (e as Error).message, 'bad');
  } finally {
    btn.disabled = false;
  }
}

// ---------------------------------------------------------------- mental walk

const WALK_MS = 60_000;
let walk: { queue: (Memory & { recall: number })[]; i: number; started: number; ok: number; shownAt: number; reviews: Omit<Review, 'id'>[]; timer: number } | null = null;

function renderWalkSetup() {
  const topics = [...new Set(me?.memories.map((m) => m.topic) ?? [])];
  $('walk-topic').innerHTML = topics.length
    ? topics.map((t) => `<option>${esc(t)}</option>`).join('')
    : '<option value="">No memories yet: place some in the headset</option>';
  $<HTMLButtonElement>('walk-start').disabled = !topics.length;
}

function drawMap(memories: Memory[], current?: Memory) {
  // Top-down: the chair at the centre, alcoves on the ring, slot 0 straight ahead (up).
  const dots = memories.map((m) => {
    const a = (m.slot * SLOT_DEG * Math.PI) / 180;
    const x = Math.sin(a) * 85, y = -Math.cos(a) * 85, on = m.id === current?.id;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${on ? 11 : 7}" fill="${on ? 'var(--accent)' : 'var(--line)'}" />`;
  });
  $('map').innerHTML = `<circle r="100" fill="none" stroke="var(--line)" stroke-width="2"/><circle r="6" fill="var(--muted)"/>${dots.join('')}`;
}

function startWalk() {
  const topic = $<HTMLSelectElement>('walk-topic').value;
  // Dimmest first: the walk spends its minute where it helps most.
  const queue = (me?.memories ?? []).filter((m) => m.topic === topic).sort((a, b) => a.recall - b.recall);
  if (!queue.length) return;
  walk = { queue, i: 0, started: Date.now(), ok: 0, shownAt: Date.now(), reviews: [], timer: 0 };
  $('walk-setup').hidden = true;
  $('walk-run').hidden = false;
  walk.timer = window.setInterval(() => {
    const left = Math.max(0, Math.ceil((WALK_MS - (Date.now() - walk!.started)) / 1000));
    $('walk-timer').textContent = left ? `${left} s left in your minute` : 'Minute done: keep going or finish.';
  }, 500);
  showWalkItem();
}

function showWalkItem() {
  if (!walk) return;
  const m = walk.queue[walk.i];
  if (!m) return void finishWalk();
  drawMap(walk.queue, m);
  $('walk-q').textContent = m.question;
  const a = $<HTMLInputElement>('walk-a');
  a.value = '';
  a.lang = m.lang;
  a.focus();
  status('walk-status', `${walk.i + 1} of ${walk.queue.length}`);
  walk.shownAt = Date.now();
}

function checkWalk() {
  if (!walk) return;
  const m = walk.queue[walk.i];
  const typed = $<HTMLInputElement>('walk-a').value;
  const ok = answerMatches([typed], m.answers);
  walk.ok += ok ? 1 : 0;
  // Typed recall is graded against the stored answers, never self-rated.
  walk.reviews.push({ memoryId: m.id, at: Date.now(), grade: ok ? 'good' : 'again', answerOk: ok, gestureScore: null, latencyMs: Date.now() - walk.shownAt, source: 'phone' });
  status('walk-status', ok ? `Yes: ${m.display}` : `It was ${m.display}. ${m.mnemonic}`, ok ? 'ok' : 'bad');
  walk.i++;
  setTimeout(showWalkItem, ok ? 700 : 2600);
}

async function finishWalk() {
  if (!walk) return;
  clearInterval(walk.timer);
  const w = walk;
  walk = null;
  const reviews = w.reviews.map((r) => ({ ...r, id: crypto.randomUUID() }));
  try {
    await api('/sync', { method: 'POST', body: JSON.stringify({ reviews, streakEvents: reviews.length ? [{ type: 'recall', day: dayKey(Date.now()) }] : [] }) });
    status('walk-status', `Walk done: ${w.ok} of ${reviews.length} recalled. Your headset will see these on its next sync.`, 'ok');
  } catch (e) {
    status('walk-status', `Couldn't save the walk: ${(e as Error).message}`, 'bad');
  }
  $('walk-setup').hidden = false;
  $('walk-run').hidden = true;
  $('walk-timer').textContent = '';
  void refresh();
}

// ---------------------------------------------------------------- goals

function renderGoals() {
  const goals = me?.goals ?? [];
  $('goal-list').innerHTML = goals.length
    ? goals.map((g) => {
        const r = g.readiness, pct = Math.round(r.readiness_if_stop_today * 100);
        const detail = r.memories
          ? `${pct}% on the day if you stop today · ~${r.reviews_per_day_on_track} reviews/day keeps you near ${Math.round(g.target * 100)}%`
          : 'No memories attached yet';
        return `<li><div style="flex:1"><b>${esc(g.name)}</b> <span class="muted">· ${esc(g.deadline)} · ${r.days_left} days</span>
          <div class="muted">${detail}</div><div class="bar" aria-hidden="true"><i style="width:${pct}%"></i></div></div>
          <button class="danger" data-goal="${esc(g.id)}" aria-label="Delete goal ${esc(g.name)}">✕</button></li>`;
      }).join('')
    : '<li class="muted">No goals yet. A goal with a date gets a readiness forecast.</li>';
  $('cap-goal').innerHTML = '<option value="">None</option>' + goals.map((g) => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('');
}

async function addGoal() {
  const name = $<HTMLInputElement>('goal-name').value.trim();
  const deadline = $<HTMLInputElement>('goal-date').value;
  if (!name || !deadline) return status('goal-status', 'Give the goal a name and a date.', 'bad');
  try {
    await api('/goals', { method: 'POST', body: JSON.stringify({ name, deadline }) });
    $<HTMLInputElement>('goal-name').value = '';
    status('goal-status', 'Goal added.', 'ok');
    await refresh();
  } catch (e) {
    status('goal-status', (e as Error).message, 'bad');
  }
}

// ---------------------------------------------------------------- agents & data

async function renderAgents() {
  const agents = await api<{ id: string; name: string; scopes: string[]; last_used_at: string | null }[]>('/agents');
  $('agent-list').innerHTML = agents.length
    ? agents.map((a) => `<li><div><b>${esc(a.name)}</b> <span class="muted">· ${a.scopes.join(' + ')} · ${a.last_used_at ? `used ${new Date(a.last_used_at).toLocaleDateString()}` : 'never used'}</span></div>
        <button class="danger" data-agent="${esc(a.id)}">Revoke</button></li>`).join('')
    : '<li class="muted">No agents connected.</li>';
}

async function createAgent() {
  const name = $<HTMLInputElement>('agent-name').value.trim() || 'Agent';
  const scopes = $<HTMLSelectElement>('agent-scope').value.split(',');
  const { token: key, mcpUrl } = await api<{ token: string; mcpUrl: string }>('/agents', { method: 'POST', body: JSON.stringify({ name, scopes }) });
  $('agent-config').textContent = JSON.stringify({ mcpServers: { atrium: { url: mcpUrl, headers: { Authorization: `Bearer ${key}` } } } }, null, 2);
  $('agent-new').hidden = false;
  $<HTMLInputElement>('agent-name').value = '';
  await renderAgents();
}

async function exportData() {
  const data = await api('/export');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = 'atrium-export.json';
  a.click();
  URL.revokeObjectURL(a.href);
  status('data-status', 'Exported.', 'ok');
}

async function deleteAccount() {
  // A native confirm is right here: irreversible, phone-only, no custom modal needed.
  if (!confirm('Delete your Atrium account and every memory in the cloud? This cannot be undone.')) return;
  await api('/account', { method: 'DELETE' });
  signOut();
}

// ---------------------------------------------------------------- shell

// ---------------------------------------------------------------- arena

interface Profile { name: string; color: string; code: string; anonymous: boolean; rushBest: number; heatmap: Record<string, number>; badges: string[]; kept: number; relitWeek: number; streak: number; best: number; total: number }
const COLORS = ['#D9B76E', '#7FB685', '#E89F71', '#8FB3D9', '#C79BD1', '#E6C35C'];

async function renderArena() {
  const p = await api<Profile>('/profile');
  $<HTMLInputElement>('pro-name').value = p.name;
  $<HTMLInputElement>('pro-anon').checked = p.anonymous;
  $('pro-code').textContent = p.code;
  $('pro-colors').innerHTML = COLORS.map((c) => `<button data-color="${c}" aria-label="Colour ${c}" aria-pressed="${c === p.color}" style="background:${c}"></button>`).join('');
  $('pro-stats').innerHTML = [
    [p.kept, 'memories kept'], [p.streak, 'day ember'], [p.relitWeek, 'relit this week'], [p.rushBest, 'Recall Rush best'],
  ].map(([n, l]) => `<div><b>${n}</b><span>${l}</span></div>`).join('');
  $('pro-badges').innerHTML = p.badges.map((b) => `<span>${esc(b)}</span>`).join('');
  drawHeatmap(p.heatmap);
  await Promise.all([renderFriends(), renderBoard('global'), renderLeague()]);
}

/** A year of reviews, one square a day, weeks as columns: the GitHub-style consistency view. */
function drawHeatmap(days: Record<string, number>) {
  const cell = 10, gap = 0.6, today = new Date();
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - 364 - start.getUTCDay());
  let out = '';
  for (let i = 0; i <= 371; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    if (d > today) break;
    const n = days[d.toISOString().slice(0, 10)] ?? 0;
    const shade = n === 0 ? 'rgba(127,140,130,0.18)' : `rgba(185,154,98,${Math.min(1, 0.3 + n / 30)})`;
    out += `<rect x="${Math.floor(i / 7) * cell + gap}" y="${(i % 7) * cell + gap + 10}" width="${cell - gap * 2}" height="${cell - gap * 2}" rx="2" fill="${shade}"><title>${d.toISOString().slice(0, 10)}: ${n}</title></rect>`;
  }
  $('heatmap').innerHTML = out;
}

async function renderFriends() {
  const list = await api<{ name: string; color: string; code: string; streak: number; relitWeek: number; kept: number }[]>('/friends');
  $('fr-list').innerHTML = list.length ? list.map((f) => `<li><span><i class="dot" style="background:${f.color}"></i><b>${esc(f.name)}</b><br><span class="muted">${f.streak}-day ember · ${f.relitWeek} relit this week · ${f.kept} kept</span></span><button data-cheer="${f.code}">Cheer</button></li>`).join('')
    : '<li class="muted">No friends yet. Share your code, or add theirs.</li>';
}

async function renderBoard(scope: 'global' | 'friends', duel?: string) {
  const b = await api<{ rows: { rank: number; name: string; correct: number; score: number; you: boolean }[] }>(`/challenge/board?scope=${scope}${duel ? `&duel=${duel}` : ''}`);
  $('ch-board').innerHTML = b.rows.length ? b.rows.map((r) => `<li class="${r.you ? 'you' : ''}">${esc(r.you ? 'You' : r.name)}: ${r.correct}/20 · ${r.score}</li>`).join('') : '<li class="muted">No runs yet. Be the first.</li>';
}

async function renderLeague() {
  const l = await api<{ week: string; members: { rank: number; name: string; kept: number; you: boolean }[] } | null>('/league');
  $('lg-join').hidden = !!l;
  $('lg-list').innerHTML = l ? l.members.map((m) => `<li class="${m.you ? 'you' : ''}">${esc(m.you ? 'You' : m.name)}: ${m.kept} kept</li>`).join('') : '';
}

/** The challenge on a phone or laptop: the words for MEMORISE_S seconds, then write them back in order. */
async function playChallenge(duel?: string) {
  let run: { runId: string; items: string[] };
  try {
    run = await api('/challenge/start', { method: 'POST', body: JSON.stringify({ duel }) });
  } catch (e) {
    status('ch-status', (e as Error).message, 'bad');
    return renderBoard('global', duel);
  }
  $('ch-setup').hidden = true;
  $('ch-run').hidden = false;
  $('ch-words').hidden = false;
  $('ch-answers').hidden = true;
  $('ch-words').innerHTML = run.items.map((w) => `<span>${esc(w)}</span>`).join('');
  const until = Date.now() + MEMORISE_S * 1000;
  await new Promise<void>((res) => {
    const timer = setInterval(() => {
      const left = Math.ceil((until - Date.now()) / 1000);
      $('ch-timer').textContent = `${left} s to memorise`;
      if (left <= 0) done();
    }, 250);
    const done = () => {
      clearInterval(timer);
      res();
    };
    $('ch-next').textContent = "I'm ready";
    $('ch-next').onclick = done;
  });
  $('ch-words').hidden = true;
  $('ch-answers').hidden = false;
  $('ch-timer').textContent = 'Write them back, in order.';
  $('ch-answers').innerHTML = run.items.map((_, i) => `<input aria-label="Word ${i + 1}" placeholder="${i + 1}" autocomplete="off" autocapitalize="off" />`).join('');
  ($('ch-answers').querySelector('input') as HTMLInputElement).focus();
  await new Promise<void>((res) => {
    $('ch-next').textContent = 'Score it';
    $('ch-next').onclick = () => res();
  });
  const answers = [...$('ch-answers').querySelectorAll('input')].map((i) => (i as HTMLInputElement).value.trim());
  try {
    const r = await api<{ correct: number; score: number; seconds: number }>('/challenge/finish', { method: 'POST', body: JSON.stringify({ runId: run.runId, answers }) });
    status('ch-status', `${r.correct} of 20 in order: ${r.score} points.`, 'ok');
  } catch (e) {
    status('ch-status', (e as Error).message, 'bad');
  }
  $('ch-run').hidden = true;
  $('ch-setup').hidden = false;
  await renderBoard('global', duel);
}

function showTab(tab: string) {
  for (const t of ['capture', 'walk', 'arena', 'goals', 'agents']) $(`tab-${t}`).hidden = t !== tab;
  if (tab === 'arena') void renderArena().catch((e) => status('pro-status', (e as Error).message, 'bad'));
  for (const b of document.querySelectorAll<HTMLButtonElement>('#nav button')) b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false');
}

function render() {
  const signedIn = !!token;
  $('pair').hidden = signedIn;
  $('nav').hidden = !signedIn;
  if (!signedIn) {
    for (const t of ['capture', 'walk', 'arena', 'goals', 'agents']) $(`tab-${t}`).hidden = true;
    $('ember').textContent = '';
    return;
  }
  showTab('capture');
  refresh().catch((e) => status('cap-status', (e as Error).message, 'bad'));
}

$('pair-btn').onclick = () => pair($<HTMLInputElement>('pair-code').value);
$('pair-code').onkeydown = (e) => e.key === 'Enter' && pair($<HTMLInputElement>('pair-code').value);
$('cap-btn').onclick = capture;
$('pal-btn').onclick = buildPalace;
$('tpl-btn').onclick = async () => {
  const c = $<HTMLInputElement>('tpl-code').value.trim().toUpperCase();
  if (!c) return;
  try {
    const r = await api<{ name: string }>(`/templates/${encodeURIComponent(c)}/copy`, { method: 'POST' });
    status('tpl-status', `"${r.name}" is in your headset inbox.`, 'ok');
  } catch (e) {
    status('tpl-status', (e as Error).message, 'bad');
  }
};
$('walk-start').onclick = startWalk;
$('walk-check').onclick = checkWalk;
$('walk-a').onkeydown = (e) => e.key === 'Enter' && checkWalk();
$('goal-btn').onclick = addGoal;
$('agent-btn').onclick = () => createAgent().catch((e) => status('data-status', (e as Error).message, 'bad'));
$('agent-copy').onclick = () => navigator.clipboard?.writeText($('agent-config').textContent ?? '');
$('export-btn').onclick = () => exportData().catch((e) => status('data-status', (e as Error).message, 'bad'));
$('delete-btn').onclick = () => deleteAccount().catch((e) => status('data-status', (e as Error).message, 'bad'));
document.querySelector('#nav')!.addEventListener('click', (e) => {
  const tab = (e.target as HTMLElement).closest('button')?.dataset.tab;
  if (tab) showTab(tab);
});
$('pro-save').onclick = () => api('/profile', { method: 'PATCH', body: JSON.stringify({ name: $<HTMLInputElement>('pro-name').value }) })
  .then(() => status('pro-status', 'Saved.', 'ok'), (e) => status('pro-status', (e as Error).message, 'bad'));
$('pro-anon').onchange = () => void api('/profile', { method: 'PATCH', body: JSON.stringify({ anonymous: $<HTMLInputElement>('pro-anon').checked }) });
$('ch-start').onclick = () => void playChallenge();
$('ch-duel-new').onclick = async () => {
  try {
    const { code: c } = await api<{ code: string }>('/duels', { method: 'POST' });
    $<HTMLInputElement>('ch-duel').value = c;
    status('ch-status', `Duel ${c}: send this code to a friend, then both play it.`, 'ok');
  } catch (e) {
    status('ch-status', (e as Error).message, 'bad');
  }
};
$('ch-duel-join').onclick = () => {
  const c = $<HTMLInputElement>('ch-duel').value.trim().toUpperCase();
  if (c) void playChallenge(c);
};
$('ch-board-g').onclick = () => void renderBoard('global', $<HTMLInputElement>('ch-duel').value.trim().toUpperCase() || undefined);
$('ch-board-f').onclick = () => void renderBoard('friends', $<HTMLInputElement>('ch-duel').value.trim().toUpperCase() || undefined);
$('fr-add').onclick = async () => {
  try {
    const f = await api<{ name: string }>('/friends', { method: 'POST', body: JSON.stringify({ code: $<HTMLInputElement>('fr-code').value }) });
    status('fr-status', `${f.name} is now your friend.`, 'ok');
    await renderFriends();
  } catch (e) {
    status('fr-status', (e as Error).message, 'bad');
  }
};
$('lg-join').onclick = () => void api('/league', { method: 'POST' }).then(renderLeague);
document.body.addEventListener('click', async (e) => {
  const el = e.target as HTMLElement;
  if (el.dataset.color) {
    await api('/profile', { method: 'PATCH', body: JSON.stringify({ color: el.dataset.color }) });
    for (const b of $('pro-colors').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b === el));
  }
  if (el.dataset.cheer) {
    const r = await api<{ result: string }>(`/friends/${el.dataset.cheer}/cheer`, { method: 'POST' }).catch(() => ({ result: 'error' }));
    status('fr-status', r.result === 'sent' ? 'Cheer sent: they get a free streak repair.' : r.result === 'already' ? 'You already cheered them today.' : 'Could not send.', r.result === 'sent' ? 'ok' : 'bad');
  }
  if (el.dataset.goal) {
    await api(`/goals/${el.dataset.goal}`, { method: 'DELETE' });
    await refresh();
  }
  if (el.dataset.agent) {
    await api(`/agents/${el.dataset.agent}`, { method: 'DELETE' });
    await renderAgents();
  }
});

// A scanned code always wins: re-pairing replaces whatever token this phone had.
const code = new URLSearchParams(location.search).get('pair');
if (code) void pair(code);
else render();
