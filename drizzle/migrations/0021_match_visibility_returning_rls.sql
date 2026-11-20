-- Evaluate match visibility from the row already being checked. The previous
-- policy called match_read_access(id), which re-read matches while Postgres
-- was evaluating the same table's restrictive SELECT policy. INSERT ...
-- RETURNING then failed for both tournament fixtures and independent matches.
BEGIN;

CREATE FUNCTION public.match_row_read_access(
  _match_id uuid,
  _tournament_id uuid,
  _created_by uuid,
  _hidden boolean,
  _deleted_at timestamptz
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT _tournament_id IS NOT NULL OR (_deleted_at IS NULL AND (
      NOT coalesce(_hidden, false)
      OR (
        public.platform_account_active(auth.uid())
        AND (
          _created_by = auth.uid()
          OR public.has_role(auth.uid(), 'admin')
          OR EXISTS (
            SELECT 1 FROM public.match_scorers s
            WHERE s.match_id = _match_id AND s.user_id = auth.uid()
          )
        )
      )
    ))
$$;
REVOKE ALL ON FUNCTION public.match_row_read_access(uuid,uuid,uuid,boolean,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_row_read_access(uuid,uuid,uuid,boolean,timestamptz) TO anon, authenticated;

DROP POLICY independent_match_visibility ON public.matches;
CREATE POLICY independent_match_visibility ON public.matches
  AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (public.match_row_read_access(id, tournament_id, created_by, platform_hidden, platform_deleted_at));

NOTIFY pgrst, 'reload schema';
COMMIT;
