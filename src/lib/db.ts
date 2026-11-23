import postgres from "postgres";

/**
 * Cliente Postgres compartido. Funciona con cualquier Postgres gratuito
 * (Neon, Supabase…) a través de DATABASE_URL.
 */
declare global {
  var __sql: ReturnType<typeof postgres> | undefined;
  var __schemaReady: Promise<void> | undefined;
}

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta la variable de entorno DATABASE_URL");
  const isLocal = /localhost|127\.0\.0\.1|\/var\/run/.test(url);
  return postgres(url, {
    ssl: isLocal ? false : "require",
    max: 3,
    idle_timeout: 20,
    prepare: false, // compatible con poolers (Supabase pgbouncer / Neon pooler)
    onnotice: () => {},
  });
}

export function sql() {
  if (!globalThis.__sql) globalThis.__sql = createClient();
  return globalThis.__sql;
}

export const SCHEMA = /* sql */ `
create table if not exists runs (
  id uuid primary key default gen_random_uuid(),
  request text not null,
  template text not null,
  status text not null default 'planning',
  summary text,
  llm_mode text not null default 'llm',
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id) on delete cascade,
  position int not null,
  title text not null,
  description text not null,
  checks jsonb not null default '[]',
  status text not null default 'pending',
  attempts int not null default 0,
  feedback jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tasks_run_idx on tasks(run_id, position);

create table if not exists files (
  run_id uuid not null references runs(id) on delete cascade,
  path text not null,
  content text not null,
  updated_by text not null default 'seed',
  updated_at timestamptz not null default now(),
  primary key (run_id, path)
);

create table if not exists events (
  id bigserial primary key,
  run_id uuid not null references runs(id) on delete cascade,
  task_id uuid references tasks(id) on delete set null,
  agent text not null,
  kind text not null,
  message text not null,
  data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists events_run_idx on events(run_id, id);
`;

/** Crea las tablas la primera vez (idempotente). */
export function ensureSchema() {
  if (!globalThis.__schemaReady) {
    globalThis.__schemaReady = sql()
      .unsafe(SCHEMA)
      .then(() => undefined)
      .catch((e) => {
        globalThis.__schemaReady = undefined;
        throw e;
      });
  }
  return globalThis.__schemaReady;
}
