create table if not exists public.mafia_host_auth (
  id text primary key default 'default' check (id = 'default'),
  pin_hash text not null,
  updated_at timestamptz not null default now()
);
alter table public.mafia_host_auth enable row level security;

create table if not exists public.mafia_host_sessions (
  token_hash text primary key,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen timestamptz not null default now()
);
alter table public.mafia_host_sessions enable row level security;
create index if not exists mafia_host_sessions_expires_idx on public.mafia_host_sessions(expires_at);

create table if not exists public.mafia_host_preferences (
  id text primary key default 'default' check (id = 'default'),
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.mafia_host_preferences enable row level security;
