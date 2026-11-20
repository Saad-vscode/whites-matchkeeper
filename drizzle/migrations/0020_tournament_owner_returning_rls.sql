-- Allow a tournament creator to read the row returned by INSERT ... RETURNING
-- without querying tournaments recursively from its own restrictive SELECT policy.
BEGIN;

CREATE OR REPLACE FUNCTION public.tournament_row_read_access(
  _id uuid,
  _created_by uuid,
  _hidden boolean,
  _deleted_at timestamptz
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT _deleted_at IS NULL AND (
    NOT coalesce(_hidden, false)
    OR (
      public.platform_account_active(auth.uid())
      AND (
        _created_by = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
        OR EXISTS (
          SELECT 1 FROM public.matches m
          WHERE m.tournament_id = _id
            AND (
              m.created_by = auth.uid()
              OR EXISTS (
                SELECT 1 FROM public.match_scorers s
                WHERE s.match_id = m.id AND s.user_id = auth.uid()
              )
            )
        )
      )
    )
  )
$$;
REVOKE ALL ON FUNCTION public.tournament_row_read_access(uuid,uuid,boolean,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tournament_row_read_access(uuid,uuid,boolean,timestamptz) TO anon, authenticated;

DROP POLICY tournament_visibility_guard ON public.tournaments;
CREATE POLICY tournament_visibility_guard ON public.tournaments
  AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (public.tournament_row_read_access(id, created_by, platform_hidden, platform_deleted_at));

NOTIFY pgrst, 'reload schema';
COMMIT;
