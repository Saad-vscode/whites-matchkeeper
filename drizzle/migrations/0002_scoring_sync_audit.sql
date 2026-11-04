ALTER TABLE public.matches ADD COLUMN score_revision bigint NOT NULL DEFAULT 0;
CREATE TABLE public.score_operations (id uuid PRIMARY KEY, match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE, actor_id uuid NOT NULL, kind text NOT NULL, before_data jsonb, after_data jsonb, reason text, revision bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.score_operations TO authenticated;
GRANT ALL ON public.score_operations TO service_role;
ALTER TABLE public.score_operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scorers read audit" ON public.score_operations FOR SELECT TO authenticated USING (public.can_score(match_id));
CREATE OR REPLACE FUNCTION public.bump_score_revision() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.score_revision = OLD.score_revision + 1; RETURN NEW; END $$;
CREATE TRIGGER matches_score_revision BEFORE UPDATE ON public.matches FOR EACH ROW EXECUTE FUNCTION public.bump_score_revision();
CREATE OR REPLACE FUNCTION public.delivery_touch_match() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN UPDATE public.matches SET updated_at = now() WHERE id = COALESCE(NEW.match_id, OLD.match_id); RETURN COALESCE(NEW, OLD); END $$;
CREATE TRIGGER deliveries_score_revision AFTER INSERT OR UPDATE OR DELETE ON public.deliveries FOR EACH ROW EXECUTE FUNCTION public.delivery_touch_match();
CREATE OR REPLACE FUNCTION public.scoring_snapshot(_match uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE m public.matches; BEGIN IF auth.uid() IS NULL OR NOT public.can_score(_match) THEN RAISE EXCEPTION 'Not allowed'; END IF; SELECT * INTO m FROM public.matches WHERE id = _match FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF; RETURN jsonb_build_object('match',to_jsonb(m),'deliveries',COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY innings,seq) FROM public.deliveries d WHERE match_id = _match),'[]'::jsonb)); END $$;
REVOKE ALL ON FUNCTION public.scoring_snapshot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scoring_snapshot(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.apply_score_operation(_match uuid, _id uuid, _expected bigint, _kind text, _delivery jsonb, _patch jsonb, _reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m public.matches; old_d jsonb; new_d jsonb; did uuid; rev bigint;
BEGIN
 IF auth.uid() IS NULL OR NOT public.can_score(_match) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 SELECT * INTO m FROM public.matches WHERE id = _match FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
 IF EXISTS(SELECT 1 FROM public.score_operations WHERE id = _id AND match_id = _match AND actor_id = auth.uid()) THEN RETURN public.scoring_snapshot(_match); END IF;
 IF m.score_revision <> _expected THEN RAISE EXCEPTION 'SCORE_CONFLICT: Another scorer changed this match'; END IF;
 IF _kind NOT IN ('ball','undo','edit','state') THEN RAISE EXCEPTION 'Invalid operation'; END IF;
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
 UPDATE public.matches SET live = CASE WHEN _patch ? 'live' THEN _patch->'live' ELSE live END, status = COALESCE(_patch->>'status',status), toss_winner = COALESCE(_patch->>'toss_winner',toss_winner), toss_decision = COALESCE(_patch->>'toss_decision',toss_decision), result = NULL WHERE id = _match RETURNING score_revision INTO rev;
 IF _kind IN ('ball','edit') THEN SELECT to_jsonb(d) INTO new_d FROM public.deliveries d WHERE id = (_delivery->>'id')::uuid AND match_id = _match; END IF;
 INSERT INTO public.score_operations(id,match_id,actor_id,kind,before_data,after_data,reason,revision) VALUES (_id,_match,auth.uid(),_kind,COALESCE(old_d,to_jsonb(m.live)),COALESCE(new_d,_patch),_reason,rev);
 RETURN public.scoring_snapshot(_match);
END $$;
REVOKE ALL ON FUNCTION public.apply_score_operation(uuid,uuid,bigint,text,jsonb,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_score_operation(uuid,uuid,bigint,text,jsonb,jsonb,text) TO authenticated;
COMMENT ON COLUMN public.matches.result IS 'DEPRECATED: results are derived from the delivery log by the cricket engine';