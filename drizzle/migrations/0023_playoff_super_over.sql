-- Forward-only extension: raw deciding toss choice, never stored score totals.
ALTER TABLE public.deliveries DROP CONSTRAINT deliveries_innings_check;
ALTER TABLE public.deliveries ADD CONSTRAINT deliveries_innings_check CHECK (innings IN (1,2,3,4));
ALTER TABLE public.matches ADD COLUMN tie_break_toss_winner text CHECK (tie_break_toss_winner IN ('A','B'));

CREATE FUNCTION public.is_playoff_decider(_rules jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT COALESCE(_rules#>>'{tournamentStage,kind}','') <> 'group' AND
 (_rules ? 'playoffNode' OR COALESCE(_rules#>>'{tournamentStage,title}','') ~* '^(Qualifier|Eliminator|Knockout|Quarter Final|Semi Final|Final)( [0-9]+)?$')
$$;
-- Validation only: scores are read from deliveries and are never persisted.
CREATE FUNCTION public.decider_innings_tied(_match uuid, _first integer) RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path=public AS $$
DECLARE m public.matches; quota integer; cap integer; r1 integer; r2 integer; finished integer;
BEGIN
 SELECT * INTO m FROM public.matches WHERE id=_match;
 IF _first=3 THEN quota:=6; cap:=LEAST(2,GREATEST(1,m.players_per_team-1));
 ELSE
  quota:=m.overs*m.balls_per_over;
  cap:=COALESCE((m.rules->>'maxWickets')::integer,CASE WHEN COALESCE((m.rules->>'lastManBats')::boolean,false) THEN m.players_per_team ELSE m.players_per_team-1 END);
  IF COALESCE((m.rules->>'lastManBats')::boolean,false) AND cap=m.players_per_team-1 THEN cap:=m.players_per_team; END IF;
  cap:=GREATEST(1,LEAST(m.players_per_team,cap));
 END IF;
 SELECT COALESCE(sum(runs_bat+extras),0) INTO r1 FROM public.deliveries WHERE match_id=_match AND innings=_first;
 SELECT COALESCE(sum(runs_bat+extras),0) INTO r2 FROM public.deliveries WHERE match_id=_match AND innings=_first+1;
 SELECT count(*) INTO finished FROM (
  SELECT innings FROM public.deliveries WHERE match_id=_match AND innings IN (_first,_first+1) GROUP BY innings
  HAVING count(*) FILTER (WHERE extra_type NOT IN ('wide','noball','penalty'))>=quota
    OR count(*) FILTER (WHERE wicket IS NOT NULL AND wicket->>'kind'<>'retired_hurt')>=cap
 ) i;
 RETURN finished=2 AND r1=r2;
END $$;
REVOKE ALL ON FUNCTION public.decider_innings_tied(uuid,integer) FROM PUBLIC;

CREATE FUNCTION public.super_innings_complete(_match uuid, _innings integer) RETURNS boolean LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT count(*) FILTER (WHERE d.extra_type NOT IN ('wide','noball','penalty')) >= 6
   OR count(*) FILTER (WHERE d.wicket IS NOT NULL AND d.wicket->>'kind'<>'retired_hurt') >= LEAST(2,GREATEST(1,m.players_per_team-1))
   OR (_innings=4 AND COALESCE(sum(d.runs_bat+d.extras),0) > (SELECT COALESCE(sum(runs_bat+extras),0) FROM deliveries WHERE match_id=_match AND innings=3))
 FROM matches m LEFT JOIN deliveries d ON d.match_id=m.id AND d.innings=_innings WHERE m.id=_match GROUP BY m.players_per_team
$$;
REVOKE ALL ON FUNCTION public.super_innings_complete(uuid,integer) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.apply_score_operation(_match uuid, _id uuid, _expected bigint, _kind text, _delivery jsonb, _patch jsonb, _reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m public.matches; old_d jsonb; new_d jsonb; did uuid; rev bigint;
BEGIN
 IF auth.uid() IS NULL OR NOT public.can_score(_match) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 SELECT * INTO m FROM public.matches WHERE id = _match FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
 IF EXISTS(SELECT 1 FROM public.score_operations WHERE id = _id AND match_id = _match AND actor_id = auth.uid()) THEN RETURN public.scoring_snapshot(_match); END IF;
 IF m.score_revision <> _expected THEN RAISE EXCEPTION 'SCORE_CONFLICT: Another scorer changed this match'; END IF;
 IF _kind NOT IN ('ball','undo','edit','state') THEN RAISE EXCEPTION 'Invalid operation'; END IF;
 IF (COALESCE((_delivery->>'innings')::integer,1)>=3 OR COALESCE((_patch#>>'{live,innings}')::integer,1)>=3 OR _patch->>'tie_break_toss_winner' IS NOT NULL) THEN
  IF NOT public.is_playoff_decider(m.rules) OR NOT public.decider_innings_tied(_match,1) THEN RAISE EXCEPTION 'Super Over requires a tied playoff'; END IF;
 END IF;
 IF _kind='ball' AND (_delivery->>'innings')::integer>=3 THEN
  IF (_delivery->>'innings')::integer IS DISTINCT FROM (m.live->>'innings')::integer OR m.status<>'live' OR public.super_innings_complete(_match,(_delivery->>'innings')::integer) THEN RAISE EXCEPTION 'Invalid Super Over delivery'; END IF;
 END IF;
 IF COALESCE((_patch#>>'{live,innings}')::integer,1)=4 AND NOT public.super_innings_complete(_match,3) AND _kind<>'ball' THEN RAISE EXCEPTION 'Finish the first Super Over innings'; END IF;
 IF _patch->>'tie_break_toss_winner' IS NOT NULL THEN
  IF _kind<>'state' OR _patch->>'tie_break_toss_winner' NOT IN ('A','B') OR NOT public.decider_innings_tied(_match,3) THEN RAISE EXCEPTION 'Deciding toss requires a tied Super Over'; END IF;
  IF m.tie_break_toss_winner IS NOT NULL THEN RAISE EXCEPTION 'SCORE_CONFLICT: Deciding toss already recorded'; END IF;
 END IF;
 IF _kind='edit' AND EXISTS(SELECT 1 FROM public.deliveries WHERE match_id=_match AND innings>=3 AND innings>(SELECT edited.innings FROM public.deliveries edited WHERE edited.id=(_delivery->>'id')::uuid AND edited.match_id=_match)) THEN
  RAISE EXCEPTION 'Undo later Super Over innings before correcting this innings';
 END IF;
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
 IF _patch->>'status'='completed' AND public.is_playoff_decider(m.rules) AND public.decider_innings_tied(_match,1) THEN
  IF NOT public.super_innings_complete(_match,3) OR NOT public.super_innings_complete(_match,4) THEN RAISE EXCEPTION 'A tied playoff requires a Super Over'; END IF;
  IF public.decider_innings_tied(_match,3) AND COALESCE(_patch->>'tie_break_toss_winner',m.tie_break_toss_winner) IS NULL THEN RAISE EXCEPTION 'A tied Super Over requires a deciding toss'; END IF;
 END IF;
 UPDATE public.matches SET tie_break_toss_winner = CASE WHEN _kind IN ('undo','edit') THEN NULL WHEN _patch ? 'tie_break_toss_winner' THEN _patch->>'tie_break_toss_winner' ELSE tie_break_toss_winner END, overs = CASE WHEN _patch ? 'overs' THEN (_patch->>'overs')::int ELSE overs END, balls_per_over = CASE WHEN _patch ? 'balls_per_over' THEN (_patch->>'balls_per_over')::int ELSE balls_per_over END, live = CASE WHEN _patch ? 'live' THEN _patch->'live' ELSE live END, status = COALESCE(_patch->>'status',status), toss_winner = COALESCE(_patch->>'toss_winner',toss_winner), toss_decision = COALESCE(_patch->>'toss_decision',toss_decision), result = NULL WHERE id = _match RETURNING score_revision INTO rev;
 IF _kind IN ('ball','edit') THEN SELECT to_jsonb(d) INTO new_d FROM public.deliveries d WHERE id = (_delivery->>'id')::uuid AND match_id = _match; END IF;
 INSERT INTO public.score_operations(id,match_id,actor_id,kind,before_data,after_data,reason,revision) VALUES (_id,_match,auth.uid(),_kind,COALESCE(old_d,to_jsonb(m.live)),COALESCE(new_d,_patch),_reason,rev);
 RETURN public.scoring_snapshot(_match);
END $$;
REVOKE ALL ON FUNCTION public.apply_score_operation(uuid,uuid,bigint,text,jsonb,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_score_operation(uuid,uuid,bigint,text,jsonb,jsonb,text) TO authenticated;


CREATE FUNCTION public.super_over_supported() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
REVOKE ALL ON FUNCTION public.super_over_supported() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.super_over_supported() TO authenticated;
