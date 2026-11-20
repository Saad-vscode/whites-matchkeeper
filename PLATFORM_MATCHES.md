# Other Matches — independent match administration

Apply [0019_independent_match_management.sql](drizzle/migrations/0019_independent_match_management.sql) **once after 0018**, then deploy the frontend. This migration has not been applied to the connected Supabase project. No new authentication credentials or Edge Functions are required.

## Scope and controls

Admin → **Other Matches** lists only matches whose `tournament_id` is null. Tournament matches are excluded from the directory and inspection endpoint, and the management RPC rejects them. Existing tournament administration remains unchanged.

The directory includes search by teams/organizer/email, status and restriction filters, 20-row pagination, actual summary counts, responsive rows, and read-only inspection of innings scores, squads and administrative history. Scores come from the existing delivery engine; no computed totals are stored.

- **Hide/unhide:** restrict public listings, spectator links, TV links and delivery reads. The organizer and assigned scorers retain access, subject to their existing account permissions. An unrelated platform admin uses the private inspection endpoint; platform authority does not grant private access in User Mode.
- **Disable/enable:** pause scoring, edits and offline replay, preserving match data and queued operations. Enabling does not unhide or unarchive the match.
- **Archive/restore:** preserve read-only history and remove the independent match from public discovery. Archived shared links remain readable unless the match is also hidden. Finish or resolve ongoing matches before archiving.
- **Delete/recover:** soft deletion only; no deliveries, score operations, assignments, results or player statistics are physically removed. Deleted matches are unavailable to ordinary users and remain inspectable/recoverable in Admin Mode. No automatic purge or permanent deletion is implemented.
- **Ownership transfer:** Platform Owner only; destination must be a different active, verified account. Scorer assignments and historical authors remain unchanged. Complete or resolve ongoing matches first. Ownership transfer retains normal score-revision conflict protection.

Hide/disable on an ongoing match require typing its team pairing. Disable/archive/delete/transfer require a reason. Delete/transfer also require the pairing confirmation. Every available action has a confirmation panel; the backend independently checks the same critical conditions.

## Security and synchronization

Backend RPCs validate current platform roles on every call. Direct modification of administrative fields is rejected. A restrictive match-read policy and the existing child-table policies enforce hidden/deleted visibility. Write triggers inspect both old and new parent matches so moving a record cannot bypass a restriction. Existing `can_score` and `is_match_owner` helpers retain their identities and tournament logic, with an additional independent-match restriction check.

Approved management operations reuse the existing private transaction context, so recovery remains possible during platform maintenance. The context has no browser table privileges. Operations use locking, atomic audit writes and a five-second lock timeout; failures roll back.

Administrative access-only changes preserve score revisions. Hiding, disabling, enabling, archiving and recovery therefore do not create false scoring conflicts for an unchanged offline queue. Actual scoring and ownership changes retain revision checks. A blocked device keeps its queue; existing retry logic can resume once access is restored, unless a genuine scoring conflict requires explicit resolution.

Public spectator/TV readers already revalidate access every five seconds and on reconnection. A successful empty result clears previously displayed match data. Server restrictions apply immediately; disconnected screens cannot receive revocation until reconnected. Previously downloaded public data cannot be remotely erased.

Each action records actor ID, match ID, action, reason, timestamp and before/after values in `platform_activity`. No normal User Mode layout changes are introduced.

## Changed implementation

- [SQL migration](drizzle/migrations/0019_independent_match_management.sql)
- [Admin interface](src/components/platform-matches.tsx)
- [Typed match management client and action rules](src/lib/platform-matches.ts)
- [Admin navigation](src/components/platform-admin.tsx)
- [Public discovery filtering](src/components/cricket/public-tournaments.tsx)
- [Supabase RPC types](src/integrations/supabase/types.ts)
- [Database integration tests](scripts/fixture-generator-db.test.mjs)
- [Interface and action tests](src/test/platform-matches.test.tsx)

## Validation and deployment checks

Completed validation: 298 application tests across 55 files, 22 disposable-database tests, TypeScript checking, and the production/PWA build passed. The Other Matches interface was checked at 375px, 768px and 1440px widths without horizontal overflow. These layout checks used fixture data; authenticated production verification still requires the migration to be deployed.

The disposable database suite exercises owner/admin/user authorization, rejection of tournament IDs, hidden match and delivery reads, assigned-scorer access, protected administrative fields, disabled scoring and definer writes, live-action confirmation, archive/restore, blocked transfer recipients, owner-only transfer, deletion/recovery, score revision preservation and retained deliveries. No real match was changed for testing.

After applying the migration, verify with a dedicated independent match and a separate spectator browser: hide/unhide the shared link, disable/re-enable scoring, and recover a soft-deleted completed match. Confirm tournament fixtures never appear in Other Matches. Authenticated production verification remains a manual deployment check.
