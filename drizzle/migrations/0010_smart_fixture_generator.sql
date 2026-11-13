-- Smart Fixture Generator. Apply after 0009; existing matches and scores are not rewritten.
BEGIN;
CREATE TABLE public.fixture_generation_requests (
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  created_by uuid NOT NULL,
  payload_hash text NOT NULL,
  match_ids uuid[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, request_id)
);
ALTER TABLE public.fixture_generation_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fixture_generation_requests FROM anon, authenticated;
GRANT ALL ON public.fixture_generation_requests TO service_role;

-- One statement supplies a coherent snapshot; the token covers group membership,
-- squads, tournament defaults and fixtures (including status/revision changes).
CREATE FUNCTION public.fixture_generator_context(_t uuid, _group uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE snapshot jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_tournament_owner(_t) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT jsonb_build_object(
    'tournament', to_jsonb(t), 'group', to_jsonb(g),
    'teams', COALESCE((SELECT jsonb_agg(to_jsonb(tm) ORDER BY tm.id) FROM public.tournament_teams tm WHERE tm.tournament_id=_t AND tm.id=ANY(g.team_ids)), '[]'::jsonb),
    'matches', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',m.id,'team_a_id',m.team_a_id,'team_b_id',m.team_b_id,'status',m.status,'rules',m.rules,'updated_at',m.updated_at,'score_revision',m.score_revision) ORDER BY m.id) FROM public.matches m WHERE m.tournament_id=_t), '[]'::jsonb)
  ) INTO snapshot FROM public.tournaments t JOIN public.tournament_groups g ON g.tournament_id=t.id WHERE t.id=_t AND g.id=_group;
  IF snapshot IS NULL THEN RAISE EXCEPTION 'Group not found'; END IF;
  RETURN snapshot || jsonb_build_object('token',md5(snapshot::text));
END $$;
REVOKE ALL ON FUNCTION public.fixture_generator_context(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fixture_generator_context(uuid,uuid) TO authenticated;

-- Protect generated pairings from later/concurrent manual inserts too. Existing
-- historical duplicates are untouched; ordinary manual-only rematches remain allowed.
CREATE FUNCTION public.guard_generated_fixture_pair() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.tournament_id IS NULL OR NEW.status='cancelled' OR NEW.rules#>>'{tournamentStage,kind}' IS DISTINCT FROM 'group' THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND ROW(NEW.tournament_id,NEW.team_a_id,NEW.team_b_id,NEW.rules#>>'{tournamentStage,groupId}',NEW.status='cancelled') IS NOT DISTINCT FROM ROW(OLD.tournament_id,OLD.team_a_id,OLD.team_b_id,OLD.rules#>>'{tournamentStage,groupId}',OLD.status='cancelled') THEN RETURN NEW; END IF;
  IF EXISTS(SELECT 1 FROM public.matches m WHERE m.id<>NEW.id AND m.tournament_id=NEW.tournament_id AND m.status<>'cancelled'
    AND m.rules#>>'{tournamentStage,kind}'='group' AND m.rules#>>'{tournamentStage,groupId}'=NEW.rules#>>'{tournamentStage,groupId}'
    AND LEAST(m.team_a_id,m.team_b_id)=LEAST(NEW.team_a_id,NEW.team_b_id) AND GREATEST(m.team_a_id,m.team_b_id)=GREATEST(NEW.team_a_id,NEW.team_b_id)
    AND (m.rules ? 'smartFixtureRequest' OR NEW.rules ? 'smartFixtureRequest')) THEN
    RAISE EXCEPTION 'This opponent pairing already has a generated group fixture';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_generated_fixture_pair() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_generated_fixture_pair BEFORE INSERT OR UPDATE ON public.matches FOR EACH ROW EXECUTE FUNCTION public.guard_generated_fixture_pair();

CREATE FUNCTION public.create_generated_fixtures(_t uuid, _group uuid, _mode text, _target integer, _token text, _pairs jsonb, _request uuid)
RETURNS uuid[] LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  t public.tournaments%ROWTYPE; g public.tournament_groups%ROWTYPE;
  a public.tournament_teams%ROWTYPE; b public.tournament_teams%ROWTYPE;
  m record; pair jsonb; ids uuid[]; degrees integer[]; seen text[] := '{}'; key text;
  ai integer; bi integer; aid uuid; bid uuid; n integer; target integer;
  saved uuid[] := '{}'; mid uuid; snapshot jsonb; payload text; prior public.fixture_generation_requests%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_tournament_owner(_t) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF _request IS NULL OR _token IS NULL OR _pairs IS NULL OR jsonb_typeof(_pairs)<>'array' THEN RAISE EXCEPTION 'Invalid generation request'; END IF;
  IF jsonb_array_length(_pairs)>496 THEN RAISE EXCEPTION 'Too many fixtures'; END IF;
  payload := md5(jsonb_build_array(_group,_mode,_target,_token,_pairs)::text);
  -- A short table-level write lock covers manual INSERTs, group changes, team
  -- edits and other generators without changing the existing scoring RPCs.
  -- Lock acquisition/deadlock failure aborts this entire transaction, never a partial batch.
  SET LOCAL lock_timeout = '5s';
  LOCK TABLE public.matches, public.tournaments, public.tournament_teams, public.tournament_groups IN SHARE ROW EXCLUSIVE MODE;
  IF NOT public.is_tournament_owner(_t) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT * INTO prior FROM public.fixture_generation_requests WHERE tournament_id=_t AND request_id=_request;
  IF FOUND THEN
    IF prior.created_by<>auth.uid() OR prior.payload_hash<>payload THEN RAISE EXCEPTION 'Request ID already used for another preview'; END IF;
    RETURN prior.match_ids;
  END IF;
  snapshot := public.fixture_generator_context(_t,_group);
  IF snapshot->>'token' IS DISTINCT FROM _token THEN RAISE EXCEPTION 'Preview is outdated. Regenerate fixtures before confirming.'; END IF;
  SELECT * INTO STRICT t FROM public.tournaments WHERE id=_t;
  SELECT * INTO STRICT g FROM public.tournament_groups WHERE id=_group AND tournament_id=_t;
  ids:=g.team_ids; n:=cardinality(ids);
  IF n<2 OR n>32 OR n<>(SELECT count(DISTINCT x) FROM unnest(ids) x) THEN RAISE EXCEPTION 'Group must have 2 to 32 distinct teams'; END IF;
  IF _mode NOT IN ('round_robin','equal') OR _mode IS NULL THEN RAISE EXCEPTION 'Invalid scheduling mode'; END IF;
  target:=CASE WHEN _mode='round_robin' THEN n-1 ELSE _target END;
  IF target IS NULL OR target<1 OR target>=n OR n*target%2<>0 THEN RAISE EXCEPTION 'Equal match distribution is not possible for this team count and target'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(ids) x WHERE NOT EXISTS(SELECT 1 FROM public.tournament_teams tm WHERE tm.id=x AND tm.tournament_id=_t AND cardinality(tm.players)>=t.players_per_team)) THEN RAISE EXCEPTION 'A group team is missing or has too few registered players'; END IF;
  degrees:=array_fill(0,ARRAY[n]);
  FOR m IN SELECT * FROM public.matches WHERE tournament_id=_t AND status<>'cancelled' LOOP
    IF m.rules#>>'{tournamentStage,kind}'='other' THEN CONTINUE; END IF;
    IF m.rules#>>'{tournamentStage,kind}'='group' AND m.rules#>>'{tournamentStage,groupId}'=_group::text THEN
      ai:=array_position(ids,m.team_a_id);bi:=array_position(ids,m.team_b_id);
      IF ai IS NULL OR bi IS NULL OR ai=bi THEN RAISE EXCEPTION 'Existing group fixture has missing, moved or identical teams'; END IF;
      key:=LEAST(m.team_a_id,m.team_b_id)::text||':'||GREATEST(m.team_a_id,m.team_b_id)::text;
      IF key=ANY(seen) THEN RAISE EXCEPTION 'Existing group fixtures repeat an opponent pairing'; END IF;
      seen:=array_append(seen,key);degrees[ai]:=degrees[ai]+1;degrees[bi]:=degrees[bi]+1;
    ELSIF m.team_a_id=ANY(ids) OR m.team_b_id=ANY(ids) OR ((m.rules#>>'{tournamentStage,kind}') IS DISTINCT FROM 'group' AND (m.team_a_id IS NULL OR m.team_b_id IS NULL)) THEN
      RAISE EXCEPTION 'Existing fixture has missing or conflicting group information';
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM unnest(degrees) x WHERE x>target) THEN RAISE EXCEPTION 'Existing fixtures exceed the match target'; END IF;
  FOR pair IN SELECT value FROM jsonb_array_elements(_pairs) LOOP
    IF jsonb_typeof(pair)<>'array' OR jsonb_array_length(pair)<>2 THEN RAISE EXCEPTION 'Invalid opponent pair'; END IF;
    aid:=(pair->>0)::uuid;bid:=(pair->>1)::uuid;
    ai:=array_position(ids,aid);bi:=array_position(ids,bid);
    IF ai IS NULL OR bi IS NULL OR ai=bi THEN RAISE EXCEPTION 'Choose two different teams from this group'; END IF;
    key:=LEAST(aid,bid)::text||':'||GREATEST(aid,bid)::text;
    IF key=ANY(seen) THEN RAISE EXCEPTION 'Duplicate opponent pairing'; END IF;
    seen:=array_append(seen,key);degrees[ai]:=degrees[ai]+1;degrees[bi]:=degrees[bi]+1;
  END LOOP;
  IF EXISTS(SELECT 1 FROM unnest(degrees) x WHERE x<>target) THEN RAISE EXCEPTION 'Preview does not give every team exactly the required matches'; END IF;
  FOR pair IN SELECT value FROM jsonb_array_elements(_pairs) LOOP
    SELECT * INTO STRICT a FROM public.tournament_teams WHERE id=(pair->>0)::uuid AND tournament_id=_t;
    SELECT * INTO STRICT b FROM public.tournament_teams WHERE id=(pair->>1)::uuid AND tournament_id=_t;
    INSERT INTO public.matches(created_by,tournament_id,team_a_id,team_b_id,name,team_a,team_b,team_a_players,team_b_players,players_per_team,overs,balls_per_over,rules,status,created_at)
    VALUES(t.created_by,_t,a.id,b.id,COALESCE(NULLIF(t.short_name,''),t.name),a.name,b.name,a.players[1:t.players_per_team],b.players[1:t.players_per_team],t.players_per_team,t.overs,t.balls_per_over,
      (CASE WHEN jsonb_typeof(t.rules)='object' THEN t.rules ELSE '{}'::jsonb END)||jsonb_build_object('tournamentStage',jsonb_build_object('kind','group','groupId',_group,'title',g.name),'smartFixtureRequest',_request), 'scheduled',clock_timestamp()) RETURNING id INTO mid;
    saved:=array_append(saved,mid);
  END LOOP;
  INSERT INTO public.fixture_generation_requests(tournament_id,request_id,created_by,payload_hash,match_ids) VALUES(_t,_request,auth.uid(),payload,saved);
  RETURN saved;
END $$;
REVOKE ALL ON FUNCTION public.create_generated_fixtures(uuid,uuid,text,integer,text,jsonb,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_generated_fixtures(uuid,uuid,text,integer,text,jsonb,uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
