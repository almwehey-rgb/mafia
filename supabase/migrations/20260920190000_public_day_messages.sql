alter table public.mafia_messages drop constraint if exists mafia_messages_channel_check;
alter table public.mafia_messages add constraint mafia_messages_channel_check check (channel = any (array['public'::text,'mafia'::text,'jail'::text]));
