# Phase 5 — Global application settings

## Deployment

Apply [0018_global_application_settings.sql](drizzle/migrations/0018_global_application_settings.sql) once in the Supabase SQL editor, after migrations 0014–0017. Deploy the frontend after the migration. This migration has **not** been applied to the connected database by this task.

No new OAuth credentials, service-role frontend keys, Edge Function configuration or PWA worker registration are needed. Keep the existing invitation function configuration. Sign in as the existing Platform Owner and select **Admin → Application Settings**.

All initial settings preserve current behavior: creation and registration enabled, maintenance off, features enabled, limits unlimited. Existing accounts receive a one-time feature baseline matching their previous defaults; overrides remain untouched. No cricket records or totals are rewritten.

## Supported controls

- Platform controls: maintenance, maintenance message, registrations, tournament creation and quick-match creation.
- Global features: the same 12 supported Phase 4 features. No imaginary advanced-statistics feature or duplicate celebration switch.
- New user permissions: separate registration defaults. A typed-confirmation bulk operation can replace all existing account baselines and overrides; its preview shows the account count and saved defaults.
- Limits: tournaments per creator, independent matches per creator, teams per tournament, players per team, matches per tournament. Empty means unlimited; zero prevents additions. Counts include retained historical/soft-deleted records. Existing over-limit squads can be edited without growing, or reduced.
- Announcements: draft, publish/unpublish, schedule, expire, edit and delete. Plain text, with optional dismissal for the current page session. Categories include information, important, feature, maintenance and warning. No HTML is interpreted.
- Presentation defaults: TV theme, animation enabled, manual sound enabled, celebration enabled/style/duration, honors duration and award categories. Existing group/playoff/final celebration designs remain stage-aware.

## Maintenance and offline behavior

Maintenance is deliberately **drain-only**: it snapshots matches that are live, paused or between innings. Those matches can complete their scoring transactions, including the final audit operation. Scheduled matches cannot start and other cricket-data writes pause. The admin workspace and authentication remain reachable. Existing public match/TV screens remain readable; ordinary navigation shows the maintenance page.

The scorer stays mounted to preserve pending queues. New operations are stopped when the connected client knows the match is restricted; the server checks all writes again on replay. Already queued operations remain on the device, with the server rejection surfaced by the existing synchronization UI. They can retry after maintenance ends. A disconnected device cannot receive a new restriction immediately. Never clear its queue to resolve maintenance.

Registration closure also closes invitations that create new accounts. It does not change existing auth users or prohibit their sign-in. Maintenance also pauses new registrations. Supabase may surface its generic auth database error when the registration trigger rejects a signup; operational control remains enforced server-side.

## Security and consistency

- Private settings, feature baselines, announcements and maintenance bookkeeping use RLS with no direct browser table privileges.
- Owner-only, security-definer mutation RPCs validate every request and use an empty search path. Other platform admins have read-only settings access. Public reads expose effective non-sensitive configuration and currently published announcements only.
- The existing Phase 4 permission resolver now evaluates global enablement AND individual override/account baseline. Re-enabling a feature restores the previous personal choice.
- Changing registration defaults never rewrites existing baselines. Individual reset returns the account's assigned baseline. The separate bulk reset is explicitly destructive to permission overrides, not cricket data, and logs before/after permissions for each account.
- Settings changes use optimistic revision checks to reject stale editors; writes and creation checks share the existing administrative transaction lock. Limits also cover fixture batches and direct API inserts. A failed fixture batch rolls back atomically.
- Existing verified admin tournament mutation contexts retain their administrative recovery/transfer capabilities. Ordinary User Mode receives no new role bypass.
- Changes are logged in the existing `platform_activity` table with actor, time, old/new values and optional reason. Announcement edits are atomic; simultaneous announcement editors currently use last-save-wins rather than revision conflicts.
- Connected configuration/feature clients poll every 5 seconds; announcements every 15 seconds, with reconnection/focus refresh. This uses the existing polling architecture, not a new realtime publication. Backend restrictions apply immediately, independent of the polling interval.
- Device configuration remains authoritative for preferences. Global defaults are in-memory fallbacks and never overwrite local storage or uploaded audio. This does not invent a tournament/match preference hierarchy that the application does not have.
- Future plans can extend the centralized limit resolver and account baselines. No billing system or plan-specific limits are implemented in Phase 5.

## Main implementation

- [Migration](drizzle/migrations/0018_global_application_settings.sql): settings registry, authorization, audit, defaults, limits, maintenance and announcement RPCs.
- [Admin settings interface](src/components/platform-settings.tsx): category navigation, staged changes, impact confirmation, reset/discard, announcements and bulk defaults.
- [Client configuration](src/components/platform-configuration.tsx): maintenance routing, ordinary-page announcements and refresh.
- [Shared client settings](src/lib/global-settings.ts): types, queries and in-memory preference fallbacks.
- [Presentation preferences](src/lib/presentation-settings.ts), [animation preferences](src/lib/cricket/tv-settings.ts), [audio](src/components/cricket/match-audio.tsx), [TV display](src/routes/display.$matchId.tsx), [device settings](src/routes/settings.tsx): retain explicit device preferences.
- [Scoring](src/lib/cricket/use-scoring.ts): reject known maintenance operations without discarding pending work.

## Verification and rollout checks

Automated coverage includes backend owner/admin/user denial, direct-table denial, global/personal permission hierarchy, restored access, unchanged existing defaults, new-account defaults, registration closure, creation restrictions, existing-record preservation, limits, live-match completion during maintenance, scheduled-match rejection, stale settings, announcement scheduling/expiry and bulk permission reset. UI tests verify staged saves, impact confirmation, read-only admins, discard and typed bulk confirmation. Existing offline, sound and animation tests cover preference and queue preservation.

Responsive layout was checked with the actual settings component and isolated preview data at 375, 768 and 1440 pixels: no horizontal overflow. The connected browser is signed out, so a real owner session and deployed auth signup flow still require manual verification after applying the migration. No production tournament was modified for testing.

Before enabling restrictions in production, use a dedicated test tournament: start a match, enable maintenance, finish that match, confirm a scheduled match cannot start, disable maintenance and retry a preserved queued operation. Check a second browser receives settings updates. Confirm the deployed owner can change settings and an admin can only read them. Test your Google and email signup error messages with registrations closed and reopen immediately afterward.

Verified locally: 290 existing application tests passed; 5 new Phase 5 tests passed in targeted runs; 21 PostgreSQL/PGlite integration tests passed. TypeScript checking and the production/PWA build passed. The database tests use disposable local data, not the connected Supabase project.
