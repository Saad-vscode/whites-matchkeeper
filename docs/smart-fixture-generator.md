# Smart Fixture Generator

## Enable in Lovable Cloud

Apply [0010_smart_fixture_generator.sql](../drizzle/migrations/0010_smart_fixture_generator.sql) **after migrations 0000–0009** in the original database SQL editor. Run the entire file once; it wraps its changes in a transaction. It creates a private idempotency-receipt table, two authenticated RPCs, and a narrowly scoped duplicate-pair trigger. It does not rewrite existing fixtures, deliveries, results, scores, or standings. No new environment variables are needed.

The app explains that migration 0010 is required if the RPC is unavailable. The migration has not been applied to the hosted Lovable database by this session.

## Organizer workflow / local verification

1. Run `npm run dev -- --host 127.0.0.1 --port 5173` and sign in as the tournament organizer or an administrator.
2. Open **Manage Tournament → Matches → Generate Fixtures**. Public viewers and ordinary assigned scorers do not receive this action.
3. Select a group. It needs 2–32 distinct teams, each with at least the tournament's players-per-side count registered (the existing manual fixture rule).
4. Choose Round Robin or Equal Match Distribution. For equal distribution, enter a positive integer below the number of teams; team count × target must be even.
5. Generate a preview. Existing fixtures are marked separately from new fixtures. Preview and Shuffle perform no database writes.
6. Confirm. The backend verifies the complete final schedule and creates ordinary scheduled match records, preserving all existing records. The matches appear through the existing reload/realtime path.
7. Reopen the generator: existing generated fixtures are counted; a complete group creates nothing.
8. Verify scorer assignment, start/toss, match details, public fixtures and points through the existing controls. Generated matches inherit tournament format/rules and the first players-per-side squad entries, just like manual fixtures. Dates, times, venues and scorers are unassigned.

## Counting and ambiguity

- Explicit selected-group fixtures count in scheduled, live, paused, innings-break, completed and abandoned states. Abandoned matches already count as no-results in Crease standings.
- Cancelled matches do not count. Explicit Other/knockout matches do not count.
- Reversed team order is the same opponent pair. Repeated active pairs, moved/deleted teams and fixtures exceeding the quota stop generation.
- Legacy fixtures touching the selected group without clear group metadata, or legacy fixtures without identifiable teams, stop generation. The generator never guesses their classification or modifies them.
- Groups are solved separately; cross-group edges are never generated. A conservative snapshot covers tournament defaults, selected squads/group and all tournament fixture metadata. Changes elsewhere in the tournament can therefore require a fresh preview too.

## Algorithm and persistence

Round Robin enumerates missing unique pairs. Equal distribution solves the residual simple-graph degree problem using exhaustive backtracking, tightest-constraint-first vertex selection, capacity pruning, memoized failed degree states, and shuffled candidates. Previously processed vertices have zero residual degree, so the residual graph is determined by remaining degrees and the fixed existing edges. A failed randomized branch is not treated as proof of impossibility: other branches are explored.

Preview generation runs in a Web Worker with a 200,000-node / 1.5-second search budget. Limit exhaustion has its own message; it is not reported as mathematical impossibility. Different shuffles can produce the same result when the completion is unique.

Confirmation re-fetches and verifies the snapshot, membership, squads, every existing pair and every requested pair. It verifies exact final team quotas before inserting. A durable request UUID and payload hash make a retry return the original IDs. A reused UUID with a different payload is rejected. Deleting a generated fixture does not make an old request recreate it; generate a new preview instead.

The transaction takes a brief `SHARE ROW EXCLUSIVE` write lock on matches, tournaments, teams and groups. This deliberately coordinates with existing manual SQL/RPC paths without rewriting those flows. It serializes writes across tournaments while saving; the lock timeout is five seconds. Lock/deadlock errors roll back the entire batch and may be retried. This is a correctness-first V1 trade-off for modest tournament sizes, not a high-throughput scheduling service.

A trigger prevents later manual writes from duplicating an active generated pairing in the same group. Manual-only historical/rematch data is unchanged. Such existing duplicate data blocks generator use for that group.

## Verification commands

- `npm test`: app, algorithm and UI tests, including randomized graph invariants.
- `npm run test:fixtures:db`: isolated embedded Postgres tests, applying the actual migrations and RLS/RPC/trigger logic. Only realtime publication registration is omitted in the embedded harness.
- `npx tsc --noEmit`
- `npm run build`: builds the worker and app/PWA assets.
- Targeted ESLint is run on the newly introduced TypeScript/UI files and database test harness.

`@electric-sql/pglite` is a development-only dependency; it is not imported by application code or shipped in the client.

Embedded Postgres serializes query execution. The competing-request test verifies stale-preview rejection and idempotency under queued requests, **not real multi-connection lock contention**. Hosted Supabase/PostgREST authentication, realtime delivery and multi-connection concurrency still need a staging check after migration. Use two owner browser tabs with the same preview, confirm both, and verify only one batch exists; race a manual fixture and a group edit against confirmation and verify either the write wins before revalidation or confirmation rejects/rolls back.

## Files introduced or modified for this feature

- [Core scheduler](../src/lib/cricket/fixture-generator.ts), [worker](../src/lib/cricket/fixture-generator.worker.ts), [RPC adapter](../src/lib/cricket/fixture-generator-api.ts).
- [Generator interface](../src/components/cricket/smart-fixture-generator.tsx), [tournament Matches integration](../src/components/cricket/tournament-page.tsx).
- [Migration](../drizzle/migrations/0010_smart_fixture_generator.sql), [migration journal](../drizzle/migrations/meta/_journal.json), [Supabase RPC types](../src/integrations/supabase/types.ts).
- [Scheduler tests](../src/lib/cricket/fixture-generator.test.ts), [UI tests](../src/components/cricket/smart-fixture-generator.test.tsx), [database tests](../scripts/fixture-generator-db.test.mjs).
- [Package scripts/development dependency](../package.json), [dependency lock](../package-lock.json), and this guide.

## Results from this implementation session

- Application suite: **134 tests passed across 22 files**.
- Embedded Postgres integration suite: **11 tests passed**, including actual migration execution, owner/admin authorization, preserved deliveries/scorer assignments, exact quotas, rollback, idempotency and stale-preview checks.
- TypeScript: `npx tsc --noEmit` passed.
- Targeted ESLint on the new scheduler, adapter, worker, UI and tests passed.
- Production build passed; the fixture worker is emitted as its own asset and the PWA precache includes 45 assets.
- The hosted database migration and a real multi-session concurrency exercise have not been run. No existing hosted data was modified.
