# Phase 4 — Individual feature controls

## Deployment

1. Apply [0017_individual_feature_controls.sql](drizzle/migrations/0017_individual_feature_controls.sql) once in the Supabase SQL editor, after migrations 0014–0016.
2. Deploy the updated frontend after the migration. Until the new RPC exists, protected feature checks fail closed; do not deploy the frontend first.
3. Sign in as the Platform Owner, open Admin → Feature Controls, and select an active account. The identical editor is also in User Management → user details.

No new OAuth configuration, Edge Function, service-role key, storage bucket, or payment service is required. This migration has not been applied to the remote project by the agent. Existing database connection and authentication are unchanged.

## Supported controls

All existing accounts default to enabled. Overrides are per account, reversible, and never overwrite saved browser preferences, uploaded local audio, deliveries, scores, or tournament settings.

| ID | Existing capability | Resolution |
| --- | --- | --- |
| `tv` | TV scoreboard route and scorer link | Tournament owner, otherwise quick-match creator |
| `boundaries` | Four, six, winning four/six animations | Same presentation owner |
| `wickets` | Wicket, run-out, duck, golden duck animations | Same presentation owner |
| `moments` | Three sixes, fifty, wides/no-balls, hat-trick moments, maiden | Same presentation owner |
| `celebrations` | Existing stage-aware match victory/congratulations screens | Same presentation owner |
| `honours` | Looping tournament honors presentation and its controls | Tournament owner |
| `appearance` | Existing TV color themes and scoreboard fonts | Same presentation owner |
| `sound` | Scorer device's manual horn/music | Signed-in scorer |
| `fixtures` | Smart fixture preview and generation | Tournament owner |
| `branding` | Editing tournament logo and colors | Tournament owner; current account for creation |
| `awards` | MVP/Player of the Tournament presentation and MoM publication | Same presentation owner |
| `offline` | Creating new scoring operations while disconnected | Signed-in scorer |

Basic scorecards, results, cricket rules, standings, ordinary statistics, app light/dark appearance, and manual fixtures are not premium controls. Existing stored tournament branding is preserved; the branding restriction prevents customization, rather than rewriting tournament identity. Admin inspection retains its authorized read-only statistics view.

The approved overlapping controls were combined. No switches were added for nonexistent “advanced customization,” subscriptions, global feature controls, or a new settings-inheritance system. Existing device-local preferences and stage-based presentation levels remain intact. Personal Settings uses the signed-in account's choices; public TV resolves the owner independently, so a scorer's personal restriction cannot switch off an authorized owner's broadcast.

## Backend security

- `platform_features` is the supported registry, and `platform_feature_overrides` stores explicit per-account changes. Both have RLS enabled and no browser table grants.
- `platform_save_features` checks the current active platform role on every request. Owners can manage active accounts, including admins. Admins can manage active registered users only, never owners or other admins. Unknown identifiers/non-boolean values are rejected.
- Permission changes and per-feature audit entries are one transaction, using the existing administration advisory lock. Audit records include actor, target, old/new permission, feature ID, timestamp, and reset intent. Last modifier information remains available after defaults are restored.
- `read_feature_access` exposes only effective booleans for the current account or an accessible match/tournament. It does not expose owners' private account details or allow arbitrary user-ID lookup.
- Security-definer helper functions have fixed empty search paths and restricted execution grants. The privileged fixture context implementation is not callable by browser roles.
- Triggers enforce restricted branding writes, generated-fixture receipts (rolling back the entire generation transaction), award publication, and honors activation. Award publication reads also have a restrictive RLS policy. The presentation reader suppresses playback commands while honors or TV access is disabled.
- Match ownership/tournament identity cannot be reassigned through ordinary updates to escape an entitlement. The existing checked platform transfer RPC remains authorized to transfer all related match ownership. Creating tournament fixtures requires organizer authorization.
- Existing account blocking, tournament visibility, tournament restriction, scoring authorization, and revision checks remain additional independent requirements.

## Client enforcement and synchronization

[feature-access.ts](src/lib/feature-access.ts) centralizes scope resolution, default-deny decisions, and permission refreshes. Existing UI components consume this layer instead of rewriting settings. Active clients poll every five seconds, also refresh on focus/reconnection, and invalidate after local administrative saves. Browser throttling/network loss can delay refresh; this is polling, not a guarantee of instantaneous remote revocation.

The editor uses [platform-features.tsx](src/components/platform-features.tsx) in both administration entry points. Search is server-backed, accounts are paginated, controls are grouped, changes are staged until Save, and errors hide stale permission controls. Browser admin data is not persisted to offline storage.

Restricted TV animations are filtered before selection and an active restricted event is cleared. Horn playback stops when revoked. Victory/honors displays and award information are gated independently. Restricted custom TV styles fall back to the existing default without deleting selected preferences. Settings/previews, branding fields, fixture controls, and publication controls hide according to effective access.

## Offline behavior and technical boundaries

The existing atomic scoring RPC and durable queue remain unchanged. Restricting offline access blocks **new** disconnected scoring. Previously queued operations remain stored and may synchronize on reconnection subject to the existing account/tournament/scorer permissions. New online operations for restricted accounts verify connectivity/access before enqueueing. No queued delivery is silently discarded.

The last verified offline decision is cached separately by account so an entitled scorer can reopen an offline app. Revocation cannot reach a disconnected device until reconnection. An offline browser cache is not a trusted server authorization mechanism.

Client-rendered animations/audio/themes and locally calculated statistics cannot be made unreproducible in a modified client when assets and public delivery data are already available. A server also cannot prove whether a submitted scoring operation was composed offline. Protected server writes are enforced; the official app enforces display/offline restrictions. Public score data is not removed merely to prevent someone recalculating statistics independently. Existing PWA registration/navigation policy is preserved.

## Validation and manual checks

Final local validation (19 November 2026):

- Application suite: **52 files, 290 tests passed**.
- Embedded PostgreSQL suite, applying the full migration chain: **20 tests passed**.
- TypeScript `tsc --noEmit`: passed.
- Production build and PWA generation: passed (71 precached entries).
- Isolated browser editor fixture: no horizontal overflow at 375, 768, and 1440 pixels; existing light/dark semantic colors verified. The fixture used a disabled-network query cache and was removed afterward. The real signed-out admin route remained protected.
- No live migration, production account modifications, or real tournament mutations were performed. Live multi-device verification remains a deployment check.

Automated coverage includes database authorization/hierarchy, independent accounts, invalid permissions, direct table attempts, restricted branding/generation/publication/honors, transaction rollback, restoration/audit, existing tournament transfers, permission refresh/failure, device preference preservation, horn revocation, and durable offline queue replay. Existing component tests explicitly supply unrestricted entitlements; dedicated Phase 4 tests exercise restricted states.

Before releasing to users, apply the migration in the target environment and verify with dedicated organizer/scorer accounts and two physical devices: disable/restore each feature, check public TV, transfer ownership, test disconnect/reconnect, and confirm saved configurations return. No destructive tests were run against actual tournament records.

## Principal files

- [Migration](drizzle/migrations/0017_individual_feature_controls.sql), [migration journal](drizzle/migrations/meta/_journal.json), [RPC types](src/integrations/supabase/types.ts).
- [Permission resolver](src/lib/feature-access.ts), [shared admin editor](src/components/platform-features.tsx), [admin workspace](src/components/platform-admin.tsx), [user details](src/components/platform-users.tsx).
- [TV route](src/routes/display.$matchId.tsx), [TV highlights](src/components/cricket/tv-highlight.tsx), [TV honors](src/components/cricket/tv-honours.tsx), [honors control](src/components/cricket/honours-control.tsx), [audio](src/components/cricket/match-audio.tsx).
- [Settings](src/routes/settings.tsx), [presentation settings](src/components/cricket/presentation-settings.tsx), [tournament form](src/components/cricket/tournament-form.tsx), [tournament page](src/components/cricket/tournament-page.tsx), [statistics](src/components/cricket/tournament-statistics.tsx), [award publication](src/components/cricket/match-award.tsx).
- [Scoring queue hook](src/lib/cricket/use-scoring.ts), [scorer page](src/routes/_authenticated/score.$matchId.tsx).
- [Database tests](scripts/fixture-generator-db.test.mjs), [editor tests](src/test/platform-features.test.tsx), [permission resolver tests](src/test/feature-access.test.tsx), [offline safety test](src/test/feature-offline-scoring.test.tsx), and updated existing component tests.
