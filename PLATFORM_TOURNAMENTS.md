# Phase 3 — Platform Tournament Management

## Apply and deploy

1. Apply [0016_platform_tournament_management.sql](drizzle/migrations/0016_platform_tournament_management.sql) once in the existing project's SQL editor, after migrations 0014 and 0015. The migration includes `BEGIN` / `COMMIT`. It has been tested against the complete migration chain in embedded PostgreSQL; it has **not** been applied to the remote database.
2. Deploy the frontend after the migration. No new Edge Function, service-role key, OAuth provider, storage bucket, or authentication configuration is required for Phase 3.
3. Sign in with an existing Platform Owner or Platform Admin account, switch to Admin Mode, and open Tournament Management.
4. Before general rollout, use a dedicated test tournament to verify the live Supabase RLS/Realtime behavior with an anonymous viewer, organizer, assigned scorer, admin, and owner. Do not use actual tournament history for deletion tests.

All existing tournaments default to visible, enabled, unarchived, and not deleted. Existing auth identities, platform roles, tournament IDs, match IDs, deliveries, scorer assignments, logos, and Google sign-in configuration are preserved.

## User interface and operations

- Real summary counts; search by tournament/organizer/email; separate lifecycle, visibility and organizer filters; newest/oldest/name sorting; server pagination of 20 tournaments.
- Desktop table and mobile records use existing Crease semantic theme tokens and components. Ordinary User Mode has no redesign.
- Read-only admin inspection includes information, squads, fixtures and derived scores, group points tables, existing statistics components, tournament honors, published match awards, rules, branding, playoff configuration and the latest 50 administrative actions. This is a checked admin RPC, not account impersonation or global public-read access for admins.
- Edit presentation information (name, short name, location, description), hide/unhide, disable/enable, archive/restore, recoverably delete/recover. Match formats and scoring rules are not rewritten by the admin edit dialog.
- Only Platform Owners can transfer ownership. The recipient must be an active, verified account. Transfer updates the tournament and its match owners atomically, preserving explicit scorer assignments and historical authorship.
- Disabled/archived organizers see restriction messages in tournament management, editing and scoring. Existing score queues are preserved; backend checks reject replay until restrictions are lifted.
- Public discovery omits hidden and archived competitions; archived visible shared links remain available as read-only history. The organizer's “My tournaments” inventory retains historical entries.

## Independent state

The tournament retains four administrative fields: `platform_hidden`, `platform_disabled`, `platform_archived`, and `platform_deleted_at`. No cricket aggregates are stored.

Upcoming/active/completed lifecycle is derived from matches, with archive taking precedence. Completion follows the existing rule: a single identified, non-cancelled final is completed, preferring a bracket final to a manually labelled final. A league without an identified final is not automatically marked completed. Active means started fixtures without a completed identified final. Disabled status does not silently change lifecycle or visibility.

Restore from archive only clears archive. Enable only clears disable. Unhide only clears hide. Recovering a deleted tournament restores its previous independent flags.

Deletion is **soft and recoverable indefinitely in this phase**; there is no automatic purge or permanent-delete API. A reason and exact tournament-name confirmation are required. Live, paused, or innings-break matches prevent deletion. Existing results, statistics, settings, media and associated rows remain intact. Ordinary browser requests cannot physically delete a tournament; a future owner-only purge would require a separately reviewed resource/ownership cleanup workflow.

## Backend enforcement

- All directory, inspection and mutation RPCs validate the current database platform role and account status on every request. Transfer additionally checks Platform Owner authority.
- New restrictive SELECT policies cover tournaments, teams, groups, matches, deliveries, scorer assignments, score-operation records, awards, playoff state, fixture receipts and presentation commands. Existing authorization policies remain in place.
- Hidden reads are restricted to active organizers, explicitly assigned scorers/match owners, and the existing legacy tournament-admin permission. Platform-admin status alone does not expose hidden records through ordinary User Mode queries. Deleted records are available only through checked platform inspection.
- Public security-definer playoff and presentation readers now enforce visibility. Their internal unchecked functions are not executable by browser roles.
- Scoring/ownership helpers reject disabled, archived and deleted tournaments. Row triggers also enforce restrictions for direct writes and security-definer RPCs, checking both old and new parent IDs so a record cannot be moved out of a restriction.
- Write triggers acquire shared tournament-row locks; administrative changes acquire an exclusive tournament lock. Competing changes serialize or fail/roll back on contention. The management RPC uses a five-second lock timeout; retry after refreshing if another writer is active.
- Protected flags and ownership cannot be set by ordinary tournament updates. An inaccessible transaction-scoped context authorizes only the checked administration RPC's narrowly specified writes. Clients cannot forge that context with session settings or inserts.
- State changes and audit entries are committed together. Logs include actor ID, tournament ID, action, timestamp, reason, and previous/updated tournament data.
- The platform overview uses the same lifecycle definitions and excludes recoverably deleted tournaments from totals/recent entries.
- No service-role credentials are present in frontend code. Existing admin NetworkOnly PWA navigation and private query-cache behavior remain in effect.

## Visibility timing and media

RLS applies immediately to new API reads and Realtime row authorization. Already open TV/spectator clients revalidate matches every five seconds; a successful denied/empty response clears their previously displayed match and delivery data. Honors/draw views also reject stale denied data. Tournament pages revalidate every fifteen seconds. Public discovery polls every ten seconds.

Content already downloaded by a viewer cannot be retroactively erased, especially while their device is offline. This release does not claim to revoke previously downloaded screenshots or externally hosted/public logo URLs. It does not delete or move storage assets. Tournament branding currently uses stored URLs/data images; hiding prevents new reads of the tournament record containing them.

Future tournament-related tables, new definer read functions, or storage APIs must adopt the same visibility and write guards. Do not assume a new table is automatically covered by this migration's explicit table list.

## Validation

- Full application regression run: **49 test files, 277 tests passed**.
- Subsequent focused run after final access/discovery tests: **11 tests passed** covering the new directory/actions, exact-name deletion confirmation, discovery exclusion and live-score cache clearance.
- Database integration: **19 tests passed** against all migrations, including a dedicated Phase 3 tournament with unauthorized RPCs, hidden shared reads, admin-only inspection, scorer access, disabled RPC replay, direct/definer write rejection, moving records out of restrictions, transfer hierarchy/eligibility, preserved scorer assignments, archive/restore, live deletion refusal, soft recovery and audit records. Existing fixture generation, playoff, scoring, awards and account management tests pass.
- TypeScript and production/PWA build checked. Existing Vite plugin-timing and Node localStorage test warnings are non-fatal.
- Isolated browser layout fixture (network queries disabled): 375, 768 and 1440-pixel viewports had no horizontal overflow; mobile records/table switch correctly. Theme token checks confirm the existing light palette and dark background/card/text colors. Temporary fixture removed; no account or tournament records changed.
- Real signed-in remote management, Realtime delivery across separate devices, and concurrent production traffic remain deployment checks because the migration has not been applied remotely.

## Implementation map

- [Migration](drizzle/migrations/0016_platform_tournament_management.sql) and [migration journal](drizzle/migrations/meta/_journal.json): state, authorization, audit and management RPCs.
- [Platform tournaments](src/components/platform-tournaments.tsx), [typed API](src/lib/platform-tournaments.ts), [admin integration](src/components/platform-admin.tsx), [Supabase types](src/integrations/supabase/types.ts).
- [Public discovery](src/components/cricket/public-tournaments.tsx), [home query](src/routes/index.tsx), [tournament page](src/components/cricket/tournament-page.tsx), [edit route](src/routes/_authenticated/tournaments.$tournamentId.edit.tsx), [scoring route](src/routes/_authenticated/score.$matchId.tsx): state-aware behavior without an ordinary-user redesign.
- [Live match](src/lib/cricket/match.ts), [playoffs](src/lib/cricket/use-playoffs.ts), [TV route](src/routes/display.$matchId.tsx): stale-access clearance.
- [DB integration tests](scripts/fixture-generator-db.test.mjs), [management UI tests](src/test/platform-tournaments.test.tsx), [public discovery tests](src/components/cricket/public-tournaments.test.tsx), [live-match tests](src/lib/cricket/match-live.test.tsx).
