-- Run after bootstrap.sql and all migrations on a NEW database.
-- The Edge authenticates each request; browsers have no direct table access.
begin;
grant usage on schema public to service_role;
do $$
declare item record;
begin
  for item in select tablename from pg_tables where schemaname='public' and tablename like 'mafia\_%' escape '\' loop
    execute format('alter table public.%I enable row level security',item.tablename);
    execute format('revoke all on public.%I from anon, authenticated',item.tablename);
    execute format('grant all on public.%I to service_role',item.tablename);
  end loop;
  for item in select sequencename from pg_sequences where schemaname='public' and sequencename like 'mafia\_%' escape '\' loop
    execute format('revoke all on sequence public.%I from anon, authenticated',item.sequencename);
    execute format('grant usage, select on sequence public.%I to service_role',item.sequencename);
  end loop;
end;
$$;
commit;
