# Phase 2: User Management and local Google sign-in

## Deploy in this order
1. Apply `drizzle/migrations/0015_platform_user_management.sql` in Supabase SQL Editor **after 0014**. Run it once, preferably inside `BEGIN;` / `COMMIT;` so errors roll back the migration. It adds private account-control/invitation tables, RPCs, write guards and audit fields. It does not delete accounts, tournaments or deliveries.
2. Deploy the `supabase/functions/platform-invite` Edge Function to the **existing** Supabase project:
   ```sh
   supabase functions deploy platform-invite
   ```
3. Configure Edge Function secrets (never VITE variables):
   - `CREASE_APP_URL`: production application origin, without trailing slash.
   - `CREASE_ALLOWED_ORIGINS`: comma-separated production origin plus local origins that may invoke invitations, e.g. `https://your-app.example,http://127.0.0.1:8081`.
   Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in the Edge Function environment. Keep all service keys server-side.
4. Add `https://your-app.example/accept-invite` to Auth redirect URLs. Invitations always use the configured application URL, never a client-provided redirect. Keep the existing production Site URL. Configure the Supabase invitation email template and an appropriate SMTP service/delivery limits. Confirm that the template uses the standard confirmation URL.
5. Deploy the application. Authenticated routes now verify `account_access`; apply the migration before deploying the frontend. Without the migration they fail closed with a retry screen. No database migrations or Edge Function deployments were performed by this implementation.

## Local Google authentication
The exact cause was a hostname check in `src/lib/google-auth.ts` that returned an error before attempting OAuth on localhost, 127.0.0.1 and IPv6 loopback. Loopback now uses real Supabase Google OAuth against the unchanged project. Vercel retains its existing direct Supabase flow; Lovable-hosted applications retain their existing Lovable broker.

- Allow the **exact** return URL `http://127.0.0.1:8081/dashboard`. Add `http://localhost:8081/dashboard` only if you also use that hostname. An allowlisted site root alone does not necessarily cover `/dashboard`.
- Do not replace the production Site URL with localhost.
- The project's public Auth settings were checked and returned `external.google = true`.
- If Google reports `redirect_uri_mismatch`, its OAuth client's authorised redirect URI must match the existing backend's `/auth/v1/callback`, not the local application dashboard. Keep production callback entries.
- No Google secrets, service keys, account replacement, frontend owner-email comparisons or authentication bypass are introduced. Login page design is unchanged.
- A real Google consent/login round trip still needs to be completed in your browser. Unit tests verify all loopback hosts, port preservation, Vercel and Lovable paths.

References: [Supabase redirects](https://supabase.com/docs/guides/auth/redirect-urls), [Google provider configuration](https://supabase.com/docs/guides/auth/social-login/auth-google), [invitation API](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail).

## Permission model
- Only current, unrestricted platform owners/admins may list accounts or fetch private details.
- Owners can manage regular users and other admins; only owners can grant/revoke admin roles. No actor can manage their own account or the Platform Owner.
- Admins can view/manage regular users and view their own account. Other admins' private directory records are hidden from admins. Aggregate summary counts are platform-wide.
- Registered users and anonymous requests cannot invoke management RPCs. All mutation decisions are rechecked server-side after locking, regardless of visible UI controls.
- Normal scorer/tournament permission helpers now also require an active account. Restrictive RLS write policies cover existing public tables and Storage objects. A row trigger guards public writes even through security-definer RPCs. Public tournament reads remain available.
- Bans are written to Auth's `banned_until` and checked on every protected request; already-issued access tokens cannot bypass database restrictions. The gate rechecks active browser sessions every five seconds. Existing offline queues are preserved and cannot sync while restricted.
- Every management change, reason, actor, target and before/after state is recorded transactionally. Profile editing changes name/avatar only; login emails require the account holder's verified auth process.
- New public write tables added in future migrations must include equivalent account guards.

## Deletion and recovery
"Delete account" is recoverable deactivation with an email-typed confirmation and required reason. No Auth account or cricket data is physically deleted. Restore account lifts deactivation and the ban. Permanent deletion is deliberately unavailable; ownership/history must be resolved before a later feature could offer it. Unblock is not allowed to silently restore a deactivated account.

## Invitation consistency
The browser calls the Edge Function with its real user token. The function validates the user, reserves the email through an authorised RPC, then calls Supabase Auth using the server-only credential. A unique email reservation prevents duplicates and retry double-sends; a request ID makes repeated requests safe. The invitation trigger handles both initial insertion and the later Auth `invited_at` update, assigning the requested role and audit record in the Auth transaction. User metadata alone cannot grant a role. Inviter authority is checked again at this point. Twenty invitation requests per actor per hour are allowed.

On uncertain network outcomes the function retains the reservation and does not automatically resend. Confirm the directory, Auth users and email delivery logs before retrying. If a pending reservation has no associated Auth user and delivery has definitively failed, a trusted database operator can mark that specific reservation failed; the next request can then reserve the address again. Do not bulk-reset pending reservations. A created account is never automatically deleted to compensate for email delivery failures.

## UI and data
The existing Admin User Management placeholder is replaced with a 20-row server-paginated directory, debounced search, role/status filters, date/name sorting, desktop table/mobile cards, details/history panel, secure invitation form and confirmed account actions. Light/dark styles reuse existing semantic tokens. The normal User Mode layout remains unchanged; only restricted accounts see the access notice.

Details show the latest 100 owned tournaments and latest 50 administrative actions, with limits labelled. Active accounts excludes deactivated, banned and unaccepted invited accounts; new registrations cover 30 days. Future feature permissions are informational only.

## Deployment acceptance
After migration/function deployment, verify real invitation delivery and password setup, owner promotion/revocation, admin restrictions, blocked existing sessions and offline queue replay, recovery without losing matches, and the local Google round trip. These remote integration checks cannot be replaced by mocked API tests.

## Modified implementation areas
- [User directory and dialogs](src/components/platform-users.tsx), [client API and action visibility](src/lib/platform-users.ts), [Admin workspace integration](src/components/platform-admin.tsx).
- [Account access gate](src/components/account-access-gate.tsx), [protected route integration](src/routes/_authenticated/route.tsx), [invitation acceptance](src/routes/accept-invite.tsx).
- [Edge Function](supabase/functions/platform-invite/index.ts), [tested request handler](supabase/functions/platform-invite/handler.ts).
- [Database migration](drizzle/migrations/0015_platform_user_management.sql), migration journal, RPC types and generated route tree.
- [Google OAuth helper](src/lib/google-auth.ts), Google auth regression tests, [PWA navigation rules](vite.config.ts).
- Database and component tests cover hierarchy, confirmations, restrictions, duplicates, revocation, audit data, preserved history and failed/uncertain invitation operations. The existing toss test's tournament-branding mock was updated without changing scorer behavior.

## Completed validation
- Full regression run: 270/270 tests across 47 files passed.
- Additional account-access gate suite: 3/3 passed (unchanged normal UI, blocked existing session, fail-closed errors).
- Database integration: 18/18 passed, including existing scoring/fixture/playoff/honours tests.
- TypeScript and production build passed.
- Browser: local Google button at `http://127.0.0.1:8081/auth` reached Google's real sign-in page using the existing Supabase callback and the local dashboard return URL. No credentials were entered. Anonymous `/admin` access was denied.
- Browser layout fixture: 375px, 768px and 1440px widths had no directory horizontal overflow; mobile cards and desktop table switched correctly. Temporary fixture UI was removed without changing any records.
- Live invitation delivery, signed-in remote management and the final Google return remain pending user sign-in and deployment configuration.
