-- Applied remotely as create_candidate_game_tables.
-- Candidate rooms are service-role only; clients talk through the edge function.
create table if not exists public.candidate_rooms (
  code text primary key,
  host_token text not null,
  phase text not null default 'lobby',
  paused_phase text,
  round integer not null default 0,
  lifecycle_version bigint not null default 0,
  phase_started_at timestamptz not null default now(),
  phase_seconds integer not null default 60,
  settings jsonb not null default '{}'::jsonb,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.candidate_players (
  id text not null,
  room_code text not null references public.candidate_rooms(code) on delete cascade,
  name text not null,
  color text not null default '#c9a227',
  session_token text not null,
  seats integer not null default 0,
  votes_bank integer not null default 0,
  regions_count integer not null default 0,
  spotlight text,
  ready boolean not null default false,
  afk boolean not null default false,
  hand jsonb not null default '[]'::jsonb,
  secret jsonb not null default '{}'::jsonb,
  replacement_code text,
  replacement_expires_at timestamptz,
  joined_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (room_code, id)
);
