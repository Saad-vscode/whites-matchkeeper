-- Platform authority is independent of legacy user_roles and tournament permissions.
CREATE TABLE public.platform_roles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_roles ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.platform_roles TO authenticated;
GRANT ALL ON public.platform_roles TO service_role;
CREATE POLICY "read own platform role" ON public.platform_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE FUNCTION public.platform_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((SELECT r.role FROM public.platform_roles r JOIN auth.users u ON u.id = r.user_id
    WHERE r.user_id = auth.uid() AND (u.banned_until IS NULL OR u.banned_until <= now())), 'user')
$$;
REVOKE ALL ON FUNCTION public.platform_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_role() TO authenticated;

CREATE FUNCTION public.protect_platform_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_TABLE_NAME = 'platform_roles' THEN
    IF OLD.role = 'owner' THEN
      IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Platform owner cannot be removed'; END IF;
      IF NEW.role <> 'owner' OR NEW.user_id <> OLD.user_id THEN RAISE EXCEPTION 'Platform owner cannot be demoted'; END IF;
    END IF;
  ELSIF EXISTS (SELECT 1 FROM public.platform_roles WHERE user_id = OLD.id AND role = 'owner') THEN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Platform owner cannot be deleted'; END IF;
    IF NEW.banned_until > now() THEN RAISE EXCEPTION 'Platform owner cannot be blocked'; END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.protect_platform_owner() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER protect_platform_role BEFORE UPDATE OR DELETE ON public.platform_roles FOR EACH ROW EXECUTE FUNCTION public.protect_platform_owner();
CREATE TRIGGER protect_platform_owner_account BEFORE UPDATE OR DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION public.protect_platform_owner();

CREATE TABLE public.platform_activity (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid,
  subject_id uuid,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_activity ENABLE ROW LEVEL SECURITY;
-- Read through the checked overview RPC only; no browser can forge audit entries.
CREATE FUNCTION public.audit_platform_role() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.platform_activity(actor_id, subject_id, action)
  VALUES (auth.uid(), coalesce(NEW.user_id, OLD.user_id), 'platform_role_' || lower(TG_OP));
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.audit_platform_role() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER audit_platform_role AFTER INSERT OR UPDATE OR DELETE ON public.platform_roles FOR EACH ROW EXECUTE FUNCTION public.audit_platform_role();

CREATE FUNCTION public.platform_overview() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  IF public.platform_role() NOT IN ('owner', 'admin') THEN RAISE EXCEPTION 'Platform access denied' USING ERRCODE = '42501'; END IF;
  WITH tournament_state AS (
    SELECT t.*, coalesce((SELECT bool_and(m.status='completed') FROM public.matches m WHERE m.tournament_id=t.id AND m.status <> 'cancelled'
      AND (m.rules->>'playoffNode'='final' OR (
        lower(trim(m.rules->'tournamentStage'->>'title'))='final'
        AND NOT EXISTS (SELECT 1 FROM public.matches b WHERE b.tournament_id=t.id AND b.status <> 'cancelled' AND b.rules->>'playoffNode'='final')
      )) HAVING count(*)=1), false) AS completed
    FROM public.tournaments t
  ) SELECT jsonb_build_object(
    'users', (SELECT count(*) FROM auth.users),
    'activeUsers', (SELECT count(*) FROM auth.users WHERE last_sign_in_at >= now()-interval '30 days' AND (banned_until IS NULL OR banned_until<=now())),
    'blockedUsers', (SELECT count(*) FROM auth.users WHERE banned_until>now()),
    'tournaments', (SELECT count(*) FROM tournament_state),
    'activeTournaments', (SELECT count(*) FROM tournament_state t WHERE NOT completed AND EXISTS (SELECT 1 FROM public.matches m WHERE m.tournament_id=t.id AND m.status IN ('live','paused','innings_break','completed'))),
    'completedTournaments', (SELECT count(*) FROM tournament_state WHERE completed),
    'liveMatches', (SELECT count(*) FROM public.matches WHERE status='live'),
    'admins', (SELECT count(*) FROM public.platform_roles),
    'registrations', (SELECT coalesce(jsonb_agg(x), '[]') FROM (SELECT id, email, created_at FROM auth.users ORDER BY created_at DESC LIMIT 5) x),
    'recentTournaments', (SELECT coalesce(jsonb_agg(x), '[]') FROM (SELECT id, name, created_at FROM public.tournaments ORDER BY created_at DESC LIMIT 5) x),
    'activity', (SELECT coalesce(jsonb_agg(x), '[]') FROM (SELECT action, created_at FROM public.platform_activity ORDER BY id DESC LIMIT 5) x),
    'generatedAt', now()
  ) INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.platform_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_overview() TO authenticated;

-- One-time, verified backend identity lookup. No client email-based authority.
DO $$
DECLARE owner_id uuid;
BEGIN
  SELECT id INTO owner_id FROM auth.users WHERE lower(email)='saadbishry94@gmail.com'
    AND email_confirmed_at IS NOT NULL AND (banned_until IS NULL OR banned_until<=now());
  IF owner_id IS NULL THEN
    RAISE NOTICE 'Initial owner account absent or unverified. Complete the documented bootstrap after verification.';
  ELSE
    INSERT INTO public.platform_roles(user_id, role) VALUES(owner_id, 'owner');
  END IF;
END $$;
