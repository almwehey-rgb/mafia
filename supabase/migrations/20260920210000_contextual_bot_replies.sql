create or replace function public.mafia_public_bot_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare bot public.mafia_players%rowtype;
begin
  if new.channel <> 'public' then return new; end if;
  if exists (select 1 from public.mafia_players p where p.room_code = new.room_code and p.id = new.author_id and p.is_bot) then return new; end if;

  select p.* into bot
  from public.mafia_players p
  where p.room_code = new.room_code and p.is_bot and p.alive
    and position(lower(p.name) in lower(new.content)) > 0
  order by p.joined_at, p.id
  limit 1;
  if bot.id is null then return new; end if;

  insert into public.mafia_messages(room_code, round, channel, author_id, author_name, content)
  values (
    new.room_code, new.round, 'public', bot.id, bot.name,
    case bot.role_state->>'botStyle'
      when 'bold' then 'أتفق أن ' || bot.name || ' يحتاج يوضح موقفه.'
      when 'empathetic' then 'خلونا نعطي ' || bot.name || ' فرصة يشرح.'
      when 'skeptic' then 'شنو الدليل على ' || bot.name || '؟ نحتاج واقعة محددة.'
      else 'سمعت الاتهام ضد ' || bot.name || '، نراقب رده.'
    end
  );
  return new;
end;
$$;

drop trigger if exists mafia_public_bot_reply on public.mafia_messages;
create trigger mafia_public_bot_reply
after insert on public.mafia_messages
for each row execute function public.mafia_public_bot_reply();
