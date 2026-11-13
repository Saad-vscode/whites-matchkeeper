CREATE OR REPLACE FUNCTION public.apply_score_operation(_match uuid, _id uuid, _expected bigint, _kind text, _delivery jsonb, _patch jsonb, _reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m public.matches; old_d jsonb; new_d jsonb; did uuid; rev bigint;
BEGIN
 IF auth.uid() IS NULL OR NOT public.can_score(_match) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 SELECT * INTO m FROM public.matches WHERE id = _match FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
 IF EXISTS(SELECT 1 FROM public.score_operations WHERE id = _id AND match_id = _match AND actor_id = auth.uid()) THEN RETURN public.scoring_snapshot(_match); END IF;
 IF m.score_revision <> _expected THEN RAISE EXCEPTION 'SCORE_CONFLICT: Another scorer changed this match'; END IF;
 IF _kind NOT IN ('ball','undo','edit','state') THEN RAISE EXCEPTION 'Invalid operation'; END IF;
 IF _patch ? 'overs' OR _patch ? 'balls_per_over' THEN
  IF _kind <> 'state' OR m.status <> 'scheduled' OR m.toss_winner IS NOT NULL
    OR EXISTS (SELECT 1 FROM public.deliveries WHERE match_id = _match) THEN
    RAISE EXCEPTION 'SCORE_CONFLICT: Match format can only change before the toss and first delivery';
  END IF;
  IF (_patch ? 'overs' AND (COALESCE(_patch->>'overs','') !~ '^[0-9]+$' OR (_patch->>'overs')::numeric NOT BETWEEN 1 AND 100))
    OR (_patch ? 'balls_per_over' AND (COALESCE(_patch->>'balls_per_over','') !~ '^[0-9]+$' OR (_patch->>'balls_per_over')::numeric NOT BETWEEN 1 AND 12)) THEN
    RAISE EXCEPTION 'Invalid match format: use 1-100 overs and 1-12 balls per over';
  END IF;
 END IF;
 IF _kind IN ('edit','undo') THEN
  did := (_delivery->>'id')::uuid;
  SELECT to_jsonb(d) INTO old_d FROM public.deliveries d WHERE id = did AND match_id = _match;
  IF old_d IS NULL THEN RAISE EXCEPTION 'Ball not found'; END IF;
 END IF;
 IF _kind = 'ball' THEN
  INSERT INTO public.deliveries(id,match_id,innings,seq,striker,non_striker,bowler,runs_bat,extra_type,extras,wicket,created_by) VALUES ((_delivery->>'id')::uuid,_match,(_delivery->>'innings')::int,(_delivery->>'seq')::int,_delivery->>'striker',_delivery->>'non_striker',_delivery->>'bowler',(_delivery->>'runs_bat')::int,_delivery->>'extra_type',(_delivery->>'extras')::int,NULLIF(_delivery->'wicket','null'::jsonb),auth.uid());
 ELSIF _kind = 'undo' THEN
  IF EXISTS(SELECT 1 FROM public.deliveries WHERE match_id = _match AND (innings,seq) > ((old_d->>'innings')::int,(old_d->>'seq')::int)) THEN RAISE EXCEPTION 'Only the latest ball can be undone'; END IF;
  DELETE FROM public.deliveries WHERE id = did AND match_id = _match;
 ELSIF _kind = 'edit' THEN
  IF length(trim(COALESCE(_reason,''))) = 0 THEN RAISE EXCEPTION 'Correction reason required'; END IF;
  UPDATE public.deliveries SET striker = _delivery->>'striker',non_striker = _delivery->>'non_striker',bowler = _delivery->>'bowler',runs_bat = (_delivery->>'runs_bat')::int,extra_type = _delivery->>'extra_type',extras = (_delivery->>'extras')::int,wicket = NULLIF(_delivery->'wicket','null'::jsonb) WHERE id = did AND match_id = _match;
 END IF;
 UPDATE public.matches SET overs = CASE WHEN _patch ? 'overs' THEN (_patch->>'overs')::int ELSE overs END, balls_per_over = CASE WHEN _patch ? 'balls_per_over' THEN (_patch->>'balls_per_over')::int ELSE balls_per_over END, live = CASE WHEN _patch ? 'live' THEN _patch->'live' ELSE live END, status = COALESCE(_patch->>'status',status), toss_winner = COALESCE(_patch->>'toss_winner',toss_winner), toss_decision = COALESCE(_patch->>'toss_decision',toss_decision), result = NULL WHERE id = _match RETURNING score_revision INTO rev;
 IF _kind IN ('ball','edit') THEN SELECT to_jsonb(d) INTO new_d FROM public.deliveries d WHERE id = (_delivery->>'id')::uuid AND match_id = _match; END IF;
 INSERT INTO public.score_operations(id,match_id,actor_id,kind,before_data,after_data,reason,revision) VALUES (_id,_match,auth.uid(),_kind,COALESCE(old_d,to_jsonb(m.live)),COALESCE(new_d,_patch),_reason,rev);
 RETURN public.scoring_snapshot(_match);
END $$;
REVOKE ALL ON FUNCTION public.apply_score_operation(uuid,uuid,bigint,text,jsonb,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_score_operation(uuid,uuid,bigint,text,jsonb,jsonb,text) TO authenticated;

-- Capability check prevents old deployments silently ignoring format patches.
CREATE FUNCTION public.match_format_supported() RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT true $$;
REVOKE ALL ON FUNCTION public.match_format_supported() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_format_supported() TO authenticated;