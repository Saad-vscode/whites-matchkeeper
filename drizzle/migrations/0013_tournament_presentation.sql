-- Apply after 0012. Presentation commands only; no computed cricket totals.
BEGIN;
CREATE TABLE public.tournament_presentation (
 tournament_id uuid PRIMARY KEY REFERENCES public.tournaments(id) ON DELETE CASCADE,
 playing boolean NOT NULL DEFAULT false,
 seconds integer NOT NULL DEFAULT 8 CHECK(seconds BETWEEN 5 AND 10),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tournament_presentation ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.tournament_presentation TO anon,authenticated;
CREATE POLICY "public presentation read" ON public.tournament_presentation FOR SELECT USING(true);
CREATE FUNCTION public.read_tournament_presentation(_t uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT COALESCE((SELECT to_jsonb(p) FROM public.tournament_presentation p WHERE tournament_id=_t),'{"playing":false,"seconds":8}'::jsonb)
$$;
CREATE FUNCTION public.set_tournament_presentation(_t uuid,_playing boolean,_seconds integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT (public.is_tournament_owner(_t) OR EXISTS(SELECT 1 FROM public.matches m WHERE m.tournament_id=_t AND public.can_score(m.id))) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 IF _playing IS NULL OR _seconds IS NULL OR _seconds NOT BETWEEN 5 AND 10 THEN RAISE EXCEPTION 'Invalid presentation settings'; END IF;
 IF _playing AND NOT EXISTS(SELECT 1 FROM public.matches WHERE tournament_id=_t AND status='completed' AND (rules->>'playoffNode'='final' OR lower(rules->'tournamentStage'->>'title')='final')) THEN RAISE EXCEPTION 'Complete the final first'; END IF;
 INSERT INTO public.tournament_presentation(tournament_id,playing,seconds) VALUES(_t,_playing,_seconds)
 ON CONFLICT(tournament_id) DO UPDATE SET playing=EXCLUDED.playing,seconds=EXCLUDED.seconds,updated_at=clock_timestamp();
END $$;
REVOKE ALL ON FUNCTION public.read_tournament_presentation(uuid),public.set_tournament_presentation(uuid,boolean,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_tournament_presentation(uuid) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_tournament_presentation(uuid,boolean,integer) TO authenticated;
COMMIT;
