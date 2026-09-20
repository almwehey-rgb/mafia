alter table public.mafia_rooms add column if not exists host_session_hash text;
alter table public.mafia_rooms add column if not exists phase_started_at timestamptz not null default now();
alter table public.mafia_rooms add column if not exists phase_paused_at timestamptz;

create or replace function public.mafia_phase_clock() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.phase is distinct from old.phase then
    if new.phase = 'paused' then
      new.phase_paused_at := clock_timestamp();
    elsif old.phase = 'paused' and old.phase_paused_at is not null then
      new.phase_started_at := old.phase_started_at + (clock_timestamp() - old.phase_paused_at);
      new.phase_paused_at := null;
    else
      new.phase_started_at := clock_timestamp();
      new.phase_paused_at := null;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.mafia_phase_clock() from public, anon, authenticated;
create trigger mafia_phase_clock_update before update of phase on public.mafia_rooms
for each row execute function public.mafia_phase_clock();
create index if not exists mafia_rooms_host_session_idx on public.mafia_rooms(host_session_hash) where host_session_hash is not null;
