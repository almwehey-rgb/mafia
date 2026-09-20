-- Manual dry run, never scheduled. Finished rooms only; preserve profiles/statistics.
-- Lock room rows before deleting dependants to serialize against resume/rematch.
begin;
create temporary table cleanup_candidates on commit drop as
select code from public.mafia_rooms r
where phase='finished'
  and (stats_recorded or winner='cancelled')
  and phase_started_at < now()-interval '30 days'
  and host_seen_at < now()-interval '7 days'
  and not exists(select 1 from public.mafia_players p where p.room_code=r.code and p.last_seen>now()-interval '7 days')
  and not exists(select 1 from public.mafia_spectators s where s.room_code=r.code and s.last_seen>now()-interval '7 days')
for update of r skip locked;
select code as candidate_room from cleanup_candidates order by code;
delete from public.mafia_audit_events where room_code in(select code from cleanup_candidates);
delete from public.mafia_rooms where code in(select code from cleanup_candidates);
-- Default is a preview, including actual cascades inside a rolled-back transaction.
rollback;
