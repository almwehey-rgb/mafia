-- Host passes. Service-only access; charging participates in the match transaction.
create table if not exists public.mafia_host_codes (
 id uuid primary key default gen_random_uuid(),
 code text not null unique,
 label text not null default '',
 remaining integer not null check (remaining between 0 and 100000),
 used integer not null default 0 check (used >= 0),
 active boolean not null default true,
 bound_profile text,
 claimed_at timestamptz,
 created_at timestamptz not null default now(),
 preferences jsonb not null default '{}'::jsonb
);
alter table public.mafia_host_codes enable row level security;
revoke all on public.mafia_host_codes from public, anon, authenticated;
grant select,insert,update on public.mafia_host_codes to service_role;
alter table public.mafia_host_sessions add column if not exists access_code_id uuid references public.mafia_host_codes(id);
alter table public.mafia_rooms add column if not exists access_code_id uuid references public.mafia_host_codes(id);

create or replace function public.mafia_redeem_host_code(p_code text,p_profile text,p_session_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.mafia_host_codes%rowtype;
begin
 if p_profile is null or p_session_hash is null or length(p_profile) not between 20 and 80 or length(p_session_hash)<>64 then
  return jsonb_build_object('error','INVALID_ACCESS_CODE');
 end if;
 select * into c from public.mafia_host_codes where code=p_code for update;
 if not found or not c.active then return jsonb_build_object('error','INVALID_ACCESS_CODE'); end if;
 if c.bound_profile is not null and c.bound_profile<>p_profile then
  return jsonb_build_object('error','ACCESS_CODE_BOUND');
 end if;
 if c.remaining<=0 then return jsonb_build_object('error','ACCESS_CODE_EXHAUSTED'); end if;
 update public.mafia_host_codes set bound_profile=p_profile,claimed_at=coalesce(claimed_at,now()) where id=c.id;
 insert into public.mafia_profiles(profile_token,nickname,recovery_code)
 values(p_profile,left(coalesce(nullif(c.label,''),'مضيف'),20),upper(left(replace(gen_random_uuid()::text,'-',''),12)))
 on conflict(profile_token) do nothing;
 insert into public.mafia_host_sessions(token_hash,expires_at,access_code_id)
 values(p_session_hash,now()+interval '90 days',c.id);
 return jsonb_build_object('ok',true,'remaining',c.remaining,'label',c.label,'preferences',c.preferences);
end;
$$;
revoke all on function public.mafia_redeem_host_code(text,text,text) from public,anon,authenticated;
grant execute on function public.mafia_redeem_host_code(text,text,text) to service_role;

create or replace function public.mafia_update_host_code(p_id uuid,p_add integer,p_active boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.mafia_host_codes%rowtype;
begin
 if p_add is null or p_add not between 0 and 10000 then return jsonb_build_object('error','INVALID_SETTINGS'); end if;
 select * into c from public.mafia_host_codes where id=p_id for update;
 if not found then return jsonb_build_object('error','CODE_NOT_FOUND'); end if;
 if c.remaining+p_add>100000 then return jsonb_build_object('error','INVALID_SETTINGS'); end if;
 update public.mafia_host_codes set remaining=remaining+p_add,active=coalesce(p_active,active) where id=p_id;
 return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.mafia_update_host_code(uuid,integer,boolean) from public,anon,authenticated;
grant execute on function public.mafia_update_host_code(uuid,integer,boolean) to service_role;

create or replace function public.mafia_charge_host_code()
returns trigger language plpgsql security invoker set search_path='' as $$
declare c public.mafia_host_codes%rowtype;
begin
 if new.access_code_id is null or new.phase<>'reveal' or new.match_id is not distinct from old.match_id then return new; end if;
 select * into c from public.mafia_host_codes where id=new.access_code_id for update;
 if not found or not c.active then raise exception 'ACCESS_CODE_DISABLED'; end if;
 if c.remaining<=0 then raise exception 'ACCESS_CODE_EXHAUSTED'; end if;
 update public.mafia_host_codes set remaining=remaining-1,used=used+1 where id=c.id;
 return new;
end;
$$;
revoke all on function public.mafia_charge_host_code() from public,anon,authenticated;
grant execute on function public.mafia_charge_host_code() to service_role;
drop trigger if exists mafia_charge_host_code on public.mafia_rooms;
create trigger mafia_charge_host_code before update of match_id on public.mafia_rooms
for each row execute function public.mafia_charge_host_code();
