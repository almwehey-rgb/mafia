-- Host can return the room to lobby mid-match, not only after a finished game.
CREATE OR REPLACE FUNCTION public.mafia_return_to_lobby(p_code text, p_version bigint, p_host_token text, p_player_id text, p_player_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  r public.mafia_rooms%rowtype;
begin
  select * into r from public.mafia_rooms where code = p_code for update;
  if not found then return jsonb_build_object('error','ROOM_NOT_FOUND'); end if;
  if not coalesce((
    (p_host_token is not null and p_host_token <> '' and p_host_token = r.host_token)
    or exists (select 1 from public.mafia_players p where p.room_code = p_code
      and p.id = r.host_player_id and p.id = p_player_id
      and p.session_token is not null and p.session_token = p_player_token)
  ), false) then return jsonb_build_object('error','UNAUTHORIZED'); end if;
  if r.lifecycle_version <> p_version or p_version is null then
    return jsonb_build_object('error','STALE_GAME');
  end if;
  if r.phase = 'lobby' then return jsonb_build_object('error','INVALID_ACTION'); end if;

  update public.mafia_rooms set phase='lobby' where code=p_code;
  delete from public.mafia_players where room_code=p_code and left_at is not null;
  update public.mafia_players set role = null, role_state = '{}'::jsonb,
    alive = true, action_target = null, vote_target = null,
    investigation_result = null, will_text = '', replacement_code = null,
    replacement_expires_at = null where room_code = p_code;
  delete from public.mafia_messages where room_code = p_code;
  delete from public.mafia_reports where room_code = p_code;
  delete from public.mafia_snapshots where room_code = p_code;
  update public.mafia_rooms set phase = 'lobby', round = 0,
    lifecycle_version = lifecycle_version + 1,
    phase_started_at = now(), phase_paused_at = null,
    enabled_roles = enabled_roles - array['discussion_state','pending_shot','leader_election',
      'vote_summary','admin_access','paused_phase'],
    jailed_player = null, accused_player = null, jailer_executions = 3,
    doctor_last_target = null, linked_players = '[]'::jsonb,
    last_event = 'returned_to_lobby', last_deaths = '[]'::jsonb,
    last_eliminated = null, last_saved = false, winner = null,
    winner_player = null, stats_recorded = false where code = p_code;
  return jsonb_build_object('ok',true);
end;
$function$;
