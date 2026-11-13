-- Tournament presentation and grouping only; scoring remains behind its atomic RPC.
-- Use the existing administrator role, as match ownership already does.
CREATE OR REPLACE FUNCTION public.is_tournament_owner(_t uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.tournaments WHERE id = _t AND created_by = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
$$;
DROP POLICY "tournaments update own" ON public.tournaments;
CREATE POLICY "tournaments update own" ON public.tournaments FOR UPDATE TO authenticated
  USING (public.is_tournament_owner(id)) WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
DROP POLICY "tournaments delete own" ON public.tournaments;
CREATE POLICY "tournaments delete own" ON public.tournaments FOR DELETE TO authenticated USING (public.is_tournament_owner(id));

ALTER TABLE public.tournaments
  ADD COLUMN location text,
  ADD COLUMN description text,
  ADD COLUMN start_date date,
  ADD COLUMN end_date date,
  ADD COLUMN competition_format text NOT NULL DEFAULT 'league' CHECK (competition_format IN ('league', 'groups', 'knockout')),
  ADD COLUMN ranking_rule text NOT NULL DEFAULT 'points_nrr_wins' CHECK (ranking_rule IN ('points_nrr_wins', 'points_wins_nrr')),
  ADD COLUMN points_no_result integer NOT NULL DEFAULT 1 CHECK (points_no_result >= 0),
  ADD CONSTRAINT tournament_date_order CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date);

ALTER TABLE public.tournament_teams
  ADD COLUMN logo_url text,
  ADD COLUMN captain text,
  ADD CONSTRAINT captain_in_squad CHECK (captain IS NULL OR captain = ANY(players));
ALTER TABLE public.matches ADD COLUMN scheduled_time time;

CREATE TABLE public.tournament_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  team_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, name)
);
ALTER TABLE public.tournament_groups ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.tournament_groups TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.tournament_groups TO authenticated;
GRANT ALL ON public.tournament_groups TO service_role;
CREATE POLICY "groups public read" ON public.tournament_groups FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "groups owner insert" ON public.tournament_groups FOR INSERT TO authenticated WITH CHECK (public.is_tournament_owner(tournament_id));
CREATE POLICY "groups owner update" ON public.tournament_groups FOR UPDATE TO authenticated USING (public.is_tournament_owner(tournament_id)) WITH CHECK (public.is_tournament_owner(tournament_id));
CREATE POLICY "groups owner delete" ON public.tournament_groups FOR DELETE TO authenticated USING (public.is_tournament_owner(tournament_id));

CREATE FUNCTION public.validate_tournament_group() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- Serialize group membership edits within a tournament.
  PERFORM id FROM public.tournaments WHERE id = NEW.tournament_id FOR UPDATE;
  IF TG_OP = 'UPDATE' AND NEW.tournament_id <> OLD.tournament_id THEN
    RAISE EXCEPTION 'A group cannot move between tournaments';
  END IF;
  IF cardinality(NEW.team_ids) <> (SELECT count(DISTINCT x) FROM unnest(NEW.team_ids) x)
    OR EXISTS (SELECT 1 FROM unnest(NEW.team_ids) x WHERE NOT EXISTS (
      SELECT 1 FROM public.tournament_teams t WHERE t.id = x AND t.tournament_id = NEW.tournament_id
    )) THEN RAISE EXCEPTION 'Choose distinct teams from this tournament'; END IF;
  IF EXISTS (SELECT 1 FROM public.tournament_groups g WHERE g.tournament_id = NEW.tournament_id AND g.id <> NEW.id AND g.team_ids && NEW.team_ids) THEN
    RAISE EXCEPTION 'A team already belongs to another group';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_tournament_group BEFORE INSERT OR UPDATE ON public.tournament_groups FOR EACH ROW EXECUTE FUNCTION public.validate_tournament_group();

CREATE FUNCTION public.remove_deleted_group_team() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.tournament_groups SET team_ids = array_remove(team_ids, OLD.id) WHERE tournament_id = OLD.tournament_id AND OLD.id = ANY(team_ids);
  RETURN OLD;
END $$;
CREATE TRIGGER remove_deleted_group_team AFTER DELETE ON public.tournament_teams FOR EACH ROW EXECUTE FUNCTION public.remove_deleted_group_team();

ALTER PUBLICATION supabase_realtime ADD TABLE public.tournaments, public.tournament_teams, public.tournament_groups;
ALTER TABLE public.tournaments REPLICA IDENTITY FULL;
ALTER TABLE public.tournament_teams REPLICA IDENTITY FULL;
ALTER TABLE public.tournament_groups REPLICA IDENTITY FULL;

CREATE FUNCTION public.save_tournament_group(_t uuid, _id uuid, _name text, _teams uuid[])
RETURNS uuid LANGUAGE plpgsql SET search_path = public AS $$
DECLARE saved_id uuid;
BEGIN
  IF NOT public.is_tournament_owner(_t) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  PERFORM id FROM public.tournaments WHERE id = _t FOR UPDATE;
  IF _id IS NULL THEN
    INSERT INTO public.tournament_groups(tournament_id, name, team_ids) VALUES (_t, trim(_name), _teams) RETURNING id INTO saved_id;
  ELSE
    UPDATE public.tournament_groups SET name = trim(_name), team_ids = _teams WHERE id = _id AND tournament_id = _t RETURNING id INTO saved_id;
    IF saved_id IS NULL THEN RAISE EXCEPTION 'Group not found'; END IF;
  END IF;
  UPDATE public.tournaments SET competition_format = 'groups' WHERE id = _t;
  RETURN saved_id;
END $$;
REVOKE ALL ON FUNCTION public.save_tournament_group(uuid, uuid, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_tournament_group(uuid, uuid, text, uuid[]) TO authenticated;
