-- Phase 5: non-destructive platform configuration. Apply after 0017.
BEGIN;
CREATE TABLE public.platform_settings (
 id text PRIMARY KEY, category text NOT NULL, value jsonb NOT NULL, default_value jsonb NOT NULL,
 changed_at timestamptz NOT NULL DEFAULT now(), changed_by uuid REFERENCES auth.users(id));
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_settings FROM PUBLIC,anon,authenticated;
INSERT INTO public.platform_settings(id,category,value,default_value) SELECT id,category,v,v FROM (VALUES
 ('maintenance','controls','false'::jsonb),('maintenance_message','controls','"Crease is undergoing maintenance. Please check back shortly."'::jsonb),
 ('registrations','controls','true'::jsonb),('tournaments','controls','true'::jsonb),('quick_matches','controls','true'::jsonb),
 ('tournaments_per_user','limits','null'::jsonb),('quick_matches_per_user','limits','null'::jsonb),
 ('teams_per_tournament','limits','null'::jsonb),('players_per_team','limits','null'::jsonb),('matches_per_tournament','limits','null'::jsonb),
 ('tv_theme','defaults','"teal"'::jsonb),('animations','defaults','true'::jsonb),('sound','defaults','false'::jsonb),
 ('celebration','defaults','true'::jsonb),('celebration_style','defaults','"stadium"'::jsonb),('celebration_duration','defaults','10000'::jsonb),
 ('honours_seconds','defaults','8'::jsonb),('honours_runs','defaults','true'::jsonb),('honours_wickets','defaults','true'::jsonb),
 ('honours_player','defaults','true'::jsonb),('honours_matches','defaults','true'::jsonb)) s(id,category,v);
ALTER TABLE public.platform_features ADD COLUMN globally_enabled boolean NOT NULL DEFAULT true;
-- A baseline is assigned once. Changing registration defaults never rewrites it.
CREATE TABLE public.platform_feature_baselines(user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,feature_id text REFERENCES public.platform_features(id),enabled boolean NOT NULL,PRIMARY KEY(user_id,feature_id));
ALTER TABLE public.platform_feature_baselines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_feature_baselines FROM PUBLIC,anon,authenticated;
INSERT INTO public.platform_feature_baselines SELECT u.id,f.id,f.default_enabled FROM auth.users u CROSS JOIN public.platform_features f;
CREATE OR REPLACE FUNCTION public.feature_enabled(_user uuid,_feature text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce((SELECT f.globally_enabled AND coalesce(o.enabled,b.enabled,f.default_enabled) FROM public.platform_features f
 LEFT JOIN public.platform_feature_overrides o ON o.feature_id=f.id AND o.user_id=_user
 LEFT JOIN public.platform_feature_baselines b ON b.feature_id=f.id AND b.user_id=_user WHERE f.id=_feature),false)
$$;
CREATE FUNCTION public.global_value(_id text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT value FROM public.platform_settings WHERE id=_id $$;
REVOKE ALL ON FUNCTION public.global_value(text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.platform_registration_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(141414);
 IF NOT (public.global_value('registrations'))::boolean OR (public.global_value('maintenance'))::boolean THEN RAISE EXCEPTION 'New registrations are temporarily closed'; END IF;
 INSERT INTO public.platform_feature_baselines SELECT NEW.id,id,default_enabled FROM public.platform_features;
 RETURN NEW;
END $$;
CREATE TRIGGER platform_registration_settings AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.platform_registration_guard();
REVOKE ALL ON FUNCTION public.platform_registration_guard() FROM PUBLIC,anon,authenticated;
CREATE TABLE public.platform_maintenance_matches(match_id uuid PRIMARY KEY REFERENCES public.matches(id) ON DELETE CASCADE);
ALTER TABLE public.platform_maintenance_matches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_maintenance_matches FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.platform_settings_read() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF public.platform_role() NOT IN ('owner','admin') THEN RAISE EXCEPTION 'Platform access denied' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('revision',(SELECT max(changed_at)::text FROM public.platform_settings),'settings',(SELECT jsonb_agg(s ORDER BY category,id) FROM public.platform_settings s),
 'features',(SELECT jsonb_agg(f ORDER BY category,id) FROM public.platform_features f),
 'live_matches',(SELECT count(*) FROM public.matches WHERE status IN ('live','paused','innings_break')),
 'users',(SELECT count(*) FROM auth.users));
END $$;
CREATE FUNCTION public.platform_settings_save(_values jsonb,_features jsonb,_revision text,_reason text DEFAULT '') RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e record; old_value jsonb; current_revision text;
BEGIN
 PERFORM pg_advisory_xact_lock(141414);
 IF public.platform_role()<>'owner' THEN RAISE EXCEPTION 'Only the Platform Owner can change settings' USING ERRCODE='42501'; END IF;
 SELECT max(changed_at)::text INTO current_revision FROM public.platform_settings;
 IF _revision IS DISTINCT FROM current_revision THEN RAISE EXCEPTION 'Settings changed. Reload before saving.'; END IF;
 IF _values IS NULL OR _features IS NULL OR jsonb_typeof(_values)<>'object' OR jsonb_typeof(_features)<>'object' OR length(_values::text)>10000 OR length(_features::text)>10000 OR length(_reason)>1000 THEN RAISE EXCEPTION 'Invalid settings'; END IF;
 FOR e IN SELECT key,value FROM jsonb_each(_values) LOOP
  IF NOT EXISTS(SELECT 1 FROM public.platform_settings WHERE id=e.key) THEN RAISE EXCEPTION 'Unknown setting'; END IF;
  IF e.key IN ('maintenance','registrations','tournaments','quick_matches','animations','sound','celebration','honours_runs','honours_wickets','honours_player','honours_matches') THEN
   IF jsonb_typeof(e.value)<>'boolean' THEN RAISE EXCEPTION 'Expected boolean'; END IF;
  ELSIF e.key IN ('tournaments_per_user','quick_matches_per_user','teams_per_tournament','players_per_team','matches_per_tournament') THEN
   IF e.value<>'null'::jsonb AND (jsonb_typeof(e.value)<>'number' OR e.value::text !~ '^[0-9]+$' OR (e.value::text)::numeric>100000) THEN RAISE EXCEPTION 'Limit must be unlimited or a whole number from 0 to 100000'; END IF;
  ELSIF e.key='maintenance_message' THEN
   IF jsonb_typeof(e.value)<>'string' OR length(e.value#>>'{}') NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Maintenance message must contain 1?500 characters'; END IF;
  ELSIF e.key='tv_theme' AND e.value NOT IN ('"teal"','"blue"','"violet"','"night"') OR e.key='celebration_style' AND e.value NOT IN ('"classic"','"stadium"','"gold"') OR e.key='celebration_duration' AND e.value NOT IN ('5000','10000','15000') OR e.key='honours_seconds' AND e.value NOT IN ('5','6','7','8','9','10') THEN RAISE EXCEPTION 'Unsupported configuration'; END IF;
  SELECT value INTO old_value FROM public.platform_settings WHERE id=e.key;
  IF old_value IS DISTINCT FROM e.value THEN
   IF e.key='maintenance' THEN
    DELETE FROM public.platform_maintenance_matches;
    IF e.value='true'::jsonb THEN INSERT INTO public.platform_maintenance_matches SELECT id FROM public.matches WHERE status IN ('live','paused','innings_break'); END IF;
   END IF;
   UPDATE public.platform_settings SET value=e.value,changed_at=clock_timestamp(),changed_by=auth.uid() WHERE id=e.key;
   INSERT INTO public.platform_activity(actor_id,action,reason,changes) VALUES(auth.uid(),'platform_setting_changed',_reason,jsonb_build_object('setting',e.key,'previous',old_value,'updated',e.value));
  END IF;
 END LOOP;
 FOR e IN SELECT key,value FROM jsonb_each(_features) LOOP
  IF NOT EXISTS(SELECT 1 FROM public.platform_features WHERE id=e.key) OR jsonb_typeof(e.value)<>'object' OR NOT (e.value ? 'globally_enabled' AND e.value ? 'default_enabled') OR jsonb_typeof(e.value->'globally_enabled')<>'boolean' OR jsonb_typeof(e.value->'default_enabled')<>'boolean' OR (e.value - 'globally_enabled' - 'default_enabled')<>'{}'::jsonb THEN RAISE EXCEPTION 'Invalid feature configuration'; END IF;
  SELECT jsonb_build_object('globally_enabled',globally_enabled,'default_enabled',default_enabled) INTO old_value FROM public.platform_features WHERE id=e.key;
  IF old_value IS DISTINCT FROM e.value THEN
   UPDATE public.platform_features SET globally_enabled=(e.value->>'globally_enabled')::boolean,default_enabled=(e.value->>'default_enabled')::boolean WHERE id=e.key;
   UPDATE public.platform_settings SET changed_at=clock_timestamp(),changed_by=auth.uid() WHERE id='maintenance';
   INSERT INTO public.platform_activity(actor_id,action,reason,changes) VALUES(auth.uid(),'platform_feature_changed',_reason,jsonb_build_object('feature',e.key,'previous',old_value,'updated',e.value));
  END IF;
 END LOOP;
END $$;
CREATE FUNCTION public.public_platform_configuration() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('values',(SELECT jsonb_object_agg(id,value) FROM public.platform_settings),
 'ongoing',(SELECT coalesce(jsonb_agg(m.id),'[]'::jsonb) FROM public.matches m JOIN public.platform_maintenance_matches d ON d.match_id=m.id WHERE m.status IN ('live','paused','innings_break') AND public.match_read_access(m.id)))
$$;
REVOKE ALL ON FUNCTION public.platform_settings_read(),public.platform_settings_save(jsonb,jsonb,text,text),public.public_platform_configuration() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_settings_read(),public.platform_settings_save(jsonb,jsonb,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.public_platform_configuration() TO anon,authenticated;
-- Serialize creation and setting changes with the existing administrative lock.
-- This also covers atomic scoring, fixture generation and direct API writes.
CREATE FUNCTION public.guard_global_settings() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r jsonb; mid uuid; lim integer; used integer; old_size integer:=0;
BEGIN
 IF auth.uid() IS NULL THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
 PERFORM pg_advisory_xact_lock(141414);
 IF public.tournament_admin_mutation() THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
 r:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 mid:=CASE WHEN TG_TABLE_NAME='matches' THEN (r->>'id')::uuid ELSE (r->>'match_id')::uuid END;
 IF (public.global_value('maintenance'))::boolean AND mid IS NOT NULL AND EXISTS(SELECT 1 FROM public.platform_maintenance_matches d JOIN public.matches m ON m.id=d.match_id WHERE m.id=mid AND m.status IN ('live','paused','innings_break')) THEN
  DELETE FROM public.platform_drain_transactions WHERE transaction_id<>txid_current();
  INSERT INTO public.platform_drain_transactions VALUES(txid_current(),mid) ON CONFLICT DO NOTHING;
 END IF;
 IF (public.global_value('maintenance'))::boolean AND NOT (TG_TABLE_NAME IN ('matches','deliveries','score_operations') AND EXISTS(SELECT 1 FROM public.platform_maintenance_matches d JOIN public.matches m ON m.id=d.match_id WHERE m.id=mid AND m.status IN ('live','paused','innings_break')) OR TG_TABLE_NAME IN ('matches','deliveries','score_operations') AND EXISTS(SELECT 1 FROM public.platform_drain_transactions WHERE transaction_id=txid_current() AND match_id=mid)) THEN RAISE EXCEPTION 'PLATFORM_MAINTENANCE: Existing live matches may finish; other changes are paused.' USING ERRCODE='42501'; END IF;
 IF TG_OP='INSERT' AND TG_TABLE_NAME='tournaments' THEN
  IF NOT (public.global_value('tournaments'))::boolean THEN RAISE EXCEPTION 'New tournament creation is temporarily closed'; END IF;
  lim:=(public.global_value('tournaments_per_user')#>>'{}')::integer;
  SELECT count(*) INTO used FROM public.tournaments WHERE created_by=NEW.created_by;
 ELSIF TG_OP='INSERT' AND TG_TABLE_NAME='matches' THEN
  IF NEW.tournament_id IS NULL THEN
   IF NOT (public.global_value('quick_matches'))::boolean THEN RAISE EXCEPTION 'New quick match creation is temporarily closed'; END IF;
   lim:=(public.global_value('quick_matches_per_user')#>>'{}')::integer;
   SELECT count(*) INTO used FROM public.matches WHERE tournament_id IS NULL AND created_by=NEW.created_by;
  ELSE
   lim:=(public.global_value('matches_per_tournament')#>>'{}')::integer;
   SELECT count(*) INTO used FROM public.matches WHERE tournament_id=NEW.tournament_id;
  END IF;
 ELSIF TG_OP='INSERT' AND TG_TABLE_NAME='tournament_teams' THEN
  lim:=(public.global_value('teams_per_tournament')#>>'{}')::integer;
  SELECT count(*) INTO used FROM public.tournament_teams WHERE tournament_id=NEW.tournament_id;
 END IF;
 IF lim IS NOT NULL AND used>=lim THEN RAISE EXCEPTION 'PLATFORM_LIMIT: Creation limit reached. Existing records are preserved.'; END IF;
 IF TG_OP='UPDATE' AND TG_TABLE_NAME='tournament_teams' THEN
 IF NEW.tournament_id IS DISTINCT FROM OLD.tournament_id THEN
  lim:=(public.global_value('teams_per_tournament')#>>'{}')::integer;
  SELECT count(*) INTO used FROM public.tournament_teams WHERE tournament_id=NEW.tournament_id;
  IF lim IS NOT NULL AND used>=lim THEN RAISE EXCEPTION 'PLATFORM_LIMIT: Destination team limit reached'; END IF;
 END IF; END IF;
 IF TG_OP<>'DELETE' AND TG_TABLE_NAME='matches' THEN
  lim:=(public.global_value('players_per_team')#>>'{}')::integer;
  IF lim IS NOT NULL THEN
   IF TG_OP='INSERT' THEN
    IF cardinality(NEW.team_a_players)>lim OR cardinality(NEW.team_b_players)>lim THEN RAISE EXCEPTION 'PLATFORM_LIMIT: Player limit reached'; END IF;
   ELSIF cardinality(NEW.team_a_players)>lim AND cardinality(NEW.team_a_players)>cardinality(OLD.team_a_players) OR cardinality(NEW.team_b_players)>lim AND cardinality(NEW.team_b_players)>cardinality(OLD.team_b_players) THEN RAISE EXCEPTION 'PLATFORM_LIMIT: Player limit reached'; END IF;
  END IF;
 END IF;
 IF TG_OP<>'DELETE' AND TG_TABLE_NAME='tournament_teams' THEN
  IF TG_OP='UPDATE' THEN old_size:=cardinality(OLD.players); END IF;
  lim:=(public.global_value('players_per_team')#>>'{}')::integer;
  IF lim IS NOT NULL AND cardinality(NEW.players)>lim AND cardinality(NEW.players)>old_size THEN RAISE EXCEPTION 'PLATFORM_LIMIT: Player limit reached'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION public.guard_global_settings() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['tournaments','tournament_teams','tournament_groups','matches','deliveries','score_operations','match_scorers','tournament_playoffs','tournament_presentation','fixture_generation_requests','match_award_publications'] LOOP
 IF to_regclass('public.'||t) IS NOT NULL THEN EXECUTE format('CREATE TRIGGER a_global_settings BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_global_settings()',t); END IF;
END LOOP; END $$;
-- A scoring transaction may finish its audit write after marking the match completed.
CREATE TABLE public.platform_drain_transactions(transaction_id bigint,match_id uuid,PRIMARY KEY(transaction_id,match_id));
ALTER TABLE public.platform_drain_transactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_drain_transactions FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.platform_bulk_defaults(_confirm text,_revision text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(141414);
 IF public.platform_role()<>'owner' THEN RAISE EXCEPTION 'Only the Platform Owner can apply defaults' USING ERRCODE='42501'; END IF;
 IF _confirm IS DISTINCT FROM 'APPLY TO ALL USERS' OR _revision IS DISTINCT FROM (SELECT max(changed_at)::text FROM public.platform_settings) THEN RAISE EXCEPTION 'Confirmation or settings revision changed'; END IF;
 INSERT INTO public.platform_activity(actor_id,action,changes) SELECT auth.uid(),'platform_defaults_applied',jsonb_build_object('user',u.id,'previous', (SELECT jsonb_object_agg(f.id,coalesce(o.enabled,b.enabled,f.default_enabled)) FROM public.platform_features f LEFT JOIN public.platform_feature_baselines b ON b.feature_id=f.id AND b.user_id=u.id LEFT JOIN public.platform_feature_overrides o ON o.feature_id=f.id AND o.user_id=u.id),'updated',(SELECT jsonb_object_agg(id,default_enabled) FROM public.platform_features)) FROM auth.users u;
 DELETE FROM public.platform_feature_overrides;
 INSERT INTO public.platform_feature_baselines SELECT u.id,f.id,f.default_enabled FROM auth.users u CROSS JOIN public.platform_features f ON CONFLICT(user_id,feature_id) DO UPDATE SET enabled=excluded.enabled;
END $$;
CREATE TABLE public.platform_announcements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL CHECK(length(title) BETWEEN 1 AND 120),
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 1000), category text NOT NULL CHECK(category IN ('information','important','feature','maintenance','warning')),
 published boolean NOT NULL DEFAULT false, dismissible boolean NOT NULL DEFAULT true, starts_at timestamptz, ends_at timestamptz,
 changed_at timestamptz NOT NULL DEFAULT now(), CHECK(ends_at IS NULL OR starts_at IS NULL OR ends_at>starts_at));
ALTER TABLE public.platform_announcements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_announcements FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.platform_announcements_read(_public boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT _public AND public.platform_role() NOT IN ('owner','admin') THEN RAISE EXCEPTION 'Platform access denied' USING ERRCODE='42501'; END IF;
 RETURN coalesce((SELECT jsonb_agg(a ORDER BY changed_at DESC) FROM public.platform_announcements a WHERE NOT _public OR (published AND (starts_at IS NULL OR starts_at<=now()) AND (ends_at IS NULL OR ends_at>now()))),'[]'::jsonb);
END $$;
CREATE FUNCTION public.platform_announcement_save(_id uuid,_value jsonb,_delete boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous jsonb; saved public.platform_announcements;
BEGIN
 PERFORM pg_advisory_xact_lock(141414);
 IF public.platform_role()<>'owner' THEN RAISE EXCEPTION 'Only the Platform Owner can change announcements' USING ERRCODE='42501'; END IF;
 SELECT to_jsonb(a) INTO previous FROM public.platform_announcements a WHERE id=_id;
 IF _id IS NOT NULL AND previous IS NULL THEN RAISE EXCEPTION 'Announcement no longer exists'; END IF;
 IF _delete THEN DELETE FROM public.platform_announcements WHERE id=_id;
 ELSE
  IF _value IS NULL OR jsonb_typeof(_value)<>'object' OR length(_value::text)>5000 OR jsonb_typeof(_value->'published') IS DISTINCT FROM 'boolean' OR jsonb_typeof(_value->'dismissible') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid announcement'; END IF;
  INSERT INTO public.platform_announcements(id,title,body,category,published,dismissible,starts_at,ends_at)
  VALUES(coalesce(_id,gen_random_uuid()),trim(_value->>'title'),trim(_value->>'body'),_value->>'category',(_value->>'published')::boolean,(_value->>'dismissible')::boolean,(_value->>'starts_at')::timestamptz,(_value->>'ends_at')::timestamptz)
  ON CONFLICT(id) DO UPDATE SET title=excluded.title,body=excluded.body,category=excluded.category,published=excluded.published,dismissible=excluded.dismissible,starts_at=excluded.starts_at,ends_at=excluded.ends_at,changed_at=clock_timestamp() RETURNING * INTO saved;
 END IF;
 INSERT INTO public.platform_activity(actor_id,action,changes) VALUES(auth.uid(),CASE WHEN _delete THEN 'announcement_deleted' ELSE 'announcement_saved' END,jsonb_build_object('previous',previous,'updated',to_jsonb(saved)));
END $$;
REVOKE ALL ON FUNCTION public.platform_bulk_defaults(text,text),public.platform_announcements_read(boolean),public.platform_announcement_save(uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_bulk_defaults(text,text),public.platform_announcement_save(uuid,jsonb,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_announcements_read(boolean) TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.platform_feature_details(_target uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF public.platform_role() NOT IN ('owner','admin') THEN RAISE EXCEPTION 'Platform access denied' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=_target) THEN RAISE EXCEPTION 'User not found'; END IF;
 RETURN (SELECT jsonb_agg(jsonb_build_object('id',f.id,'label',f.label,'category',f.category,'default_enabled',coalesce(b.enabled,f.default_enabled),
 'enabled',coalesce(o.enabled,b.enabled,f.default_enabled),'overridden',o.user_id IS NOT NULL,'changed_at',coalesce(o.changed_at,h.created_at),'changed_by',coalesce(o.changed_by,h.actor_id),
 'administrator',coalesce(u.raw_user_meta_data->>'full_name',u.email)) ORDER BY f.category,f.id)
 FROM public.platform_features f LEFT JOIN public.platform_feature_baselines b ON b.feature_id=f.id AND b.user_id=_target LEFT JOIN public.platform_feature_overrides o ON o.feature_id=f.id AND o.user_id=_target
 LEFT JOIN LATERAL (SELECT a.actor_id,a.created_at FROM public.platform_activity a WHERE a.subject_id=_target AND a.action='feature_permission_changed' AND a.changes->>'feature'=f.id ORDER BY a.created_at DESC,a.id DESC LIMIT 1) h ON true
 LEFT JOIN auth.users u ON u.id=coalesce(o.changed_by,h.actor_id));
END $$;
CREATE OR REPLACE FUNCTION public.platform_save_features(_target uuid,_values jsonb,_reset boolean DEFAULT false) RETURNS void
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
  updated:=CASE WHEN _reset THEN coalesce((SELECT enabled FROM public.platform_feature_baselines WHERE user_id=_target AND feature_id=item.id),item.default_enabled) ELSE (_values->>item.id)::boolean END;
  IF _reset THEN DELETE FROM public.platform_feature_overrides WHERE user_id=_target AND feature_id=item.id;
  ELSE INSERT INTO public.platform_feature_overrides(user_id,feature_id,enabled,changed_by) VALUES(_target,item.id,updated,auth.uid())
   ON CONFLICT(user_id,feature_id) DO UPDATE SET enabled=excluded.enabled,changed_by=excluded.changed_by,changed_at=now(); END IF;
  INSERT INTO public.platform_activity(actor_id,subject_id,action,changes) VALUES(auth.uid(),_target,'feature_permission_changed',jsonb_build_object('feature',item.id,'previous',previous,'updated',updated,'reset',_reset));
 END LOOP;
END $$;

COMMIT;
