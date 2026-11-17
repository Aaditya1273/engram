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
  /** The deployment has no database: stay quietly offline instead of retrying calls that will 503. */
  private unconfigured = false;
  private syncing: Promise<void> | null = null;

  constructor(private store: Store) {}

  private async api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = this.store.data.cloud.token;
    const res = await fetch(`/api${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers },
      signal: AbortSignal.timeout(path === '/capture' ? 120_000 : 15_000),
    });
    if (res.status === 401 && token) {
      // Token revoked or account deleted elsewhere: start over as a new device next time.
      this.store.data.cloud.token = undefined;
      this.store.save();
    }
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  /** Register this headset once; afterwards just checks the server is there. */
  async connect(): Promise<boolean> {
    try {
      const health = await this.api<{ ai: boolean; db: string }>('/health');
      this.ai = health.ai;
      if (health.db === 'none') {
        this.unconfigured = true;
        return (this.online = false);
      }
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

  async deleteAccount() {
    await this.api('/account', { method: 'DELETE' }).catch(() => {});
  }
}

