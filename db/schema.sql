-- Se crea solo en el primer arranque (ensureSchema). Este archivo es por si prefieres ejecutarlo a mano.
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
