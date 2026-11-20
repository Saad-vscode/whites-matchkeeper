# Platform administration — Phase 1

## Install
Apply `drizzle/migrations/0014_platform_administration.sql` in the Supabase SQL editor as the database administrator, after migrations 0000–0013. No remote migration is applied by the app.

The migration resolves `saadbishry94@gmail.com` to its existing **confirmed auth.users UUID** and assigns the owner role. If the account does not exist, is unverified or banned, it prints a notice and grants nothing. After resolving that condition, run the following in the SQL editor:

```sql
DO $$
DECLARE owner_id uuid;
BEGIN
  SELECT id INTO STRICT owner_id FROM auth.users
  WHERE lower(email) = 'saadbishry94@gmail.com'
    AND email_confirmed_at IS NOT NULL
    AND (banned_until IS NULL OR banned_until <= now());
  INSERT INTO public.platform_roles(user_id, role)
  VALUES (owner_id, 'owner')
  ON CONFLICT (user_id) DO UPDATE SET role = 'owner';
END $$;
```

Refresh after applying. The User/Admin switch appears below Crease in the existing header. The application has no user sidebar; no new user sidebar is introduced. Admin Mode has its own responsive sidebar. Login continues to land in User Mode. The route is the mode state: refreshing `/admin` retains Admin Mode without persisting authority or changing the login destination. The User switch returns to the existing dashboard.

## Security
- Platform roles are separate from legacy `user_roles`; no existing scorer/tournament RLS helpers are changed.
- Role table: users may read only their own row. No authenticated browser can insert, change or delete roles.
- Overview RPC verifies the authenticated user's current role, including ban state, on every call. Anonymous access is revoked. It returns bounded recent lists and aggregate counts, not unrestricted auth access.
- Security-definer functions use a fixed empty search path and qualified relations.
- Owner triggers prevent deletion, bans and role demotion, including accidental privileged SQL. Owner changes require deliberate database-maintainer intervention; there is no web operation to bypass them.
- Role mutations generate append-only administrative activity. Browsers have no direct audit-table privileges.
- No management operations are enabled yet. Future operations must use individually authorised RPCs, protect owners, and write audits in the same transaction. Never expand normal scoring RLS based on platform role.
- Admin queries are memory-only and removed after leaving the workspace. Sign out clears existing query cache. Admin navigation uses NetworkOnly; existing scoring NetworkFirst behavior is unchanged.

## Metric definitions
Active users: non-banned users whose last sign-in is within 30 days (not a presence indicator). Blocked: Supabase ban expiration is in the future. Completed tournament: a unique completed bracket final, or an explicitly classified manual Final when there is no bracket final. Active: at least one live/paused/innings-break/completed fixture and no completed bracket final. Tournaments without fixtures are included only in total. Ambiguous or unclassified finals are not guessed. Admin count includes owners. No cricket totals are stored or recalculated by these queries.

## Verification
Run `npm run test:fixtures:db`, `npx tsc --noEmit`, and `npm run build`.
For deployment acceptance, verify signed-out and ordinary accounts cannot call `platform_overview`; verified owner can open both modes; refresh retains the admin route; logout/login lands in User Mode; inspect mobile and collapsed navigation; verify existing scoring and TV in the deployed environment. Actual owner access requires applying the migration to that environment.

## Results from this implementation
- Database integration suite: 16/16 pass, including unauthorized and anonymous API access, role self-assignment, owner protection, audit forgery, ban/revocation checks and platform/scoring permission separation.
- Admin UI tests: 2/2 pass (ordinary user access denial; owner/admin navigation, placeholders and collapse control).
- Full Vitest suite: 252 passed, 4 failed. Existing toss-setup tests lack the tournament-branding query-client mock (3 failures); the Google local-preview test expects older error copy (1 failure). These unrelated implementation paths were not changed.
- TypeScript check and production build passed.
- Live Supabase owner bootstrap and signed-in browser checks remain deployment verification steps; no remote database changes were made.
