-- A new seat and its profile either both commit or neither commits.
-- The client retains a random session token before sending, so a lost response
-- can be retried without allocating another seat. Legacy clients may use a
-- server-generated token supplied by Edge.
create or replace function public.mafia_join_seat(
 p_code text,p_id text,p_name text,p_player_token text,p_profile_token text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.mafia_rooms%rowtype;p public.mafia_players%rowtype;
begin
 select * into r from public.mafia_rooms where code=p_code for update;
 if not found then return jsonb_build_object('error','ROOM_NOT_FOUND');end if;
 select * into p from public.mafia_players where room_code=p_code and id=p_id;
 if found then
  if p.left_at is not null or p.session_token is null or p.session_token<>p_player_token then return jsonb_build_object('error','SESSION_INVALID');end if;
  update public.mafia_players set last_seen=now() where room_code=p_code and id=p_id returning * into p;
  return jsonb_build_object('player',to_jsonb(p));
 end if;
 if r.phase<>'lobby' then return jsonb_build_object('error','GAME_STARTED');end if;
 if p_id is null or p_id!~'^[A-Za-z0-9_-]{1,80}$' then return jsonb_build_object('error','INVALID_PLAYER_ID');end if;
 if p_name is null or char_length(btrim(p_name)) not between 1 and 20 then return jsonb_build_object('error','NAME_REQUIRED');end if;
 if p_player_token is null or char_length(p_player_token)<32 or p_profile_token is null or p_profile_token='' then return jsonb_build_object('error','SESSION_INVALID');end if;
 if (select count(*) from public.mafia_players where room_code=p_code)>=20 then return jsonb_build_object('error','ROOM_FULL');end if;
 if exists(select 1 from public.mafia_players where room_code=p_code and lower(btrim(name))=lower(btrim(p_name))) then return jsonb_build_object('error','NAME_TAKEN');end if;
 insert into public.mafia_profiles(profile_token,nickname) values(p_profile_token,btrim(p_name))
 on conflict(profile_token) do update set nickname=excluded.nickname,updated_at=now();
 insert into public.mafia_players(room_code,id,name,session_token,profile_token,last_seen)
 values(p_code,p_id,btrim(p_name),p_player_token,p_profile_token,now()) returning * into p;
 return jsonb_build_object('player',to_jsonb(p));
end;
$$;
revoke all on function public.mafia_join_seat(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.mafia_join_seat(text,text,text,text,text) to service_role;
