-- Schedule metadata only: scoring continues to use apply_score_operation.
CREATE FUNCTION public.edit_scheduled_match(_match uuid, _expected bigint, _date date, _time time, _venue text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target public.matches%ROWTYPE;
BEGIN
  SELECT * INTO target FROM public.matches WHERE id = _match FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match no longer exists'; END IF;
  IF auth.uid() IS NULL OR NOT (
    public.is_match_owner(_match) OR
    (target.tournament_id IS NOT NULL AND public.is_tournament_owner(target.tournament_id))
  ) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF target.status <> 'scheduled' OR EXISTS (SELECT 1 FROM public.deliveries WHERE match_id = _match) THEN
    RAISE EXCEPTION 'Only scheduled matches with no recorded deliveries can be edited';
  END IF;
  IF _expected IS NULL OR target.score_revision <> _expected THEN
    RAISE EXCEPTION 'Match changed. Close the editor and reopen it before saving.';
  END IF;
  UPDATE public.matches SET match_date = _date, scheduled_time = _time,
    venue = NULLIF(trim(_venue), ''), updated_at = now() WHERE id = _match;
END $$;
REVOKE ALL ON FUNCTION public.edit_scheduled_match(uuid, bigint, date, time, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edit_scheduled_match(uuid, bigint, date, time, text) TO authenticated;
