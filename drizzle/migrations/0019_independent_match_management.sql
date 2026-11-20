-- Independent matches only. Apply after 0018. No scoring history is deleted.
BEGIN;
ALTER TABLE public.matches ADD COLUMN platform_hidden boolean NOT NULL DEFAULT false,
 ADD COLUMN platform_disabled boolean NOT NULL DEFAULT false,
 ADD COLUMN platform_archived boolean NOT NULL DEFAULT false,
 ADD COLUMN platform_deleted_at timestamptz;
ALTER TABLE public.platform_activity ADD COLUMN match_id uuid;
CREATE INDEX platform_activity_match_time ON public.platform_activity(match_id,created_at DESC);
-- Access-only changes must not manufacture a scoring conflict for a preserved offline queue.
-- Real score edits and ownership changes retain the existing revision behavior.
CREATE OR REPLACE FUNCTION public.bump_score_revision() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF OLD.tournament_id IS NULL AND public.tournament_admin_mutation() AND
  (to_jsonb(NEW)-ARRAY['platform_hidden','platform_disabled','platform_archived','platform_deleted_at','updated_at','score_revision']) IS NOT DISTINCT FROM
  (to_jsonb(OLD)-ARRAY['platform_hidden','platform_disabled','platform_archived','platform_deleted_at','updated_at','score_revision']) THEN
  NEW.score_revision:=OLD.score_revision;
 ELSE NEW.score_revision:=OLD.score_revision+1; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.bump_score_revision() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.match_read_access(_m uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.matches m WHERE m.id=_m AND public.tournament_read_access(m.tournament_id)
 AND (m.tournament_id IS NOT NULL OR (m.platform_deleted_at IS NULL AND (NOT m.platform_hidden OR
 (public.platform_account_active(auth.uid()) AND (m.created_by=auth.uid() OR public.has_role(auth.uid(),'admin') OR EXISTS(SELECT 1 FROM public.match_scorers s WHERE s.match_id=m.id AND s.user_id=auth.uid())))))))
$$;
CREATE FUNCTION public.independent_match_writable(_m uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.matches WHERE id=_m AND (tournament_id IS NOT NULL OR (NOT platform_disabled AND NOT platform_archived AND platform_deleted_at IS NULL)))
$$;
REVOKE ALL ON FUNCTION public.independent_match_writable(uuid) FROM PUBLIC,anon,authenticated;
-- Preserve helper identities so existing RLS policies use the new checks.
CREATE OR REPLACE FUNCTION public.is_match_owner(_match uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.account_access() AND public.independent_match_writable(_match) AND EXISTS(SELECT 1 FROM public.matches WHERE id=_match AND public.tournament_write_access(tournament_id) AND (created_by=auth.uid() OR public.has_role(auth.uid(),'admin')))
$$;
CREATE OR REPLACE FUNCTION public.can_score(_match uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.account_access() AND public.independent_match_writable(_match) AND EXISTS(SELECT 1 FROM public.matches m WHERE m.id=_match AND public.tournament_write_access(m.tournament_id) AND (m.created_by=auth.uid() OR public.has_role(auth.uid(),'admin') OR EXISTS(SELECT 1 FROM public.match_scorers s WHERE s.match_id=m.id AND s.user_id=auth.uid())))
$$;
CREATE POLICY independent_match_visibility ON public.matches AS RESTRICTIVE FOR SELECT TO anon,authenticated USING(public.match_read_access(id));
CREATE FUNCTION public.guard_independent_match() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r jsonb; m public.matches;
BEGIN
 IF auth.uid() IS NULL OR public.tournament_admin_mutation() THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
 IF TG_TABLE_NAME='matches' THEN
  IF TG_OP='INSERT' THEN
   IF NEW.platform_hidden OR NEW.platform_disabled OR NEW.platform_archived OR NEW.platform_deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Administrative match fields are protected' USING ERRCODE='42501'; END IF;
  ELSIF TG_OP='UPDATE' THEN
   IF ROW(NEW.platform_hidden,NEW.platform_disabled,NEW.platform_archived,NEW.platform_deleted_at) IS DISTINCT FROM ROW(OLD.platform_hidden,OLD.platform_disabled,OLD.platform_archived,OLD.platform_deleted_at) THEN RAISE EXCEPTION 'Administrative match fields are protected' USING ERRCODE='42501'; END IF;
  ELSIF OLD.tournament_id IS NULL THEN RAISE EXCEPTION 'Use recoverable match deletion' USING ERRCODE='42501'; END IF;
 END IF;
 FOR r IN SELECT x FROM unnest(ARRAY[CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(OLD) END,CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(NEW) END]) x WHERE x IS NOT NULL LOOP
  SELECT * INTO m FROM public.matches WHERE id=(CASE WHEN TG_TABLE_NAME='matches' THEN r->>'id' ELSE r->>'match_id' END)::uuid FOR SHARE;
  IF m.tournament_id IS NULL AND (m.platform_disabled OR m.platform_archived OR m.platform_deleted_at IS NOT NULL) THEN RAISE EXCEPTION 'MATCH_RESTRICTED: This independent match is disabled, archived or deleted. Saved scores are preserved.' USING ERRCODE='42501'; END IF;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION public.guard_independent_match() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['matches','deliveries','match_scorers','score_operations','match_award_publications'] LOOP
 EXECUTE format('CREATE TRIGGER independent_match_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_independent_match()',t);
END LOOP; END $$;
CREATE FUNCTION public.platform_other_matches(_search text DEFAULT '',_state text DEFAULT 'all',_page integer DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF public.platform_role() NOT IN ('owner','admin') THEN RAISE EXCEPTION 'Platform access denied' USING ERRCODE='42501'; END IF;
 IF _page IS NULL OR _page NOT BETWEEN 0 AND 100000 OR _search IS NULL OR length(_search)>200 OR _state IS NULL OR _state NOT IN ('all','live','completed','scheduled','hidden','disabled','archived','deleted') THEN RAISE EXCEPTION 'Invalid filters'; END IF;
 RETURN (WITH rows AS MATERIALIZED(SELECT to_jsonb(m)||jsonb_build_object('organizer',coalesce(u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name',u.email),'email',u.email) r FROM public.matches m LEFT JOIN auth.users u ON u.id=m.created_by WHERE m.tournament_id IS NULL),
 filtered AS(SELECT r FROM rows WHERE (_state='deleted' AND r->>'platform_deleted_at' IS NOT NULL OR _state<>'deleted' AND r->>'platform_deleted_at' IS NULL)
 AND (_state IN ('all','deleted') OR r->>'status'=_state OR _state='live' AND r->>'status' IN ('live','paused','innings_break') OR _state='hidden' AND (r->>'platform_hidden')::boolean OR _state='disabled' AND (r->>'platform_disabled')::boolean OR _state='archived' AND (r->>'platform_archived')::boolean)
 AND strpos(lower(concat(r->>'team_a',' ',r->>'team_b',' ',r->>'organizer',' ',r->>'email')),lower(trim(_search)))>0),
 page AS(SELECT r FROM filtered ORDER BY r->>'created_at' DESC,r->>'id' LIMIT 20 OFFSET _page*20)
 SELECT jsonb_build_object('rows',(SELECT coalesce(jsonb_agg(r),'[]') FROM page),'total',(SELECT count(*) FROM filtered),
 'summary',jsonb_build_object('total',(SELECT count(*) FROM rows WHERE r->>'platform_deleted_at' IS NULL),'hidden',(SELECT count(*) FROM rows WHERE (r->>'platform_hidden')::boolean AND r->>'platform_deleted_at' IS NULL),'disabled',(SELECT count(*) FROM rows WHERE (r->>'platform_disabled')::boolean AND r->>'platform_deleted_at' IS NULL),'archived',(SELECT count(*) FROM rows WHERE (r->>'platform_archived')::boolean AND r->>'platform_deleted_at' IS NULL))));
END $$;
CREATE FUNCTION public.platform_other_match_details(_match uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.matches;
BEGIN
 IF public.platform_role() NOT IN ('owner','admin') THEN RAISE EXCEPTION 'Platform access denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO m FROM public.matches WHERE id=_match AND tournament_id IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Independent match not found'; END IF;
 RETURN jsonb_build_object('match',to_jsonb(m),'deliveries',(SELECT coalesce(jsonb_agg(d ORDER BY innings,seq),'[]') FROM public.deliveries d WHERE match_id=_match),
 'history',(SELECT coalesce(jsonb_agg(a ORDER BY created_at DESC),'[]') FROM (SELECT actor_id,action,reason,created_at FROM public.platform_activity WHERE match_id=_match ORDER BY created_at DESC LIMIT 50)a));
END $$;
CREATE FUNCTION public.platform_manage_other_match(_match uuid,_action text,_reason text DEFAULT '',_confirmation text DEFAULT '',_owner uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous public.matches; updated public.matches; actor text;
BEGIN
 SET LOCAL lock_timeout='5s';
 PERFORM pg_advisory_xact_lock(141414);
 PERFORM 1 FROM auth.users WHERE id=auth.uid() FOR SHARE;
 actor:=public.platform_role();
 IF actor NOT IN ('owner','admin') THEN RAISE EXCEPTION 'Platform access denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO previous FROM public.matches WHERE id=_match FOR UPDATE;
 IF NOT FOUND OR previous.tournament_id IS NOT NULL THEN RAISE EXCEPTION 'Only independent matches can be managed here'; END IF;
 IF length(coalesce(_reason,''))>1000 THEN RAISE EXCEPTION 'Reason is too long'; END IF;
 IF previous.platform_deleted_at IS NOT NULL AND _action IS DISTINCT FROM 'recover' THEN RAISE EXCEPTION 'Recover this match first'; END IF;
 IF _action IN ('disable','archive','delete','transfer') AND nullif(trim(_reason),'') IS NULL THEN RAISE EXCEPTION 'Provide a reason'; END IF;
 IF (_action IN ('delete','transfer') OR previous.status IN ('live','paused','innings_break') AND _action IN ('hide','disable','archive')) AND _confirmation IS DISTINCT FROM previous.team_a||' vs '||previous.team_b THEN RAISE EXCEPTION 'Type the match name to confirm'; END IF;
 IF _action IN ('delete','archive','transfer') AND previous.status IN ('live','paused','innings_break') THEN RAISE EXCEPTION 'Finish or resolve the ongoing match before this action'; END IF;
 INSERT INTO public.platform_tournament_context VALUES(txid_current(),auth.uid());
 CASE _action
 WHEN 'hide' THEN UPDATE public.matches SET platform_hidden=true WHERE id=_match;
 WHEN 'unhide' THEN UPDATE public.matches SET platform_hidden=false WHERE id=_match;
 WHEN 'disable' THEN UPDATE public.matches SET platform_disabled=true WHERE id=_match;
 WHEN 'enable' THEN UPDATE public.matches SET platform_disabled=false WHERE id=_match;
 WHEN 'archive' THEN UPDATE public.matches SET platform_archived=true WHERE id=_match;
 WHEN 'restore' THEN UPDATE public.matches SET platform_archived=false WHERE id=_match;
 WHEN 'delete' THEN UPDATE public.matches SET platform_deleted_at=clock_timestamp() WHERE id=_match;
 WHEN 'recover' THEN UPDATE public.matches SET platform_deleted_at=NULL WHERE id=_match;
 WHEN 'transfer' THEN
  IF actor<>'owner' THEN RAISE EXCEPTION 'Only the Platform Owner can transfer ownership' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM auth.users WHERE id=_owner AND email_confirmed_at IS NOT NULL FOR SHARE;
  IF NOT FOUND OR NOT public.platform_account_active(_owner) OR _owner=previous.created_by THEN RAISE EXCEPTION 'Choose a different active, verified account'; END IF;
  UPDATE public.matches SET created_by=_owner WHERE id=_match;
 ELSE RAISE EXCEPTION 'Unknown match action'; END CASE;
 SELECT * INTO updated FROM public.matches WHERE id=_match;
 INSERT INTO public.platform_activity(actor_id,match_id,action,reason,changes) VALUES(auth.uid(),_match,'independent_match_'||_action,nullif(trim(_reason),''),jsonb_build_object('before',to_jsonb(previous),'after',to_jsonb(updated)));
 DELETE FROM public.platform_tournament_context WHERE transaction_id=txid_current();
END $$;
REVOKE ALL ON FUNCTION public.platform_other_matches(text,text,integer),public.platform_other_match_details(uuid),public.platform_manage_other_match(uuid,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_other_matches(text,text,integer),public.platform_other_match_details(uuid),public.platform_manage_other_match(uuid,text,text,text,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
