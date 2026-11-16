/**
 * One SQL dialect everywhere: Neon Postgres in production (DATABASE_URL), embedded PGlite
 * (real Postgres compiled to WASM) for local dev and tests. No ORM: a handful of tables.
 */

export const SCHEMA = /* sql */ `
create table if not exists users (
  id          text primary key,
  streak      jsonb,
  created_at  timestamptz not null default now()
);
create table if not exists tokens (
  id            text primary key,
  user_id       text not null references users(id) on delete cascade,
  kind          text not null check (kind in ('device', 'agent')),
  name          text not null,
  scopes        text[] not null,
  hash          text not null unique,
  revoked       boolean not null default false,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);
create table if not exists pairings (
  code        text primary key,
  user_id     text not null references users(id) on delete cascade,
  expires_at  timestamptz not null
);
create table if not exists goals (
  id          text primary key,
  user_id     text not null references users(id) on delete cascade,
  name        text not null,
  deadline    date not null,
  target      real not null default 0.9,
  created_at  timestamptz not null default now()
);
create table if not exists inbox (
  id          text primary key,
  user_id     text not null references users(id) on delete cascade,
  source      text not null,
  status      text not null default 'new' check (status in ('new', 'placed', 'discarded')),
  goal_id     text references goals(id) on delete set null,
  item        jsonb not null,
  created_at  timestamptz not null default now()
);
create index if not exists inbox_user_status on inbox (user_id, status);
create table if not exists memories (
  user_id     text not null references users(id) on delete cascade,
  id          text not null,
  topic       text not null,
  goal_id     text,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, id)
);
create table if not exists reviews (
  user_id     text not null references users(id) on delete cascade,
  id          text not null,
  memory_id   text not null,
  at          bigint not null,
  data        jsonb not null,
  seq         bigserial,
  primary key (user_id, id)
);
create index if not exists reviews_user_seq on reviews (user_id, seq);
create table if not exists rate_limits (
  token_id      text not null,
  window_start  bigint not null,
  count         int not null,
  primary key (token_id, window_start)
);
`;

export type Query = <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<T[]>;

let ready: Promise<Query> | null = null;

/** Override for tests: an in-memory PGlite per test file. */
export function useMemoryDb() {
  ready = (async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const db = new PGlite();
    await db.exec(SCHEMA);
    return (async (text: string, params: unknown[] = []) => (await db.query(text, params)).rows) as Query;
  })();
}

export function db(): Promise<Query> {
  ready ??= (async () => {
    const url = process.env.DATABASE_URL;
    let q: Query;
    if (url) {
      const { neon } = await import('@neondatabase/serverless');
      const sql = neon(url);
      q = (async (text: string, params: unknown[] = []) => (await sql.query(text, params)) as never) as Query;
    } else {
      const { PGlite } = await import('@electric-sql/pglite');
      const dir = process.env.PGLITE_DIR ?? '.data/pglite';
      (await import('node:fs')).mkdirSync(dir, { recursive: true });
      const pg = new PGlite(dir);
      q = (async (text: string, params: unknown[] = []) => (await pg.query(text, params)).rows) as Query;
    }
    // Idempotent; runs once per cold start. Each statement separately (Neon's HTTP driver runs one at a time).
    for (const stmt of SCHEMA.split(';').map((s) => s.trim()).filter(Boolean)) await q(stmt);
    return q;
  })();
  // Don't cache a failed connection: the next request retries.
  ready.catch(() => (ready = null));
  return ready;
}
