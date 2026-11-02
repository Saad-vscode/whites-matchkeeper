CREATE TABLE public.tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  short_name text,
  primary_color text NOT NULL DEFAULT '#1f4d3a',
  accent_color text NOT NULL DEFAULT '#c8a24a',
  logo_url text,
  overs integer NOT NULL DEFAULT 20,
  balls_per_over integer NOT NULL DEFAULT 6,
  players_per_team integer NOT NULL DEFAULT 11,
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  points_win integer NOT NULL DEFAULT 2,
  points_tie integer NOT NULL DEFAULT 1,
  points_loss integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tournaments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournaments TO authenticated;
GRANT ALL ON public.tournaments TO service_role;
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_tournament_owner(_t uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.tournaments WHERE id = _t AND created_by = auth.uid())
$$;

CREATE POLICY "tournaments public read" ON public.tournaments FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "tournaments create own" ON public.tournaments FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "tournaments update own" ON public.tournaments FOR UPDATE TO authenticated USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
CREATE POLICY "tournaments delete own" ON public.tournaments FOR DELETE TO authenticated USING (created_by = auth.uid());

CREATE TABLE public.tournament_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  name text NOT NULL,
  short_name text,
  color text NOT NULL DEFAULT '#1f4d3a',
  players text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, name)
);
GRANT SELECT ON public.tournament_teams TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournament_teams TO authenticated;
GRANT ALL ON public.tournament_teams TO service_role;
ALTER TABLE public.tournament_teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teams public read" ON public.tournament_teams FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "teams insert by owner" ON public.tournament_teams FOR INSERT TO authenticated WITH CHECK (public.is_tournament_owner(tournament_id));
CREATE POLICY "teams update by owner" ON public.tournament_teams FOR UPDATE TO authenticated USING (public.is_tournament_owner(tournament_id)) WITH CHECK (public.is_tournament_owner(tournament_id));
CREATE POLICY "teams delete by owner" ON public.tournament_teams FOR DELETE TO authenticated USING (public.is_tournament_owner(tournament_id));

ALTER TABLE public.matches ADD COLUMN tournament_id uuid REFERENCES public.tournaments(id) ON DELETE SET NULL;
ALTER TABLE public.matches ADD COLUMN team_a_id uuid REFERENCES public.tournament_teams(id) ON DELETE SET NULL;
ALTER TABLE public.matches ADD COLUMN team_b_id uuid REFERENCES public.tournament_teams(id) ON DELETE SET NULL;
CREATE INDEX matches_tournament_idx ON public.matches(tournament_id);

DROP POLICY "matches create own" ON public.matches;
CREATE POLICY "matches create own" ON public.matches FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND (tournament_id IS NULL OR public.is_tournament_owner(tournament_id)));