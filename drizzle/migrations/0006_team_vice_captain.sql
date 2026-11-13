ALTER TABLE public.tournament_teams
  ADD COLUMN vice_captain text,
  ADD CONSTRAINT vice_captain_in_squad CHECK (vice_captain IS NULL OR vice_captain = ANY(players)),
  ADD CONSTRAINT distinct_team_leaders CHECK (
    captain IS NULL OR vice_captain IS NULL OR
    lower(regexp_replace(trim(captain), '\s+', ' ', 'g')) <> lower(regexp_replace(trim(vice_captain), '\s+', ' ', 'g'))
  );
