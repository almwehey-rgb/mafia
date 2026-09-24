-- Reuse the atomic role-dealing transition without exposing a half-reset room.
create or replace function public.mafia_restart_match(
 p_code text, p_version bigint, p_host_token text, p_player_id text,
 p_player_token text, p_assignments jsonb, p_settings jsonb,
 p_mafia integer, p_detectives integer, p_questions integer
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.mafia_rooms%rowtype; result jsonb;
begin
 select * into r from public.mafia_rooms where code=p_code for update;
 if not found then return jsonb_build_object('error','ROOM_NOT_FOUND'); end if;
 if r.phase in ('lobby','finished') then return jsonb_build_object('error','INVALID_ACTION'); end if;
 if p_version is null or r.lifecycle_version<>p_version then return jsonb_build_object('error','STALE_GAME'); end if;
 if not coalesce(((p_host_token is not null and p_host_token<>'' and p_host_token=r.host_token)
  or exists(select 1 from public.mafia_players p where p.room_code=p_code
   and p.id=r.host_player_id and p.id=p_player_id and p.session_token is not null
   and p.session_token=p_player_token)),false) then return jsonb_build_object('error','UNAUTHORIZED'); end if;
 -- The original start RPC accepts finished rooms and clears the previous match
 -- transactionally. Restore the old phase if its validation rejects the deal.
 update public.mafia_rooms set phase='finished' where code=p_code;
 result := public.mafia_start_match(p_code,p_version,p_host_token,p_player_id,
  p_player_token,p_assignments,p_settings,p_mafia,p_detectives,p_questions);
 if result->>'ok' is distinct from 'true' then
  update public.mafia_rooms set phase=r.phase where code=p_code;
 end if;
 return result;
end;
$$;
revoke all on function public.mafia_restart_match(text,bigint,text,text,text,jsonb,jsonb,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.mafia_restart_match(text,bigint,text,text,text,jsonb,jsonb,integer,integer,integer) to service_role;
