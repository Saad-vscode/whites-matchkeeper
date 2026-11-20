-- Phase 4. Apply after 0016. Preferences and cricket records are preserved.
BEGIN;
CREATE TABLE public.platform_features(id text PRIMARY KEY, category text NOT NULL, label text NOT NULL, default_enabled boolean NOT NULL DEFAULT true);
INSERT INTO public.platform_features(id,category,label) VALUES
 ('tv','Live TV and presentation','Live TV scoreboard'),
 ('boundaries','Live TV and presentation','Boundary animations'),
 ('wickets','Live TV and presentation','Wicket animations'),
 ('moments','Live TV and presentation','Special moment animations'),
 ('sound','Personal features','Scorer sound effects'),
 ('celebrations','Live TV and presentation','Match congratulations and celebrations'),
 ('honours','Live TV and presentation','Tournament honors'),
 ('appearance','Live TV and presentation','Custom TV themes and fonts'),
 ('fixtures','Tournament management','Smart fixture generator'),
 ('branding','Tournament management','Custom tournament branding'),
 ('awards','Tournament management','MVP and Man of the Match calculations'),
 ('offline','Personal features','Offline scoring');
CREATE TABLE public.platform_feature_overrides(
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 feature_id text NOT NULL REFERENCES public.platform_features(id), enabled boolean NOT NULL,
 changed_at timestamptz NOT NULL DEFAULT now(), changed_by uuid NOT NULL REFERENCES auth.users(id), PRIMARY KEY(user_id,feature_id));
ALTER TABLE public.platform_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_feature_overrides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_features,public.platform_feature_overrides FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.feature_enabled(_user uuid,_feature text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce((SELECT coalesce(o.enabled,f.default_enabled) FROM public.platform_features f LEFT JOIN public.platform_feature_overrides o ON o.feature_id=f.id AND o.user_id=_user WHERE f.id=_feature),false)
$$;
CREATE FUNCTION public.feature_owner(_match uuid DEFAULT NULL,_t uuid DEFAULT NULL) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN _match IS NOT NULL THEN (SELECT coalesce(t.created_by,m.created_by) FROM public.matches m LEFT JOIN public.tournaments t ON t.id=m.tournament_id WHERE m.id=_match) ELSE (SELECT created_by FROM public.tournaments WHERE id=_t) END
$$;
REVOKE ALL ON FUNCTION public.feature_enabled(uuid,text),public.feature_owner(uuid,uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.read_feature_access(_match uuid DEFAULT NULL,_t uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE subject uuid;
BEGIN
 IF _match IS NOT NULL THEN
  IF NOT public.match_read_access(_match) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
  subject:=public.feature_owner(_match,NULL);
 ELSIF _t IS NOT NULL THEN
  IF NOT public.tournament_read_access(_t) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
  subject:=public.feature_owner(NULL,_t);
 ELSE
  IF NOT public.account_access() THEN RAISE EXCEPTION 'Sign in to verify feature access' USING ERRCODE='42501'; END IF;
  subject:=auth.uid();
 END IF;
 IF subject IS NULL THEN RAISE EXCEPTION 'Feature subject unavailable' USING ERRCODE='42501'; END IF;
 RETURN (SELECT jsonb_object_agg(id,public.feature_enabled(subject,id)) FROM public.platform_features);
END $$;
CREATE FUNCTION public.platform_feature_details(_target uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF public.platform_role() NOT IN ('owner','admin') THEN RAISE EXCEPTION 'Platform access denied' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=_target) THEN RAISE EXCEPTION 'User not found'; END IF;
 RETURN (SELECT jsonb_agg(jsonb_build_object('id',f.id,'label',f.label,'category',f.category,'default_enabled',f.default_enabled,
 'enabled',coalesce(o.enabled,f.default_enabled),'overridden',o.user_id IS NOT NULL,'changed_at',coalesce(o.changed_at,h.created_at),'changed_by',coalesce(o.changed_by,h.actor_id),
 'administrator',coalesce(u.raw_user_meta_data->>'full_name',u.email)) ORDER BY f.category,f.id)
 FROM public.platform_features f LEFT JOIN public.platform_feature_overrides o ON o.feature_id=f.id AND o.user_id=_target
 LEFT JOIN LATERAL (SELECT a.actor_id,a.created_at FROM public.platform_activity a WHERE a.subject_id=_target AND a.action='feature_permission_changed' AND a.changes->>'feature'=f.id ORDER BY a.created_at DESC,a.id DESC LIMIT 1) h ON true
 LEFT JOIN auth.users u ON u.id=coalesce(o.changed_by,h.actor_id));
END $$;
CREATE FUNCTION public.platform_save_features(_target uuid,_values jsonb,_reset boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor text; target_role text; item record; previous boolean; updated boolean;
BEGIN
 PERFORM pg_advisory_xact_lock(141414);
 actor:=public.platform_role();
 IF actor NOT IN ('owner','admin') THEN RAISE EXCEPTION 'Platform access denied' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM auth.users WHERE id=_target FOR SHARE;
 IF NOT FOUND OR NOT public.platform_account_active(_target) THEN RAISE EXCEPTION 'Select an active account'; END IF;
 SELECT coalesce((SELECT role FROM public.platform_roles WHERE user_id=_target),'user') INTO target_role;
 IF actor='admin' AND (target_role<>'user' OR _target=auth.uid()) THEN RAISE EXCEPTION 'Only the owner can manage administrative accounts' USING ERRCODE='42501'; END IF;
 IF _reset IS NULL OR _values IS NULL OR jsonb_typeof(_values)<>'object' OR length(_values::text)>3000 THEN RAISE EXCEPTION 'Invalid permissions'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(_values) e WHERE NOT EXISTS(SELECT 1 FROM public.platform_features f WHERE f.id=e.key) OR jsonb_typeof(e.value)<>'boolean') THEN RAISE EXCEPTION 'Unknown feature or invalid value'; END IF;
 FOR item IN SELECT * FROM public.platform_features WHERE _reset OR _values ? id ORDER BY id LOOP
  previous:=public.feature_enabled(_target,item.id);
  updated:=CASE WHEN _reset THEN item.default_enabled ELSE (_values->>item.id)::boolean END;
  IF _reset THEN DELETE FROM public.platform_feature_overrides WHERE user_id=_target AND feature_id=item.id;
  ELSE INSERT INTO public.platform_feature_overrides(user_id,feature_id,enabled,changed_by) VALUES(_target,item.id,updated,auth.uid())
   ON CONFLICT(user_id,feature_id) DO UPDATE SET enabled=excluded.enabled,changed_by=excluded.changed_by,changed_at=now(); END IF;
  INSERT INTO public.platform_activity(actor_id,subject_id,action,changes) VALUES(auth.uid(),_target,'feature_permission_changed',jsonb_build_object('feature',item.id,'previous',previous,'updated',updated,'reset',_reset));
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.read_feature_access(uuid,uuid),public.platform_feature_details(uuid),public.platform_save_features(uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_feature_access(uuid,uuid) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_feature_details(uuid),public.platform_save_features(uuid,jsonb,boolean) TO authenticated;
-- Triggers cover direct writes and writes through existing security-definer RPCs.
CREATE FUNCTION public.guard_feature_operation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner_id uuid; permitted boolean;
BEGIN
 IF auth.uid() IS NULL THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='matches' THEN
  IF NOT public.tournament_admin_mutation() THEN
   IF TG_OP='UPDATE' AND ROW(NEW.created_by,NEW.tournament_id) IS DISTINCT FROM ROW(OLD.created_by,OLD.tournament_id) THEN RAISE EXCEPTION 'FEATURE_RESTRICTED: Match ownership and tournament are protected' USING ERRCODE='42501'; END IF;
   IF TG_OP='INSERT' AND NEW.tournament_id IS NOT NULL AND NOT public.is_tournament_owner(NEW.tournament_id) THEN RAISE EXCEPTION 'FEATURE_RESTRICTED: Tournament organizer access required' USING ERRCODE='42501'; END IF;
  END IF;
 ELSIF TG_TABLE_NAME='tournaments' THEN
  owner_id:=CASE WHEN TG_OP='INSERT' THEN auth.uid() ELSE OLD.created_by END;
  IF TG_OP='UPDATE' THEN
   permitted:=NEW.logo_url IS NOT DISTINCT FROM OLD.logo_url AND NEW.primary_color IS NOT DISTINCT FROM OLD.primary_color AND NEW.accent_color IS NOT DISTINCT FROM OLD.accent_color;
  ELSE permitted:=NEW.logo_url IS NULL AND coalesce(NEW.primary_color,'#1f4d3a')='#1f4d3a' AND coalesce(NEW.accent_color,'#c8a24a')='#c8a24a'; END IF;
  IF NOT permitted AND NOT public.feature_enabled(owner_id,'branding') AND NOT public.tournament_admin_mutation() THEN RAISE EXCEPTION 'FEATURE_RESTRICTED: Tournament branding' USING ERRCODE='42501'; END IF;
 ELSIF TG_TABLE_NAME='match_award_publications' THEN
  IF NOT public.feature_enabled(public.feature_owner(NEW.match_id,NULL),'awards') THEN RAISE EXCEPTION 'FEATURE_RESTRICTED: Award calculations' USING ERRCODE='42501'; END IF;
 ELSIF TG_TABLE_NAME='tournament_presentation' THEN
  IF NEW.playing AND (NOT public.feature_enabled(public.feature_owner(NULL,NEW.tournament_id),'honours') OR NOT public.feature_enabled(public.feature_owner(NULL,NEW.tournament_id),'tv')) THEN RAISE EXCEPTION 'FEATURE_RESTRICTED: Tournament honors' USING ERRCODE='42501'; END IF;
 ELSIF TG_TABLE_NAME='fixture_generation_requests' THEN
  IF NOT public.feature_enabled(public.feature_owner(NULL,NEW.tournament_id),'fixtures') THEN RAISE EXCEPTION 'FEATURE_RESTRICTED: Smart fixture generator' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_feature_operation() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER feature_guard BEFORE INSERT OR UPDATE ON public.tournaments FOR EACH ROW EXECUTE FUNCTION public.guard_feature_operation();
CREATE TRIGGER feature_guard BEFORE INSERT OR UPDATE ON public.matches FOR EACH ROW EXECUTE FUNCTION public.guard_feature_operation();
CREATE TRIGGER feature_guard BEFORE INSERT OR UPDATE ON public.match_award_publications FOR EACH ROW EXECUTE FUNCTION public.guard_feature_operation();
CREATE TRIGGER feature_guard BEFORE INSERT OR UPDATE ON public.tournament_presentation FOR EACH ROW EXECUTE FUNCTION public.guard_feature_operation();
CREATE TRIGGER feature_guard BEFORE INSERT OR UPDATE ON public.fixture_generation_requests FOR EACH ROW EXECUTE FUNCTION public.guard_feature_operation();
-- Context access cannot be used to activate a restricted generator.
ALTER FUNCTION public.fixture_generator_context(uuid,uuid) RENAME TO fixture_generator_context_unrestricted;
REVOKE ALL ON FUNCTION public.fixture_generator_context_unrestricted(uuid,uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.fixture_generator_context(_t uuid,_group uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.feature_enabled(public.feature_owner(NULL,_t),'fixtures') THEN RAISE EXCEPTION 'FEATURE_RESTRICTED: Smart fixture generator' USING ERRCODE='42501'; END IF;
 RETURN public.fixture_generator_context_unrestricted(_t,_group);
END $$;
REVOKE ALL ON FUNCTION public.fixture_generator_context(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fixture_generator_context(uuid,uuid) TO authenticated;
CREATE FUNCTION public.match_award_access(_match uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.match_read_access(_match) AND public.feature_enabled(public.feature_owner(_match,NULL),'awards')
$$;
REVOKE ALL ON FUNCTION public.match_award_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_award_access(uuid) TO anon,authenticated;
CREATE POLICY feature_award_read ON public.match_award_publications AS RESTRICTIVE FOR SELECT TO anon,authenticated USING(public.match_award_access(match_id));
CREATE OR REPLACE FUNCTION public.read_tournament_presentation(_t uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN public.tournament_read_access(_t) THEN
 CASE WHEN public.feature_enabled(public.feature_owner(NULL,_t),'honours') AND public.feature_enabled(public.feature_owner(NULL,_t),'tv')
 THEN coalesce((SELECT to_jsonb(p) FROM public.tournament_presentation p WHERE tournament_id=_t),'{"playing":false,"seconds":8}'::jsonb)
 ELSE '{"playing":false,"seconds":8}'::jsonb END ELSE NULL END
$$;
NOTIFY pgrst,'reload schema';
COMMIT;
