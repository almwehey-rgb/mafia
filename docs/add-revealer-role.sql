ALTER TABLE public.mafia_players DROP CONSTRAINT mafia_players_role_check;
ALTER TABLE public.mafia_players ADD CONSTRAINT mafia_players_role_check CHECK (role IS NULL OR role = ANY (ARRAY['mafia','mafia_boss','doctor','detective','lawyer','jailer','vigilante','witch','serial_killer','jester','cupid','escort','citizen','revealer']::text[]));
