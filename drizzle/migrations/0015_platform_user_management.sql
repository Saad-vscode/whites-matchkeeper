-- Phase 2: private account controls, transactional management and invitation outbox.
ALTER TABLE public.platform_activity ADD COLUMN reason text, ADD COLUMN changes jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX platform_activity_subject_time ON public.platform_activity(subject_id, created_at DESC);
CREATE INDEX platform_activity_actor_time ON public.platform_activity(actor_id, action, created_at DESC);
CREATE INDEX IF NOT EXISTS tournaments_created_by_platform_idx ON public.tournaments(created_by);
CREATE TABLE public.platform_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  deactivated_at timestamptz,
  reason text,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_accounts FROM anon, authenticated;
CREATE TABLE public.platform_invitations (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  full_name text NOT NULL,
  requested_role text NOT NULL CHECK(requested_role IN ('user','admin')),
  actor_id uuid NOT NULL,
  user_id uuid,
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','created','sent','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_invitations FROM anon, authenticated;

CREATE FUNCTION public.platform_account_active(_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=_id
   AND (u.banned_until IS NULL OR u.banned_until<=now())
   AND NOT EXISTS(SELECT 1 FROM public.platform_accounts a WHERE a.user_id=u.id AND a.deactivated_at IS NOT NULL))
$$;
REVOKE ALL ON FUNCTION public.platform_account_active(uuid) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.account_access() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT public.platform_account_active(auth.uid()) $$;
REVOKE ALL ON FUNCTION public.account_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.account_access() TO authenticated;
CREATE OR REPLACE FUNCTION public.platform_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce((SELECT role FROM public.platform_roles WHERE user_id=auth.uid() AND public.platform_account_active(user_id)),'user')
$$;
-- All existing scoring/ownership RPCs already call these helpers.
CREATE OR REPLACE FUNCTION public.is_match_owner(_match uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.account_access() AND (EXISTS(SELECT 1 FROM public.matches WHERE id=_match AND created_by=auth.uid()) OR public.has_role(auth.uid(),'admin'))
$$;
CREATE OR REPLACE FUNCTION public.can_score(_match uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.account_access() AND (public.is_match_owner(_match) OR EXISTS(SELECT 1 FROM public.match_scorers WHERE match_id=_match AND user_id=auth.uid()))
$$;
CREATE OR REPLACE FUNCTION public.is_tournament_owner(_t uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.account_access() AND (EXISTS(SELECT 1 FROM public.tournaments WHERE id=_t AND created_by=auth.uid()) OR public.has_role(auth.uid(),'admin'))
$$;
-- Also cover direct inserts and security-definer mutations, not just RLS.
-- The shared account lock serializes in-flight writes against a block/deactivation.
CREATE FUNCTION public.require_active_writer() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE banned timestamptz;
BEGIN
 IF auth.uid() IS NOT NULL THEN
   SELECT banned_until INTO banned FROM auth.users WHERE id=auth.uid() FOR SHARE;
   IF NOT FOUND OR banned>now() OR NOT public.account_access() THEN RAISE EXCEPTION 'ACCOUNT_RESTRICTED: This account is blocked or deactivated' USING ERRCODE='42501'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.require_active_writer() FROM PUBLIC, anon, authenticated;
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
   EXECUTE format('CREATE TRIGGER account_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.require_active_writer()',t.tablename);
   EXECUTE format('CREATE POLICY account_insert_guard ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.account_access())',t.tablename);
   EXECUTE format('CREATE POLICY account_update_guard ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.account_access()) WITH CHECK(public.account_access())',t.tablename);
   EXECUTE format('CREATE POLICY account_delete_guard ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING(public.account_access())',t.tablename);
 END LOOP;
 -- Storage is optional in the embedded database tests, present in deployed Supabase.
 IF to_regclass('storage.objects') IS NOT NULL THEN
   EXECUTE 'CREATE POLICY account_storage_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.account_access())';
   EXECUTE 'CREATE POLICY account_storage_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.account_access()) WITH CHECK(public.account_access())';
   EXECUTE 'CREATE POLICY account_storage_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING(public.account_access())';
 END IF;
END $$;

CREATE FUNCTION public.platform_user_directory(_search text DEFAULT '', _role text DEFAULT 'all', _status text DEFAULT 'all', _sort text DEFAULT 'newest', _page integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF public.platform_role() NOT IN ('owner','admin') THEN RAISE EXCEPTION 'Platform access denied' USING ERRCODE='42501'; END IF;
 IF _page<0 OR _page>100000 OR length(_search)>200 OR _role NOT IN('all','user','admin','owner') OR _status NOT IN('all','active','blocked','deactivated','invited') OR _sort NOT IN('newest','oldest','name') THEN RAISE EXCEPTION 'Invalid directory filters'; END IF;
 WITH accounts AS (
   SELECT u.id, u.email, coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.raw_user_meta_data->>'name','') AS full_name,
     u.raw_user_meta_data->>'avatar_url' AS avatar_url, coalesce(r.role,'user') AS role,
     CASE WHEN a.deactivated_at IS NOT NULL THEN 'deactivated' WHEN u.banned_until>now() THEN 'blocked'
       WHEN u.invited_at IS NOT NULL AND u.last_sign_in_at IS NULL THEN 'invited' ELSE 'active' END AS status,
     u.created_at, u.last_sign_in_at,
     (SELECT count(*) FROM public.tournaments t WHERE t.created_by=u.id) AS tournaments
   FROM auth.users u LEFT JOIN public.platform_roles r ON r.user_id=u.id LEFT JOIN public.platform_accounts a ON a.user_id=u.id
 ), filtered AS (
   SELECT * FROM accounts WHERE (public.platform_role()='owner' OR role='user' OR id=auth.uid())
     AND (_search='' OR strpos(lower(email),lower(trim(_search)))>0 OR strpos(lower(full_name),lower(trim(_search)))>0)
     AND (_role='all' OR role=_role) AND (_status='all' OR status=_status)
 ), page AS (
   SELECT * FROM filtered ORDER BY
     CASE WHEN _sort='name' THEN lower(full_name) END ASC,
     CASE WHEN _sort='oldest' THEN created_at END ASC,
     CASE WHEN _sort='newest' THEN created_at END DESC, id
   LIMIT 20 OFFSET (_page*20)
 ) SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(page) FROM page),'[]'), 'total',(SELECT count(*) FROM filtered),
   'summary',jsonb_build_object('total',(SELECT count(*) FROM accounts),'active',(SELECT count(*) FROM accounts WHERE status='active'),
     'blocked',(SELECT count(*) FROM accounts WHERE status='blocked'),'admins',(SELECT count(*) FROM accounts WHERE role IN('owner','admin')),
     'new',(SELECT count(*) FROM accounts WHERE created_at>=now()-interval '30 days'))) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.platform_user_directory(text,text,text,text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_user_directory(text,text,text,text,integer) TO authenticated;

CREATE FUNCTION public.platform_user_details(_target uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF public.platform_role() NOT IN('owner','admin') OR (public.platform_role()<>'owner' AND _target<>auth.uid() AND EXISTS(SELECT 1 FROM public.platform_roles WHERE user_id=_target)) THEN RAISE EXCEPTION 'Platform access denied' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('reason',(SELECT reason FROM public.platform_accounts WHERE user_id=_target),
   'tournaments',coalesce((SELECT jsonb_agg(t) FROM (SELECT id,name,created_at FROM public.tournaments WHERE created_by=_target ORDER BY created_at DESC LIMIT 100) t),'[]'),
   'history',coalesce((SELECT jsonb_agg(h) FROM (SELECT actor_id, action,reason,changes,created_at FROM public.platform_activity WHERE subject_id=_target ORDER BY id DESC LIMIT 50) h),'[]'));
END $$;
REVOKE ALL ON FUNCTION public.platform_user_details(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_user_details(uuid) TO authenticated;

CREATE FUNCTION public.platform_manage_user(_target uuid,_action text,_name text DEFAULT NULL,_avatar text DEFAULT NULL,_reason text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor_role text; target_role text; old_name text; old_avatar text; old_status jsonb; new_status jsonb;
BEGIN
 -- Serialize role actions with invitation processing; resolve current authority after locking.
 PERFORM pg_advisory_xact_lock(141414);
 PERFORM 1 FROM auth.users WHERE id IN(auth.uid(),_target) ORDER BY id FOR UPDATE;
 actor_role:=public.platform_role();
 SELECT coalesce((SELECT role FROM public.platform_roles WHERE user_id=_target),'user') INTO target_role;
 IF actor_role NOT IN('owner','admin') OR _target=auth.uid() OR target_role='owner' OR (actor_role='admin' AND target_role<>'user') THEN RAISE EXCEPTION 'Platform access denied' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=_target) THEN RAISE EXCEPTION 'Account not found'; END IF;
 IF _action NOT IN('edit','grant_admin','revoke_admin','block','unblock','deactivate','restore') THEN RAISE EXCEPTION 'Invalid user action'; END IF;
 IF length(coalesce(_reason,''))>1000 THEN RAISE EXCEPTION 'Reason is too long'; END IF;
 SELECT jsonb_build_object('role',target_role,'banned_until',u.banned_until,'deactivated_at',a.deactivated_at) INTO old_status
 FROM auth.users u LEFT JOIN public.platform_accounts a ON a.user_id=u.id WHERE u.id=_target;
 IF _action='edit' THEN
   IF _name IS NULL OR length(trim(_name)) NOT BETWEEN 1 AND 100 OR length(coalesce(_avatar,''))>2000 OR (coalesce(_avatar,'')<>'' AND _avatar !~ '^https://') THEN RAISE EXCEPTION 'Enter a name and a valid HTTPS avatar URL'; END IF;
   SELECT raw_user_meta_data->>'full_name',raw_user_meta_data->>'avatar_url' INTO old_name,old_avatar FROM auth.users WHERE id=_target;
   UPDATE auth.users SET raw_user_meta_data=coalesce(raw_user_meta_data,'{}')||jsonb_build_object('full_name',trim(_name),'avatar_url',nullif(_avatar,'')) WHERE id=_target;
   old_status:=old_status||jsonb_build_object('full_name',old_name,'avatar_url',old_avatar);
 ELSIF _action IN('grant_admin','revoke_admin') THEN
   IF actor_role<>'owner' THEN RAISE EXCEPTION 'Only the Platform Owner can change admin access' USING ERRCODE='42501'; END IF;
   IF _action='grant_admin' THEN
     IF NOT public.platform_account_active(_target) OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=_target AND email_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'Confirm and activate this account before granting access'; END IF;
     INSERT INTO public.platform_roles(user_id,role) VALUES(_target,'admin') ON CONFLICT(user_id) DO NOTHING;
   ELSE DELETE FROM public.platform_roles WHERE user_id=_target AND role='admin'; END IF;
 ELSE
   IF _action IN('block','deactivate') AND length(trim(coalesce(_reason,'')))=0 THEN RAISE EXCEPTION 'A reason is required'; END IF;
   IF _action='unblock' AND EXISTS(SELECT 1 FROM public.platform_accounts WHERE user_id=_target AND deactivated_at IS NOT NULL) THEN RAISE EXCEPTION 'Restore this deactivated account first'; END IF;
   INSERT INTO public.platform_accounts(user_id,reason,changed_by,deactivated_at)
   VALUES(_target,nullif(trim(_reason),''),auth.uid(),CASE WHEN _action='deactivate' THEN now() ELSE NULL END)
   ON CONFLICT(user_id) DO UPDATE SET reason=excluded.reason,changed_by=excluded.changed_by,changed_at=now(),
     deactivated_at=CASE WHEN _action='deactivate' THEN now() WHEN _action='restore' THEN NULL ELSE platform_accounts.deactivated_at END;
   UPDATE auth.users SET banned_until=CASE WHEN _action IN('block','deactivate') THEN now()+interval '100 years' ELSE NULL END WHERE id=_target;
 END IF;
 SELECT jsonb_build_object('role',coalesce(r.role,'user'),'banned_until',u.banned_until,'deactivated_at',a.deactivated_at,'full_name',u.raw_user_meta_data->>'full_name','avatar_url',u.raw_user_meta_data->>'avatar_url') INTO new_status
 FROM auth.users u LEFT JOIN public.platform_roles r ON r.user_id=u.id LEFT JOIN public.platform_accounts a ON a.user_id=u.id WHERE u.id=_target;
 INSERT INTO public.platform_activity(actor_id,subject_id,action,reason,changes) VALUES(auth.uid(),_target,'user_'||_action,nullif(trim(_reason),''),jsonb_build_object('before',old_status,'after',new_status));
END $$;
REVOKE ALL ON FUNCTION public.platform_manage_user(uuid,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_manage_user(uuid,text,text,text,text) TO authenticated;

-- Reserve before sending mail. Concurrent requests cannot create duplicate invitations.
CREATE FUNCTION public.platform_reserve_invitation(_id uuid,_email text,_name text,_role text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.platform_invitations; actor_role text;
BEGIN
 PERFORM pg_advisory_xact_lock(141414);
 actor_role:=public.platform_role();
 IF actor_role NOT IN('owner','admin') OR _role NOT IN('user','admin') OR (actor_role<>'owner' AND _role<>'user') THEN RAISE EXCEPTION 'Platform access denied' USING ERRCODE='42501'; END IF;
 IF _id IS NULL OR length(trim(_name)) NOT BETWEEN 1 AND 100 OR length(_email)>254 OR _email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Invalid invitation'; END IF;
 SELECT * INTO r FROM public.platform_invitations WHERE id=_id;
 IF FOUND THEN RETURN jsonb_build_object('state',r.state,'send',false); END IF;
 IF (SELECT count(*) FROM public.platform_activity WHERE actor_id=auth.uid() AND action='invitation_requested' AND created_at>now()-interval '1 hour')>=20 THEN RAISE EXCEPTION 'Invitation limit reached. Try again in an hour.'; END IF;
 IF EXISTS(SELECT 1 FROM auth.users WHERE lower(email)=lower(trim(_email))) THEN RAISE EXCEPTION 'An account with this email already exists'; END IF;
 IF EXISTS(SELECT 1 FROM public.platform_invitations WHERE email=lower(trim(_email)) AND state<>'failed') THEN RAISE EXCEPTION 'An invitation already exists; check delivery before retrying'; END IF;
 DELETE FROM public.platform_invitations WHERE email=lower(trim(_email)) AND state='failed' AND user_id IS NULL;
 INSERT INTO public.platform_invitations(id,email,full_name,requested_role,actor_id) VALUES(_id,lower(trim(_email)),trim(_name),_role,auth.uid());
 INSERT INTO public.platform_activity(actor_id,action,changes) VALUES(auth.uid(),'invitation_requested',jsonb_build_object('invitation',_id,'email',lower(trim(_email)),'role',_role));
 RETURN jsonb_build_object('state','pending','send',true);
END $$;
REVOKE ALL ON FUNCTION public.platform_reserve_invitation(uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_reserve_invitation(uuid,text,text,text) TO authenticated;

-- auth.invite creates the user and this trigger assigns its role in the same transaction.
-- invited_at is controlled by Auth, never by user_metadata supplied to signUp.
CREATE FUNCTION public.platform_accept_invited_account() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.platform_invitations; inviter_role text;
BEGIN
 IF NEW.invited_at IS NULL OR NEW.raw_user_meta_data->>'crease_invitation' IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND OLD.invited_at IS NOT NULL THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(141414);
 SELECT * INTO r FROM public.platform_invitations WHERE id::text=NEW.raw_user_meta_data->>'crease_invitation' AND email=lower(NEW.email) AND state='pending' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invitation is invalid or already used'; END IF;
 SELECT role INTO inviter_role FROM public.platform_roles WHERE user_id=r.actor_id;
 IF NOT public.platform_account_active(r.actor_id) OR inviter_role IS NULL OR (r.requested_role='admin' AND inviter_role<>'owner') THEN RAISE EXCEPTION 'Invitation authority has been revoked'; END IF;
 IF r.requested_role='admin' THEN INSERT INTO public.platform_roles(user_id,role) VALUES(NEW.id,'admin'); END IF;
 UPDATE public.platform_invitations SET user_id=NEW.id,state='created',updated_at=now() WHERE id=r.id;
 INSERT INTO public.platform_activity(actor_id,subject_id,action,changes) VALUES(r.actor_id,NEW.id,'user_invited',jsonb_build_object('role',r.requested_role,'invitation',r.id));
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.platform_accept_invited_account() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER platform_invited_account AFTER INSERT OR UPDATE OF invited_at ON auth.users FOR EACH ROW EXECUTE FUNCTION public.platform_accept_invited_account();
CREATE FUNCTION public.platform_finish_invitation(_id uuid,_sent boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE public.platform_invitations SET state=CASE WHEN _sent AND user_id IS NOT NULL THEN 'sent' WHEN user_id IS NOT NULL THEN 'created' ELSE 'failed' END,updated_at=now() WHERE id=_id;
END $$;
REVOKE ALL ON FUNCTION public.platform_finish_invitation(uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_finish_invitation(uuid,boolean) TO service_role;
