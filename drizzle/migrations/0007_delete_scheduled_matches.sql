-- All app match deletion goes through a locked, status-checked operation.
REVOKE DELETE ON public.matches FROM authenticated, anon;

CREATE FUNCTION public.delete_scheduled_match(_match uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target public.matches%ROWTYPE;
BEGIN
  SELECT * INTO target FROM public.matches WHERE id = _match FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match no longer exists'; END IF;
  IF auth.uid() IS NULL OR NOT (
    public.is_match_owner(_match) OR
    (target.tournament_id IS NOT NULL AND public.is_tournament_owner(target.tournament_id))
  ) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF target.status <> 'scheduled' OR EXISTS (
    SELECT 1 FROM public.deliveries WHERE match_id = _match
  ) THEN
    RAISE EXCEPTION 'Only scheduled matches with no recorded deliveries can be deleted';
  END IF;
  DELETE FROM public.matches WHERE id = _match;
END $$;
REVOKE ALL ON FUNCTION public.delete_scheduled_match(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_scheduled_match(uuid) TO authenticated;
