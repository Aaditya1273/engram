import type { Twist } from '../core/twist';
import type { Goal, InboxItem } from '../shared/types';
import type { Store } from './store';

/**
 * Talks to the Atrium API. Everything here fails soft: no network or no server means the headset
 * keeps working offline, and the next successful sync catches up.
 */
export class Cloud {
  online = false;
  ai = false;
  /** The server can transcribe speech (for browsers without a recogniser). */
  stt = false;
  /** The server can generate 3D objects (Aholo Lux3D). */
  lux3d = false;
  /** The deployment has no database: stay quietly offline instead of retrying calls that will 503. */
  private unconfigured = false;
  private syncing: Promise<void> | null = null;

  constructor(private store: Store) {}

  private async api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = this.store.data.cloud.token;
    const res = await fetch(`/api${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers },
      signal: AbortSignal.timeout(path === '/capture' || path === '/palace' || path.startsWith('/agent') ? 120_000 : path.startsWith('/transcribe') ? 40_000 : 15_000),
    });
    if (res.status === 401 && token) {
      // Token revoked or account deleted elsewhere: start over as a new device next time.
      this.store.data.cloud.token = undefined;
      this.store.save();
    }
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  private healthCheck: Promise<boolean> | null = null;
  /**
   * What the server can do, without registering anything (safe on page load). True if the cloud is usable.
   * A deployment without a database can't authenticate, so it offers nothing.
   */
  health(): Promise<boolean> {
    this.healthCheck ??= this.api<{ ai: boolean; stt?: boolean; lux3d?: boolean; db: string }>('/health').then((h) => {
      const usable = h.db !== 'none';
      this.unconfigured = !usable;
      this.ai = usable && h.ai;
      this.stt = usable && !!h.stt;
      this.lux3d = usable && !!h.lux3d;
      return usable;
    }, () => {
      this.healthCheck = null; // offline: ask again next time
      return false;
    });
    return this.healthCheck;
  }

  /** Register this headset once; afterwards just checks the server is there. */
  async connect(): Promise<boolean> {
    try {
      if (!(await this.health())) return (this.online = false);
      if (!this.store.data.cloud.token) {
        const { token } = await this.api<{ token: string }>('/device', { method: 'POST', body: JSON.stringify({ name: 'Headset' }) });
        this.store.data.cloud.token = token;
        this.store.save();
      }
      this.online = true;
    } catch {
      this.online = false;
    }
    return this.online;
  }

  /** Push dirty memories, new reviews and streak events; pull reviews from other devices. Never runs twice at once. */
  sync(): Promise<void> {
    this.syncing ??= (async () => {
      try {
        if (this.unconfigured || (!this.store.data.cloud.token && !(await this.connect()))) return;
        const d = this.store.data, c = d.cloud;
        const memories = d.memories.filter((m) => c.dirtyMemories.includes(m.id));
        const reviews = d.reviews.filter((r) => c.pendingReviews.includes(r.id));
        const events = c.streakEvents.slice();
        const res = await this.api<Parameters<Store['merge']>[0]>('/sync', {
          method: 'POST',
          body: JSON.stringify({ memories, reviews, streakEvents: events, since: c.cursor, streak: d.streak }),
        });
        this.store.merge(res, { memories: memories.map((m) => m.id), reviews: reviews.map((r) => r.id), events: events.length });
        this.online = true;
      } catch {
        this.online = false;
      } finally {
        this.syncing = null;
      }
    })();
    return this.syncing;
  }

  async refreshGoals(): Promise<Goal[]> {
    if (this.unconfigured || !this.store.data.cloud.token) return this.store.data.cloud.goals;
    try {
      const goals = await this.api<Goal[]>('/goals');
      this.store.data.cloud.goals = goals;
      this.store.save();
    } catch {
      // keep cached goals
    }
    return this.store.data.cloud.goals;
  }

  async inbox(): Promise<InboxItem[]> {
    if (this.unconfigured || !this.store.data.cloud.token) return [];
    try {
      const items = await this.api<InboxItem[]>('/inbox');
      this.online = true;
      return items;
    } catch {
      this.online = false;
      return [];
    }
  }

  markPlaced(id: string) {
    return this.api(`/inbox/${id}/placed`, { method: 'POST' }).catch(() => {});
  }

  discard(id: string) {
    return this.api(`/inbox/${id}/discard`, { method: 'POST' }).catch(() => {});
  }

  capture(text: string) {
    return this.api<{ count: number; topic: string; drafter: string }>('/capture', { method: 'POST', body: JSON.stringify({ text, source: 'voice' }) });
  }

  pair() {
    return this.api<{ code: string; url: string; expiresInSec: number }>('/pair', { method: 'POST' });
  }

  async twist(text: string, fallback: Twist): Promise<Twist> {
    if (!this.online) return fallback;
    try {
      return await this.api<Twist>('/twist', { method: 'POST', body: JSON.stringify({ text }) });
    } catch {
      return fallback;
    }
  }

  /** Fresh wordings for a quiz (Lumen); empty when offline or without AI, and the stored questions are used. */
  async quiz(items: { id: string; question: string; answer: string; cue: string }[]): Promise<{ id: string; prompt: string }[]> {
    if (!this.online || !this.ai) return [];
    try {
      return (await this.api<{ questions: { id: string; prompt: string }[] }>('/quiz', { method: 'POST', body: JSON.stringify({ items }) })).questions;
    } catch {
      return [];
    }
  }

  /** World Builder: text, a web page or a topic becomes an ordered journey, filed in the inbox. */
  buildPalace(input: { text?: string; url?: string; name?: string }) {
    return this.api<{ journey: { id: string; name: string }; inboxIds: string[]; name: string; count: number }>('/palace', { method: 'POST', body: JSON.stringify(input) });
  }

  /** The built-in study agent files five facts on a topic into the inbox, like any MCP agent would. */
  agentFacts(topic: string) {
    return this.api<{ topic: string; count: number }>('/agent/facts', { method: 'POST', body: JSON.stringify({ topic }) });
  }

  /** Starts a twist-to-3D job; null if 3D generation is off, offline, or over the daily limit. */
  async requestModel(text: string): Promise<string | null> {
    if (!this.online || !this.lux3d) return null;
    try {
      return (await this.api<{ id: string }>('/models', { method: 'POST', body: JSON.stringify({ text }) })).id;
    } catch {
      return null;
    }
  }

  /** Each call also advances the job on the server; 'unknown' means try again later. */
  async modelStatus(id: string): Promise<'generating' | 'optimising' | 'ready' | 'failed' | 'unknown'> {
    try {
      return (await this.api<{ status: 'generating' | 'optimising' | 'ready' | 'failed' }>(`/models/${id}`)).status;
    } catch (e) {
      return (e as Error).message === 'Not found' ? 'failed' : 'unknown';
    }
  }

  /** A generated object as a 3D-printable file (Lux3D multi-format export); resolves with its download URL. */
  async printable(id: string, format: 'stl' | '3mf' = 'stl'): Promise<string | null> {
    for (let i = 0; i < 40; i++) {
      const r = await this.api<{ url?: string; status?: string }>(`/models/${id}/export?format=${format}`, { method: 'POST' }).catch((): { url?: string; status?: string } => ({ status: 'failed' }));
      if (r.url) return r.url;
      if (r.status === 'failed') return null;
      await new Promise((res) => setTimeout(res, 4000));
    }
    return null;
  }

  /** Throws on any failure; the caller falls back to pinchable choices. */
  async transcribe(audio: Blob, lang: string): Promise<string[]> {
    const r = await this.api<{ alternatives: string[] }>(`/transcribe?lang=${encodeURIComponent(lang)}`, {
      method: 'POST',
      body: audio,
      headers: { 'content-type': audio.type || 'audio/webm' },
    });
    return r.alternatives;
  }

  async deleteAccount() {
    await this.api('/account', { method: 'DELETE' }).catch(() => {});
  }
}

