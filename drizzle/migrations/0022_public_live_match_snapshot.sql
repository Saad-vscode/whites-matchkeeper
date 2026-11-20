-- Read-only, authorization-checked snapshot for spectator/TV refreshes.
-- This keeps TV polling reliable when restrictive table policies or Realtime
-- delivery are unavailable, without granting broader direct table access.
BEGIN;

CREATE OR REPLACE FUNCTION public.read_live_match(_match uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE
    WHEN public.match_read_access(_match) THEN (
      SELECT jsonb_build_object(
        'match', to_jsonb(m),
        'deliveries', coalesce((
          SELECT jsonb_agg(to_jsonb(d) ORDER BY d.innings, d.seq)
          FROM public.deliveries d
          WHERE d.match_id = m.id
        ), '[]'::jsonb)
      )
      FROM public.matches m
      WHERE m.id = _match
    )
    ELSE NULL
  END
$$;

REVOKE ALL ON FUNCTION public.read_live_match(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_live_match(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.read_live_tournament_matches(_tournament uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE
    WHEN public.tournament_read_access(_tournament) THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', m.id,
        'status', m.status,
        'created_at', m.created_at,
        'toss_winner', m.toss_winner
      ) ORDER BY m.created_at, m.id)
      FROM public.matches m
      WHERE m.tournament_id = _tournament
    ), '[]'::jsonb)
    ELSE NULL
  END
$$;

REVOKE ALL ON FUNCTION public.read_live_tournament_matches(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_live_tournament_matches(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
