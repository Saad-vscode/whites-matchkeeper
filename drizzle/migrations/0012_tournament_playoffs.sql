-- Apply after 0011. Draw configuration only; scores remain derived from deliveries.
BEGIN;
CREATE TABLE public.tournament_playoffs (
  tournament_id uuid PRIMARY KEY REFERENCES public.tournaments(id) ON DELETE CASCADE,
  draw jsonb NOT NULL,
  approved boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tournament_playoffs ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.tournament_playoffs TO anon, authenticated;
GRANT ALL ON public.tournament_playoffs TO service_role;
CREATE POLICY "playoffs public read" ON public.tournament_playoffs FOR SELECT TO anon, authenticated USING (true);
CREATE UNIQUE INDEX matches_playoff_node ON public.matches(tournament_id,(rules->>'playoffNode')) WHERE rules ? 'playoffNode';

CREATE FUNCTION public.playoff_context(_t uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE snapshot jsonb;
BEGIN
  SELECT jsonb_build_object('tournament',to_jsonb(t),
    'teams',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.tournament_teams x WHERE x.tournament_id=_t),'[]'::jsonb),
    'groups',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.name,x.id) FROM public.tournament_groups x WHERE x.tournament_id=_t),'[]'::jsonb),
    'matches',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.matches x WHERE x.tournament_id=_t),'[]'::jsonb),
    'deliveries',COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.match_id,d.innings,d.seq) FROM public.deliveries d JOIN public.matches m ON m.id=d.match_id WHERE m.tournament_id=_t),'[]'::jsonb),
    'playoff',(SELECT to_jsonb(p) FROM public.tournament_playoffs p WHERE p.tournament_id=_t)) INTO snapshot
  FROM public.tournaments t WHERE t.id=_t;
  IF snapshot IS NULL THEN RAISE EXCEPTION 'Tournament not found'; END IF;
  RETURN snapshot || jsonb_build_object('token',md5(snapshot::text));
END $$;
REVOKE ALL ON FUNCTION public.playoff_context(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.playoff_context(uuid) TO anon,authenticated;

CREATE FUNCTION public.save_playoff_draw(_t uuid,_draw jsonb,_approve boolean,_token text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE node jsonb; slot jsonb; ids text[]:='{}'; edges text[]:='{}'; edge text; teams uuid[]:='{}'; tid uuid; prev_round integer:=0; n integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_tournament_owner(_t) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SET LOCAL lock_timeout='5s';
  LOCK TABLE public.matches, public.deliveries, public.tournaments, public.tournament_teams, public.tournament_groups,public.tournament_playoffs IN SHARE ROW EXCLUSIVE MODE;
  IF (public.playoff_context(_t)->>'token') IS DISTINCT FROM _token THEN RAISE EXCEPTION 'Draw is outdated. Refresh and review before saving.'; END IF;
  IF jsonb_typeof(_draw->'nodes') IS DISTINCT FROM 'array' OR COALESCE(_draw->>'format','') NOT IN ('single','ipl') OR jsonb_typeof(_draw->'seeds') IS DISTINCT FROM 'array' OR _approve IS NULL THEN RAISE EXCEPTION 'Invalid draw'; END IF;
  n:=jsonb_array_length(_draw->'nodes');
  IF n<1 OR n>31 THEN RAISE EXCEPTION 'Choose 2 to 32 teams'; END IF;
  FOR node IN SELECT value FROM jsonb_array_elements(_draw->'nodes') LOOP
    IF COALESCE(node->>'id','') !~ '^[a-z0-9-]{1,30}$' OR node->>'id'=ANY(ids) OR length(trim(COALESCE(node->>'title','')))=0 OR length(node->>'title')>80 THEN RAISE EXCEPTION 'Invalid round'; END IF;
    IF node->>'round' IS NULL OR (node->>'round')::integer<prev_round OR (node->>'round')::integer<1 OR (node->>'round')::integer>5 THEN RAISE EXCEPTION 'Invalid round order'; END IF;
    prev_round:=(node->>'round')::integer;
    IF node->'a'='null'::jsonb AND node->'b'='null'::jsonb THEN RAISE EXCEPTION 'Empty pairing'; END IF;
    FOREACH slot IN ARRAY ARRAY[node->'a',node->'b'] LOOP
      IF slot IS NULL THEN RAISE EXCEPTION 'Missing slot'; END IF;
      IF slot='null'::jsonb THEN CONTINUE; END IF;
      IF slot ? 'team' THEN
        tid:=(slot->>'team')::uuid;
        IF tid=ANY(teams) OR NOT EXISTS(SELECT 1 FROM public.tournament_teams WHERE id=tid AND tournament_id=_t) THEN RAISE EXCEPTION 'Choose distinct tournament teams'; END IF;
        teams:=array_append(teams,tid);
      ELSIF slot ? 'from' THEN
        IF NOT (slot->>'from'=ANY(ids)) OR COALESCE(slot->>'result','') NOT IN ('winner','loser') OR (_draw->>'format'='single' AND slot->>'result'='loser') THEN RAISE EXCEPTION 'Invalid bracket dependency'; END IF;
        IF EXISTS(SELECT 1 FROM jsonb_array_elements(_draw->'nodes') x WHERE x->>'id'=slot->>'from' AND (x->>'round')::integer >= (node->>'round')::integer) THEN RAISE EXCEPTION 'Invalid bracket dependency round'; END IF;
        edge:=(slot->>'from')||':'||(slot->>'result');
        IF edge=ANY(edges) THEN RAISE EXCEPTION 'A result cannot feed multiple fixtures'; END IF;
        edges:=array_append(edges,edge);
      ELSE RAISE EXCEPTION 'Invalid slot'; END IF;
    END LOOP;
    ids:=array_append(ids,node->>'id');
  END LOOP;
  IF cardinality(teams)<2 OR cardinality(teams)>32 THEN RAISE EXCEPTION 'Invalid qualifiers'; END IF;
  IF _draw#>>ARRAY['nodes',(n-1)::text,'id'] IS DISTINCT FROM 'final' OR EXISTS(SELECT 1 FROM unnest(ids) x WHERE x<>'final' AND NOT (x||':winner'=ANY(edges))) THEN RAISE EXCEPTION 'Every round must lead to the final'; END IF;
  IF jsonb_array_length(_draw->'seeds')<>cardinality(teams) OR (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(_draw->'seeds'))<>cardinality(teams) OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(_draw->'seeds') x WHERE NOT (x::uuid=ANY(teams))) THEN RAISE EXCEPTION 'Seed order must contain all qualifiers exactly once'; END IF;
  IF EXISTS(SELECT 1 FROM public.matches m WHERE m.tournament_id=_t AND m.rules ? 'playoffNode' AND (m.status<>'scheduled' OR m.toss_winner IS NOT NULL OR EXISTS(SELECT 1 FROM public.deliveries d WHERE d.match_id=m.id))) THEN
    RAISE EXCEPTION 'Playoffs have started. Existing pairings cannot be rewritten; resolve a tied result or edit an unstarted fixture instead.';
  END IF;
  IF _approve AND (SELECT competition_format FROM public.tournaments WHERE id=_t)<>'knockout' THEN
    IF NOT EXISTS(SELECT 1 FROM public.matches m WHERE m.tournament_id=_t AND NOT (m.rules ? 'playoffNode') AND (m.rules#>>'{tournamentStage,kind}' IS DISTINCT FROM 'other') AND m.status<>'cancelled') OR
       EXISTS(SELECT 1 FROM public.matches m WHERE m.tournament_id=_t AND NOT (m.rules ? 'playoffNode') AND (m.rules#>>'{tournamentStage,kind}' IS DISTINCT FROM 'other') AND m.status NOT IN ('completed','abandoned','cancelled')) THEN
      RAISE EXCEPTION 'Finish the group round before approving playoffs';
    END IF;
  END IF;
  DELETE FROM public.matches WHERE tournament_id=_t AND rules ? 'playoffNode';
  INSERT INTO public.tournament_playoffs(tournament_id,draw,approved) VALUES(_t,jsonb_set(_draw,'{decisions}','{}'::jsonb),_approve)
  ON CONFLICT(tournament_id) DO UPDATE SET draw=EXCLUDED.draw,approved=EXCLUDED.approved,revision=tournament_playoffs.revision+1,updated_at=now();
END $$;
REVOKE ALL ON FUNCTION public.save_playoff_draw(uuid,jsonb,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_playoff_draw(uuid,jsonb,boolean,text) TO authenticated;

-- The engine supplies winners from a coherent log snapshot. Only the organiser or
-- an assigned playoff scorer can advance an approved draw; spectators never write.
-- Source participants, completion, decisions and the full snapshot are rechecked.
CREATE FUNCTION public.sync_playoff_fixtures(_t uuid,_token text,_winners jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.tournament_playoffs%ROWTYPE; t public.tournaments%ROWTYPE; a public.tournament_teams%ROWTYPE; b public.tournament_teams%ROWTYPE;
  node jsonb; slot jsonb; resolved jsonb:='{}'; pair uuid[]; source jsonb; winner uuid; loser uuid; m public.matches%ROWTYPE; created integer:=0; chosen uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_tournament_owner(_t) OR EXISTS(SELECT 1 FROM public.matches x WHERE x.tournament_id=_t AND x.rules ? 'playoffNode' AND public.can_score(x.id))) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SET LOCAL lock_timeout='5s';
  LOCK TABLE public.matches,public.deliveries,public.tournament_playoffs,public.tournament_teams,public.tournaments,public.tournament_groups IN SHARE ROW EXCLUSIVE MODE;
  IF (public.playoff_context(_t)->>'token') IS DISTINCT FROM _token THEN RAISE EXCEPTION 'PLAYOFF_STALE'; END IF;
  SELECT * INTO p FROM public.tournament_playoffs WHERE tournament_id=_t;
  IF NOT FOUND OR NOT p.approved THEN RETURN 0; END IF;
  SELECT * INTO STRICT t FROM public.tournaments WHERE id=_t;
  FOR node IN SELECT value FROM jsonb_array_elements(p.draw->'nodes') LOOP
    pair:='{}';winner:=NULL;loser:=NULL;m.id:=NULL;
    FOREACH slot IN ARRAY ARRAY[node->'a',node->'b'] LOOP
      chosen:=NULL;
      IF slot ? 'team' THEN chosen:=(slot->>'team')::uuid;
      ELSIF slot ? 'from' THEN chosen:=(resolved#>>ARRAY[slot->>'from',slot->>'result'])::uuid; END IF;
      pair:=array_append(pair,chosen);
    END LOOP;
    IF node->'a'='null'::jsonb OR node->'b'='null'::jsonb THEN winner:=COALESCE(pair[1],pair[2]);
    ELSIF pair[1] IS NOT NULL AND pair[2] IS NOT NULL THEN
      IF pair[1]=pair[2] THEN RAISE EXCEPTION 'A team cannot play itself'; END IF;
      SELECT * INTO m FROM public.matches WHERE tournament_id=_t AND rules->>'playoffNode'=node->>'id';
      IF FOUND THEN
        IF m.status='cancelled' THEN RAISE EXCEPTION 'A playoff fixture was cancelled. Organiser review required.'; END IF;
        IF m.team_a_id IS DISTINCT FROM pair[1] OR m.team_b_id IS DISTINCT FROM pair[2] THEN
          -- Corrections can repair an untouched dependent fixture, never a started one.
          IF m.status<>'scheduled' OR m.toss_winner IS NOT NULL OR EXISTS(SELECT 1 FROM public.deliveries WHERE match_id=m.id) THEN RAISE EXCEPTION 'A previous result changed after a dependent match started. Organiser review required.'; END IF;
          DELETE FROM public.matches WHERE id=m.id; m.id:=NULL;
        END IF;
      END IF;
      IF m.id IS NULL THEN
        SELECT * INTO STRICT a FROM public.tournament_teams WHERE id=pair[1] AND tournament_id=_t;
        SELECT * INTO STRICT b FROM public.tournament_teams WHERE id=pair[2] AND tournament_id=_t;
        IF cardinality(a.players)<t.players_per_team OR cardinality(b.players)<t.players_per_team THEN RAISE EXCEPTION 'A qualifying team has too few registered players'; END IF;
        INSERT INTO public.matches(created_by,tournament_id,team_a_id,team_b_id,name,team_a,team_b,team_a_players,team_b_players,players_per_team,overs,balls_per_over,rules,status)
        VALUES(t.created_by,_t,a.id,b.id,COALESCE(NULLIF(t.short_name,''),t.name),a.name,b.name,a.players[1:t.players_per_team],b.players[1:t.players_per_team],t.players_per_team,t.overs,t.balls_per_over,
          (CASE WHEN jsonb_typeof(t.rules)='object' THEN t.rules ELSE '{}'::jsonb END)||jsonb_build_object('tournamentStage',jsonb_build_object('kind','other','title',node->>'title'),'playoffNode',node->>'id'),'scheduled') RETURNING * INTO m;
        created:=created+1;
      END IF;
      IF m.status IN ('completed','abandoned') THEN
        winner:=(_winners->>(node->>'id'))::uuid;
        IF winner IS NOT NULL AND winner<>pair[1] AND winner<>pair[2] THEN RAISE EXCEPTION 'Invalid advancing team'; END IF;
        IF m.status='abandoned' AND winner IS NOT NULL AND (p.draw#>>ARRAY['decisions',node->>'id','team'] IS DISTINCT FROM winner::text OR (p.draw#>>ARRAY['decisions',node->>'id','revision'])::bigint IS DISTINCT FROM m.score_revision) THEN RAISE EXCEPTION 'Organiser decision required'; END IF;
        IF winner IS NOT NULL THEN loser:=CASE WHEN winner=pair[1] THEN pair[2] ELSE pair[1] END; END IF;
      END IF;
    ELSIF EXISTS(SELECT 1 FROM public.matches x WHERE x.tournament_id=_t AND x.rules->>'playoffNode'=node->>'id') THEN
      SELECT * INTO m FROM public.matches x WHERE x.tournament_id=_t AND x.rules->>'playoffNode'=node->>'id';
      IF m.status<>'scheduled' OR m.toss_winner IS NOT NULL OR EXISTS(SELECT 1 FROM public.deliveries WHERE match_id=m.id) THEN RAISE EXCEPTION 'A previous round is undecided after a dependent match started. Organiser review required.'; END IF;
      DELETE FROM public.matches WHERE id=m.id;
    END IF;
    resolved:=resolved||jsonb_build_object(node->>'id',jsonb_build_object('winner',winner,'loser',loser));
  END LOOP;
  RETURN created;
END $$;
REVOKE ALL ON FUNCTION public.sync_playoff_fixtures(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sync_playoff_fixtures(uuid,text,jsonb) TO authenticated;

CREATE FUNCTION public.decide_playoff_tie(_t uuid,_node text,_team uuid,_reason text,_token text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m public.matches%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_tournament_owner(_t) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SET LOCAL lock_timeout='5s';
  LOCK TABLE public.matches,public.deliveries,public.tournament_playoffs,public.tournament_teams,public.tournaments,public.tournament_groups IN SHARE ROW EXCLUSIVE MODE;
  IF (public.playoff_context(_t)->>'token') IS DISTINCT FROM _token THEN RAISE EXCEPTION 'Result changed. Refresh before deciding.'; END IF;
  SELECT * INTO STRICT m FROM public.matches WHERE tournament_id=_t AND rules->>'playoffNode'=_node;
  IF m.status NOT IN ('completed','abandoned') OR _team NOT IN (m.team_a_id,m.team_b_id) OR length(trim(_reason))<5 OR length(_reason)>500 THEN RAISE EXCEPTION 'Choose a participating team and provide a reason'; END IF;
  IF EXISTS(
    WITH RECURSIVE affected(id) AS (
      SELECT _node
      UNION
      SELECT n->>'id' FROM public.tournament_playoffs p CROSS JOIN LATERAL jsonb_array_elements(p.draw->'nodes') n
      JOIN affected a ON n#>>'{a,from}'=a.id OR n#>>'{b,from}'=a.id WHERE p.tournament_id=_t
    )
    SELECT 1 FROM public.matches x WHERE x.tournament_id=_t AND x.rules->>'playoffNode' IN (SELECT id FROM affected WHERE id<>_node)
      AND (x.status<>'scheduled' OR x.toss_winner IS NOT NULL OR EXISTS(SELECT 1 FROM public.deliveries d WHERE d.match_id=x.id))
  ) THEN RAISE EXCEPTION 'A dependent playoff has started. Resolve its dependency before changing this decision.'; END IF;
  UPDATE public.tournament_playoffs SET draw=jsonb_set(draw,ARRAY['decisions',_node],jsonb_build_object('team',_team,'reason',trim(_reason),'revision',m.score_revision)),revision=revision+1,updated_at=now() WHERE tournament_id=_t;
END $$;
REVOKE ALL ON FUNCTION public.decide_playoff_tie(uuid,text,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.decide_playoff_tie(uuid,text,uuid,text,text) TO authenticated;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tournament_playoffs;
NOTIFY pgrst,'reload schema';
COMMIT;
