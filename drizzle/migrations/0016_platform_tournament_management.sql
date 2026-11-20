-- Phase 3. Apply after 0015. No cricket totals or historical records are rewritten.
BEGIN;
ALTER TABLE public.tournaments
 ADD COLUMN platform_hidden boolean NOT NULL DEFAULT false,
 ADD COLUMN platform_disabled boolean NOT NULL DEFAULT false,
 ADD COLUMN platform_archived boolean NOT NULL DEFAULT false,
 ADD COLUMN platform_deleted_at timestamptz;
ALTER TABLE public.platform_activity ADD COLUMN tournament_id uuid;
CREATE INDEX platform_activity_tournament_time ON public.platform_activity(tournament_id,created_at DESC);

-- Unforgeable, transaction-scoped authorization for the checked management RPC.
CREATE TABLE public.platform_tournament_context (transaction_id bigint PRIMARY KEY, actor_id uuid NOT NULL);
ALTER TABLE public.platform_tournament_context ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_tournament_context FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.tournament_admin_mutation() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.platform_tournament_context WHERE transaction_id=txid_current() AND actor_id=auth.uid())
$$;
REVOKE ALL ON FUNCTION public.tournament_admin_mutation() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.tournament_read_access(_t uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT _t IS NULL OR EXISTS(SELECT 1 FROM public.tournaments t WHERE t.id=_t AND t.platform_deleted_at IS NULL AND
  (NOT t.platform_hidden OR (public.platform_account_active(auth.uid()) AND
   (t.created_by=auth.uid() OR public.has_role(auth.uid(),'admin') OR EXISTS(
    SELECT 1 FROM public.matches m WHERE m.tournament_id=t.id AND (m.created_by=auth.uid() OR EXISTS(SELECT 1 FROM public.match_scorers s WHERE s.match_id=m.id AND s.user_id=auth.uid())))))))
$$;
CREATE FUNCTION public.match_read_access(_m uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.matches WHERE id=_m AND public.tournament_read_access(tournament_id))
$$;
GRANT EXECUTE ON FUNCTION public.tournament_read_access(uuid),public.match_read_access(uuid) TO anon,authenticated;

CREATE FUNCTION public.tournament_write_access(_t uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT _t IS NULL OR EXISTS(SELECT 1 FROM public.tournaments WHERE id=_t AND NOT platform_disabled AND NOT platform_archived AND platform_deleted_at IS NULL)
$$;
CREATE OR REPLACE FUNCTION public.is_tournament_owner(_t uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.account_access() AND public.tournament_write_access(_t) AND (EXISTS(SELECT 1 FROM public.tournaments WHERE id=_t AND created_by=auth.uid()) OR public.has_role(auth.uid(),'admin'))
$$;
CREATE OR REPLACE FUNCTION public.is_match_owner(_match uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.account_access() AND EXISTS(SELECT 1 FROM public.matches WHERE id=_match AND public.tournament_write_access(tournament_id) AND (created_by=auth.uid() OR public.has_role(auth.uid(),'admin')))
$$;
CREATE OR REPLACE FUNCTION public.can_score(_match uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.account_access() AND EXISTS(SELECT 1 FROM public.matches m WHERE m.id=_match AND public.tournament_write_access(m.tournament_id) AND (m.created_by=auth.uid() OR public.has_role(auth.uid(),'admin') OR EXISTS(SELECT 1 FROM public.match_scorers s WHERE s.match_id=m.id AND s.user_id=auth.uid())))
$$;

CREATE FUNCTION public.guard_tournament_write() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row_data jsonb; tid uuid; state public.tournaments; bypass boolean:=public.tournament_admin_mutation();
BEGIN
 IF auth.uid() IS NULL THEN
  -- Trusted database maintenance; never exposed to browser clients.
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
 IF NOT public.platform_account_active(auth.uid()) THEN RAISE EXCEPTION 'ACCOUNT_RESTRICTED' USING ERRCODE='42501'; END IF;
 IF TG_TABLE_NAME='tournaments' AND NOT bypass THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Use recoverable platform deletion; permanent tournament deletion is not enabled' USING ERRCODE='42501'; END IF;
  IF TG_OP='INSERT' THEN
   IF NEW.platform_hidden OR NEW.platform_disabled OR NEW.platform_archived OR NEW.platform_deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Administrative fields are protected' USING ERRCODE='42501'; END IF;
  ELSIF TG_OP='UPDATE' AND ROW(NEW.created_by,NEW.platform_hidden,NEW.platform_disabled,NEW.platform_archived,NEW.platform_deleted_at) IS DISTINCT FROM ROW(OLD.created_by,OLD.platform_hidden,OLD.platform_disabled,OLD.platform_archived,OLD.platform_deleted_at) THEN
   RAISE EXCEPTION 'Administrative fields are protected' USING ERRCODE='42501';
  END IF;
 END IF;
 IF NOT bypass THEN
  -- Check both sides: moving a row cannot detach it from a restriction.
  FOR row_data IN SELECT x FROM unnest(ARRAY[CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(OLD) END,CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(NEW) END]) x WHERE x IS NOT NULL LOOP
   IF TG_TABLE_NAME='tournaments' THEN tid:=(row_data->>'id')::uuid;
   ELSIF row_data ? 'tournament_id' THEN tid:=(row_data->>'tournament_id')::uuid;
   ELSE SELECT tournament_id INTO tid FROM public.matches WHERE id=(row_data->>'match_id')::uuid; END IF;
   IF tid IS NOT NULL THEN
    SELECT * INTO state FROM public.tournaments WHERE id=tid FOR SHARE;
    IF state.platform_disabled OR state.platform_archived OR state.platform_deleted_at IS NOT NULL THEN
     RAISE EXCEPTION 'TOURNAMENT_RESTRICTED: This tournament is disabled, archived or deleted. Scoring and changes are paused.' USING ERRCODE='42501';
    END IF;
   END IF;
  END LOOP;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION public.guard_tournament_write() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE r record; expression text; BEGIN
 FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN
 ('tournaments','tournament_teams','tournament_groups','tournament_playoffs','tournament_presentation','fixture_generation_requests','matches','deliveries','match_scorers','score_operations','match_award_publications') LOOP
  expression:=CASE WHEN r.tablename='tournaments' THEN 'public.tournament_read_access(id)' WHEN r.tablename IN('matches','tournament_teams','tournament_groups','tournament_playoffs','tournament_presentation','fixture_generation_requests') THEN 'public.tournament_read_access(tournament_id)' ELSE 'public.match_read_access(match_id)' END;
  EXECUTE format('CREATE POLICY tournament_visibility_guard ON public.%I AS RESTRICTIVE FOR SELECT TO anon,authenticated USING (%s)',r.tablename,expression);
  EXECUTE format('CREATE TRIGGER tournament_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_tournament_write()',r.tablename);
 END LOOP;
END $$;
-- These two legacy public readers bypass RLS. Wrap them with explicit access checks.
ALTER FUNCTION public.playoff_context(uuid) RENAME TO playoff_context_internal;
REVOKE ALL ON FUNCTION public.playoff_context_internal(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.playoff_context(_t uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN IF NOT public.tournament_read_access(_t) THEN RAISE EXCEPTION 'Tournament unavailable' USING ERRCODE='42501'; END IF; RETURN public.playoff_context_internal(_t); END $$;
REVOKE ALL ON FUNCTION public.playoff_context(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.playoff_context(uuid) TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.read_tournament_presentation(_t uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN public.tournament_read_access(_t) THEN coalesce((SELECT to_jsonb(p) FROM public.tournament_presentation p WHERE tournament_id=_t),'{"playing":false,"seconds":8}'::jsonb) ELSE NULL END
$$;

CREATE FUNCTION public.platform_tournament_rows() RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT to_jsonb(t)||jsonb_build_object('organizer',coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.raw_user_meta_data->>'name',u.email,'Unknown organizer'),'email',u.email,
 'teams',(SELECT count(*) FROM public.tournament_teams WHERE tournament_id=t.id),
 'players',(SELECT coalesce(sum(cardinality(players)),0) FROM public.tournament_teams WHERE tournament_id=t.id),
 'matches',(SELECT count(*) FROM public.matches WHERE tournament_id=t.id),
 'live_matches',(SELECT count(*) FROM public.matches WHERE tournament_id=t.id AND status IN('live','paused','innings_break')),
 'lifecycle',CASE WHEN t.platform_archived THEN 'archived' WHEN coalesce((SELECT bool_and(m.status='completed') FROM public.matches m WHERE m.tournament_id=t.id AND m.status<>'cancelled' AND
  (m.rules->>'playoffNode'='final' OR (lower(trim(m.rules->'tournamentStage'->>'title'))='final' AND NOT EXISTS(SELECT 1 FROM public.matches b WHERE b.tournament_id=t.id AND b.status<>'cancelled' AND b.rules->>'playoffNode'='final'))) HAVING count(*)=1),false) THEN 'completed'
 WHEN EXISTS(SELECT 1 FROM public.matches WHERE tournament_id=t.id AND status IN('live','paused','innings_break','completed')) THEN 'active' ELSE 'upcoming' END)
 FROM public.tournaments t LEFT JOIN auth.users u ON u.id=t.created_by
$$;
REVOKE ALL ON FUNCTION public.platform_tournament_rows() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.platform_tournament_directory(_search text DEFAULT '',_status text DEFAULT 'all',_visibility text DEFAULT 'all',_organizer text DEFAULT '',_sort text DEFAULT 'newest',_page integer DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; BEGIN
 IF public.platform_role() NOT IN('owner','admin') THEN RAISE EXCEPTION 'Platform access denied' USING ERRCODE='42501'; END IF;
 IF _page NOT BETWEEN 0 AND 100000 OR length(_search)>200 OR length(_organizer)>200 OR _status NOT IN('all','upcoming','active','completed','archived','disabled','deleted') OR _visibility NOT IN('all','visible','hidden') OR _sort NOT IN('newest','oldest','name') THEN RAISE EXCEPTION 'Invalid filters'; END IF;
 WITH rows AS MATERIALIZED(SELECT public.platform_tournament_rows() AS r), filtered AS(SELECT r FROM rows WHERE
  (_status='deleted' OR r->>'platform_deleted_at' IS NULL) AND (_status IN('all','deleted') OR r->>'lifecycle'=_status OR (_status='disabled' AND (r->>'platform_disabled')::boolean)) AND (_status<>'deleted' OR r->>'platform_deleted_at' IS NOT NULL)
  AND (_visibility='all' OR (r->>'platform_hidden')::boolean=(_visibility='hidden'))
  AND strpos(lower(concat(r->>'name',' ',r->>'organizer',' ',r->>'email')),lower(trim(_search)))>0
  AND strpos(lower(concat(r->>'organizer',' ',r->>'email')),lower(trim(_organizer)))>0), page AS(SELECT r FROM filtered ORDER BY
   CASE WHEN _sort='name' THEN lower(r->>'name') END, CASE WHEN _sort='oldest' THEN r->>'created_at' END ASC, CASE WHEN _sort='newest' THEN r->>'created_at' END DESC,r->>'id' LIMIT 20 OFFSET _page*20)
 SELECT jsonb_build_object('rows',(SELECT coalesce(jsonb_agg(r),'[]') FROM page),'total',(SELECT count(*) FROM filtered),
 'summary',jsonb_build_object('total',(SELECT count(*) FROM rows WHERE r->>'platform_deleted_at' IS NULL),'active',(SELECT count(*) FROM rows WHERE r->>'lifecycle'='active' AND r->>'platform_deleted_at' IS NULL),'completed',(SELECT count(*) FROM rows WHERE r->>'lifecycle'='completed' AND r->>'platform_deleted_at' IS NULL),'upcoming',(SELECT count(*) FROM rows WHERE r->>'lifecycle'='upcoming' AND r->>'platform_deleted_at' IS NULL),'hidden',(SELECT count(*) FROM rows WHERE (r->>'platform_hidden')::boolean AND r->>'platform_deleted_at' IS NULL),'disabled',(SELECT count(*) FROM rows WHERE (r->>'platform_disabled')::boolean AND r->>'platform_deleted_at' IS NULL),'archived',(SELECT count(*) FROM rows WHERE (r->>'platform_archived')::boolean AND r->>'platform_deleted_at' IS NULL))) INTO result;
 RETURN result;
END $$;

CREATE FUNCTION public.platform_tournament_details(_t uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF public.platform_role() NOT IN('owner','admin') THEN RAISE EXCEPTION 'Platform access denied' USING ERRCODE='42501'; END IF;
 RETURN public.playoff_context_internal(_t)||jsonb_build_object('published_awards',(SELECT coalesce(jsonb_agg(a.match_id),'[]') FROM public.match_award_publications a JOIN public.matches m ON m.id=a.match_id WHERE m.tournament_id=_t AND m.status='completed' AND a.score_revision=m.score_revision),'history',(SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT actor_id,action,reason,changes,created_at FROM public.platform_activity WHERE tournament_id=_t ORDER BY id DESC LIMIT 50)x));
END $$;
CREATE FUNCTION public.platform_transfer_candidates(_search text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF public.platform_role()<>'owner' THEN RAISE EXCEPTION 'Owner access required' USING ERRCODE='42501'; END IF;
 IF length(_search)>200 THEN RAISE EXCEPTION 'Invalid search'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT id,email,coalesce(raw_user_meta_data->>'full_name',raw_user_meta_data->>'name','') AS name FROM auth.users WHERE public.platform_account_active(id) AND email_confirmed_at IS NOT NULL AND strpos(lower(concat(email,' ',raw_user_meta_data->>'full_name',' ',raw_user_meta_data->>'name')),lower(trim(_search)))>0 ORDER BY email LIMIT 20)x);
END $$;

CREATE FUNCTION public.platform_manage_tournament(_t uuid,_action text,_values jsonb DEFAULT '{}',_reason text DEFAULT '',_confirmation text DEFAULT '') RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE before_row public.tournaments; after_row public.tournaments; target uuid; actor text; BEGIN
 SET LOCAL lock_timeout='5s';
 PERFORM pg_advisory_xact_lock(141414);
 PERFORM 1 FROM auth.users WHERE id=auth.uid() FOR SHARE;
 actor:=public.platform_role();
 IF actor NOT IN('owner','admin') THEN RAISE EXCEPTION 'Platform access denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO before_row FROM public.tournaments WHERE id=_t FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Tournament not found'; END IF;
 IF length(_reason)>1000 OR length(_values::text)>5000 THEN RAISE EXCEPTION 'Input too long'; END IF;
 IF before_row.platform_deleted_at IS NOT NULL AND _action<>'recover' THEN RAISE EXCEPTION 'Restore the deleted tournament first'; END IF;
 IF _action IN('disable','archive','delete','transfer') AND nullif(trim(_reason),'') IS NULL THEN RAISE EXCEPTION 'Provide a reason'; END IF;
 IF _action IN('delete','transfer') AND _confirmation IS DISTINCT FROM before_row.name THEN RAISE EXCEPTION 'Type the tournament name to confirm'; END IF;
 INSERT INTO public.platform_tournament_context VALUES(txid_current(),auth.uid());
 CASE _action
 WHEN 'edit' THEN
  IF nullif(trim(_values->>'name'),'') IS NULL OR length(_values->>'name')>150 OR length(coalesce(_values->>'short_name',''))>30 OR length(coalesce(_values->>'location',''))>200 OR length(coalesce(_values->>'description',''))>2000 THEN RAISE EXCEPTION 'Invalid tournament information'; END IF;
  UPDATE public.tournaments SET name=trim(_values->>'name'),short_name=nullif(trim(_values->>'short_name'),''),location=nullif(trim(_values->>'location'),''),description=nullif(_values->>'description','') WHERE id=_t;
 WHEN 'hide' THEN UPDATE public.tournaments SET platform_hidden=true WHERE id=_t;
 WHEN 'unhide' THEN UPDATE public.tournaments SET platform_hidden=false WHERE id=_t;
 WHEN 'disable' THEN UPDATE public.tournaments SET platform_disabled=true WHERE id=_t;
 WHEN 'enable' THEN UPDATE public.tournaments SET platform_disabled=false WHERE id=_t;
 WHEN 'archive' THEN UPDATE public.tournaments SET platform_archived=true WHERE id=_t;
 WHEN 'restore' THEN UPDATE public.tournaments SET platform_archived=false WHERE id=_t;
 WHEN 'delete' THEN
  IF EXISTS(SELECT 1 FROM public.matches WHERE tournament_id=_t AND status IN('live','paused','innings_break')) THEN RAISE EXCEPTION 'Resolve ongoing matches before deleting'; END IF;
  UPDATE public.tournaments SET platform_deleted_at=clock_timestamp() WHERE id=_t;
 WHEN 'recover' THEN UPDATE public.tournaments SET platform_deleted_at=NULL WHERE id=_t;
 WHEN 'transfer' THEN
  IF actor<>'owner' THEN RAISE EXCEPTION 'Only the Platform Owner can transfer ownership' USING ERRCODE='42501'; END IF;
  target:=(_values->>'owner_id')::uuid;
  PERFORM 1 FROM auth.users WHERE id=target AND email_confirmed_at IS NOT NULL FOR SHARE;
  IF NOT FOUND OR NOT public.platform_account_active(target) OR target=before_row.created_by THEN RAISE EXCEPTION 'Choose a different active, verified account'; END IF;
  UPDATE public.tournaments SET created_by=target WHERE id=_t;
  UPDATE public.matches SET created_by=target WHERE tournament_id=_t;
 ELSE RAISE EXCEPTION 'Unknown tournament action'; END CASE;
 SELECT * INTO after_row FROM public.tournaments WHERE id=_t;
 INSERT INTO public.platform_activity(actor_id,tournament_id,action,reason,changes) VALUES(auth.uid(),_t,'tournament_'||_action,nullif(trim(_reason),''),jsonb_build_object('before',to_jsonb(before_row),'after',to_jsonb(after_row)));
 DELETE FROM public.platform_tournament_context WHERE transaction_id=txid_current();
END $$;
REVOKE ALL ON FUNCTION public.platform_tournament_directory(text,text,text,text,text,integer),public.platform_tournament_details(uuid),public.platform_transfer_candidates(text),public.platform_manage_tournament(uuid,text,jsonb,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_tournament_directory(text,text,text,text,text,integer),public.platform_tournament_details(uuid),public.platform_transfer_candidates(text),public.platform_manage_tournament(uuid,text,jsonb,text,text) TO authenticated;
-- Keep the Phase 1 overview consistent with recoverable deletion and archiving.
ALTER FUNCTION public.platform_overview() RENAME TO platform_overview_before_tournament_controls;
REVOKE ALL ON FUNCTION public.platform_overview_before_tournament_controls() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.platform_overview() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE overview jsonb; summary jsonb; BEGIN
 overview:=public.platform_overview_before_tournament_controls();
 summary:=public.platform_tournament_directory()->'summary';
 RETURN overview||jsonb_build_object('tournaments',summary->'total','activeTournaments',summary->'active','completedTournaments',summary->'completed',
 'recentTournaments',(SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT id,name,created_at FROM public.tournaments WHERE platform_deleted_at IS NULL ORDER BY created_at DESC LIMIT 5)x));
END $$;
REVOKE ALL ON FUNCTION public.platform_overview() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_overview() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
