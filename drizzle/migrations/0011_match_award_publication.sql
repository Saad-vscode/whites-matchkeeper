-- Stores publication intent only. Winner(s) and points are derived from deliveries.
-- Existing matches/deliveries are unchanged; stale awards are hidden after corrections.
BEGIN;
CREATE TABLE IF NOT EXISTS public.match_award_publications (
  match_id uuid PRIMARY KEY REFERENCES public.matches(id) ON DELETE CASCADE,
  score_revision bigint NOT NULL,
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.match_award_publications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public award reads" ON public.match_award_publications;
CREATE POLICY "Public award reads" ON public.match_award_publications FOR SELECT USING (true);
REVOKE ALL ON public.match_award_publications FROM anon, authenticated;
GRANT SELECT ON public.match_award_publications TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.read_match_award(_match uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT jsonb_build_object('score_revision', a.score_revision, 'published_at', a.published_at)
  FROM public.match_award_publications a JOIN public.matches m ON m.id = a.match_id
  WHERE a.match_id = _match AND m.status = 'completed' AND a.score_revision = m.score_revision;
$$;
REVOKE ALL ON FUNCTION public.read_match_award(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_match_award(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.publish_match_award(_match uuid, _expected bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m public.matches;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_score(_match) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT * INTO m FROM public.matches WHERE id = _match FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF m.status <> 'completed' THEN RAISE EXCEPTION 'Complete the match before publishing the award'; END IF;
  IF m.score_revision IS DISTINCT FROM _expected THEN RAISE EXCEPTION 'SCORE_CONFLICT: Refresh the match before calculating the award'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.deliveries WHERE match_id = _match) THEN RAISE EXCEPTION 'No deliveries to calculate'; END IF;
  INSERT INTO public.match_award_publications(match_id, score_revision, published_by)
  VALUES (_match, m.score_revision, auth.uid())
  ON CONFLICT (match_id) DO UPDATE SET score_revision = EXCLUDED.score_revision,
    published_by = EXCLUDED.published_by, published_at = now();
  RETURN public.read_match_award(_match);
END;
$$;
REVOKE ALL ON FUNCTION public.publish_match_award(uuid,bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_match_award(uuid,bigint) TO authenticated;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
    AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'match_award_publications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.match_award_publications;
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
