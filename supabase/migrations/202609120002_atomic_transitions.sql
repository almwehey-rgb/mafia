-- The Edge computes game rules; PostgreSQL validates its immutable preimage
-- and atomically commits the entire result. Callable only by the service role.
create or replace function public.mafia_commit_transition(
 p_before_room jsonb,p_before_players jsonb,p_room jsonb,p_players jsonb,
 p_snapshots jsonb,p_audits jsonb,p_stats boolean
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.mafia_rooms%rowtype; expected public.mafia_rooms%rowtype;
 final_room public.mafia_rooms%rowtype; actual_players jsonb; expected_players jsonb;
 item jsonb; p public.mafia_players%rowtype;
 won integer; team text; season_key text; room_id text;
begin
 room_id:=p_before_room->>'code';
 select * into r from public.mafia_rooms where code=room_id for update;
 if not found then return jsonb_build_object('error','STALE_GAME'); end if;
 select * into expected from jsonb_populate_record(null::public.mafia_rooms,p_before_room);
 if (to_jsonb(r)-'host_seen_at') is distinct from (to_jsonb(expected)-'host_seen_at')
  then return jsonb_build_object('error','STALE_GAME'); end if;
 -- Presence may change while the result is computed, but role/action/roster
 -- changes invalidate it. Lock members in a stable order before comparison.
 perform 1 from public.mafia_players where room_code=room_id order by id for update;
 select coalesce(jsonb_agg(to_jsonb(x)-'last_seen' order by x.id),'[]'::jsonb) into actual_players
  from public.mafia_players x where room_code=room_id;
 select coalesce(jsonb_agg(to_jsonb(x)-'last_seen' order by x.id),'[]'::jsonb) into expected_players
  from jsonb_populate_recordset(null::public.mafia_players,p_before_players) x;
 if actual_players is distinct from expected_players then return jsonb_build_object('error','STALE_GAME'); end if;
 select * into final_room from jsonb_populate_record(null::public.mafia_rooms,p_room);
 if final_room.code is distinct from room_id or jsonb_array_length(p_players)<>jsonb_array_length(p_before_players)
  or (select jsonb_agg(x->>'id' order by x->>'id') from jsonb_array_elements(p_players) x)
    is distinct from (select jsonb_agg(x->>'id' order by x->>'id') from jsonb_array_elements(p_before_players) x)
  then raise exception 'INVALID_TRANSITION'; end if;
 for item in select value from jsonb_array_elements(p_snapshots) loop
  insert into public.mafia_snapshots(room_code,phase,round,reason,room_state,players_state)
   values(room_id,item->>'phase',(item->>'round')::integer,item->>'reason',item->'room_state',item->'players_state');
 end loop;
 delete from public.mafia_snapshots where room_code=room_id and id in
  (select id from public.mafia_snapshots where room_code=room_id order by created_at desc,id desc offset 20);
 for p in select * from jsonb_populate_recordset(null::public.mafia_players,p_players) loop
  if p.room_code is distinct from room_id then raise exception 'INVALID_TRANSITION'; end if;
  update public.mafia_players set role=p.role,role_state=p.role_state,alive=p.alive,
   action_target=p.action_target,vote_target=p.vote_target,investigation_result=p.investigation_result,will_text=p.will_text,
   name=p.name,session_token=p.session_token,profile_token=p.profile_token,
   replacement_code=p.replacement_code,replacement_expires_at=p.replacement_expires_at,
   last_seen=case when session_token is distinct from p.session_token then clock_timestamp() else last_seen end
   where room_code=room_id and id=p.id;
  if p.profile_token is not null and exists(select 1 from jsonb_populate_recordset(null::public.mafia_players,p_before_players) old_player where old_player.id=p.id and old_player.profile_token is distinct from p.profile_token) then
   insert into public.mafia_profiles(profile_token,nickname) values(p.profile_token,p.name) on conflict(profile_token) do nothing;
  end if;
 end loop;
 update public.mafia_rooms set phase=final_room.phase,round=final_room.round,
  enabled_roles=final_room.enabled_roles,jailed_player=final_room.jailed_player,accused_player=final_room.accused_player,
  jailer_executions=final_room.jailer_executions,doctor_last_target=final_room.doctor_last_target,
  linked_players=final_room.linked_players,last_event=final_room.last_event,last_deaths=final_room.last_deaths,
  last_eliminated=final_room.last_eliminated,last_saved=final_room.last_saved,winner=final_room.winner,
  winner_player=final_room.winner_player,host_player_id=final_room.host_player_id,
  phase_started_at=final_room.phase_started_at,phase_paused_at=final_room.phase_paused_at
  where code=room_id;
 if p_stats and not r.stats_recorded and final_room.winner is not null and final_room.winner<>'cancelled' then
  season_key:=extract(year from now() at time zone 'UTC')::integer::text||'-S'||extract(quarter from now() at time zone 'UTC')::integer::text;
  for p in select * from public.mafia_players where room_code=room_id and profile_token is not null and not is_bot order by profile_token,id loop
   team:=case when p.role in ('mafia','mafia_boss') then 'mafia' when p.role in ('serial_killer','jester') then 'independent' else 'village' end;
   won:=(final_room.winner=team or (final_room.winner='serial_killer' and p.role='serial_killer') or (final_room.winner='jester' and p.id=final_room.winner_player))::integer;
   insert into public.mafia_profiles(profile_token,nickname,games,wins,village_wins,mafia_wins,independent_wins)
    values(p.profile_token,p.name,1,won,case when team='village' then won else 0 end,case when team='mafia' then won else 0 end,case when team='independent' then won else 0 end)
    on conflict(profile_token) do update set games=public.mafia_profiles.games+1,wins=public.mafia_profiles.wins+excluded.wins,
     village_wins=public.mafia_profiles.village_wins+excluded.village_wins,mafia_wins=public.mafia_profiles.mafia_wins+excluded.mafia_wins,
     independent_wins=public.mafia_profiles.independent_wins+excluded.independent_wins,nickname=excluded.nickname,updated_at=now();
   insert into public.mafia_season_stats(profile_token,season,games,wins) values(p.profile_token,season_key,1,won)
    on conflict(profile_token,season) do update set games=public.mafia_season_stats.games+1,wins=public.mafia_season_stats.wins+excluded.wins,updated_at=now();
  end loop;
  update public.mafia_rooms set stats_recorded=true where code=room_id;
 end if;
 for item in select value from jsonb_array_elements(p_audits) loop
  insert into public.mafia_audit_events(room_code,action,status,duration_ms) values(room_id,item->>'action',item->>'status',(item->>'duration_ms')::integer);
 end loop;
 -- Bump last: all above writes belong to the observed generation.
 update public.mafia_rooms set lifecycle_version=lifecycle_version+1 where code=room_id returning * into r;
 return jsonb_build_object('ok',true,'lifecycleVersion',r.lifecycle_version);
end;
$$;
revoke all on function public.mafia_commit_transition(jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.mafia_commit_transition(jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,boolean) to service_role;
