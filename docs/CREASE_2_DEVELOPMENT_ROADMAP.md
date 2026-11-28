# Crease 2.0 development roadmap

Date: 28 November 2026. Status: **Phase 1 implemented and validated; awaiting review. Phases 2–14 are plans only.**

Companion: [architecture](./CREASE_2_ARCHITECTURE.md). Evidence: [existing audit](../CREASE_CODEBASE_AUDIT.md). The roadmap preserves existing UI/domain behavior and introduces independently testable adapters. It is not authorization to deploy, install dependencies or apply migrations during this documentation task.

## 1. Baseline and production safety

| Baseline | Status |
|---|---|
| Branch | `feature/local-first`, verified by inspection |
| Base commit | `7fb43b7`, verified as current HEAD |
| Application tests | User-provided verified result: 355 passed across 59 files |
| Database tests | User-provided verified result: 24 passed |
| Total | 379 existing passing tests; preserve and extend |
| Production build / PWA worker generation | User-provided verified successes |
| Current task verification | Source/build-wrapper inspection and document validation only; no test rerun claimed |

Existing untracked audit/output/temporary artifacts must remain untouched. The original planning task added only its two documents. The subsequently authorized Phase 1 implementation is recorded in section 8; no commits, pushes, migrations, installations or lockfile changes were made.

For future implementation:

- Keep Cloud Mode as the default. Local modes require explicit feature selection and authority grants; network failure must never silently change modes.
- Preserve all 379 baseline tests; do not lower coverage by deleting or weakening assertions to accommodate regressions. Add tests for new behavior and retain legacy expectations under Cloud Mode.
- Keep production database/credentials out of local tests. Use isolated synthetic accounts/tournaments and a separately provisioned staging environment.
- Branch in small reviewable increments from `feature/local-first`. Preserve Lovable-connected published history; no force pushes or rewriting published commits. Release code rollback uses ordinary revert commits, not history rewriting.
- No production schema changes before a reviewed compatibility plan, backup, migration/restore rehearsal and explicit rollout authorization.
- Cloud build and PWA output must remain valid after each merged increment. Desktop artifacts must not overwrite cloud outputs.
- Runtime interfaces, protocol versions and schema versions must be versioned. A feature flag is not a safe data rollback after local writes have begun.

Current validation commands are declared in [package.json](../package.json): `npm.cmd test`, `npm.cmd run test:fixtures:db`, and `npm.cmd run build` on Windows. Run them in implementation phases as appropriate without installing/upgrading dependencies incidentally. The build must also verify app-shell worker generation and correct deployment target. No commands are executed as part of this roadmap.

## 2. Phase structure

Each numbered phase should be split into pull-request-sized increments. “Rollback” below means a tested operational/code path, not discarding acknowledged scoring data. Complexity is relative scope, not a time promise.

### Phase 0 — Reproducible baseline and contracts inventory

**Scope:** capture baseline test/build artifacts, exact resolved tool versions, effective cloud deployment target and representative synthetic cricket scenarios. No behavior changes.

**Existing modules:** [package.json](../package.json), [vite.config.ts](../vite.config.ts), [vitest.config.ts](../vitest.config.ts), [database test harness](../scripts/fixture-generator-db.test.mjs), [engine tests](../src/lib/cricket/engine.test.ts), [Super Over tests](../src/lib/cricket/super-over.test.ts), [PWA tests](../src/lib/pwa.test.ts).

**Dependencies/risk:** none beyond the baseline; user-supplied production success does not reveal the deployed Nitro preset. Complexity: small.

**Acceptance/tests:** preserve 355+24 tests, successful cloud build/worker; record command, commit, platform and artifacts. Confirm no secret values in logs. Record fixtures for boundaries/extras/wickets, innings changes, maximum wickets, undo/corrections, Super Overs, IPL progression and honors.

**Rollback:** no runtime change; remove only newly added baseline harness artifacts if needed, without touching user files.

### Phase 1 — Minimal scoring transport seam (recommended first implementation)

**Status:** completed; see section 8 for actual files, tests, build results and limitations. No Phase 2 work started.

**Scope:** define a narrow injectable scoring transport for `readSnapshot` and `applyOperation`, with the current Supabase calls as the sole production implementation. Keep current operation/snapshot types, RPC arguments, queue order, permissions and errors unchanged. Do not introduce modes or move persistence yet.

**Existing modules:** [use-scoring.ts](../src/lib/cricket/use-scoring.ts#L36), [offline.ts](../src/lib/cricket/offline.ts), [Supabase client](../src/integrations/supabase/client.ts), [feature/offline scoring tests](../src/test/feature-offline-scoring.test.tsx), [offline tests](../src/lib/cricket/offline.test.ts).

**Dependencies/risk:** Phase 0; subtle changes to `SCORE_CONFLICT`, lost-response retries or receipt handling. Complexity: small. Proposed adapter/test modules do not yet exist.

**Acceptance/tests:** assert exact existing RPC names/payloads, expected revisions, stable operation IDs, duplicate response handling, conflict stop and pending retention on network error. Existing hook behavior and UI remain identical. No schema, package, auth, PWA or deployment edits.

**Rollback:** restore direct calls or retain the default adapter; no persisted format change. Run focused queue/permission tests, all application/database tests and cloud build before merging.

### Phase 2 — Shared pure domain and full repository contracts

**Scope:** extract dependency-free match/domain types and derivation from mixed modules. Define application-service ports for tournament management, atomic commits, assets, authority, capabilities, feed and outbox. Retain the existing cloud adapter as default. Move code incrementally, without rewriting rules.

**Existing modules:** [engine](../src/lib/cricket/engine.ts), [match derivation/live transport](../src/lib/cricket/match.ts), [scoring page](../src/routes/_authenticated/score.$matchId.tsx), [standings](../src/lib/cricket/tournament.ts), [summary](../src/lib/cricket/tournament-summary.ts), [award](../src/lib/cricket/match-award.ts), [fixtures](../src/lib/cricket/fixture-generator.ts), [playoffs](../src/lib/cricket/playoffs.ts), [settings inheritance](../src/lib/presentation-settings.ts).

**Dependencies/risk:** Phase 1; circular imports and accidentally changing statistical eligibility/tie ordering. Complexity: medium, several small increments.

**Acceptance/tests:** pure modules import no React/Supabase/Electron/browser globals; browser and Node execute identical scenario outputs. Differential tests cover engine, NRR/all-out handling, player identity, award publication revisions, Super Overs and playoff format. UI snapshots/interaction behavior remain unchanged.

**Rollback:** old cloud entry points remain re-export-compatible until migration complete. No data-format migration in this phase.

### Phase 3 — Versioned command/event and authority contract

**Scope:** specify and test canonical hashing, operation receipts, expected revisions, tournament sequence, epoch checks, undo/correction history and atomic repository conformance. Build in-memory/fake adapters for tests only before persistent adoption.

**Existing modules:** [offline replay](../src/lib/cricket/offline.ts), [scoring sync](../src/lib/cricket/use-scoring.ts), [SQL scoring invariants](../drizzle/migrations/0002_scoring_sync_audit.sql), [latest Super Over RPC](../drizzle/migrations/0023_playoff_super_over.sql), [database tests](../scripts/fixture-generator-db.test.mjs).

**Dependencies/risk:** Phase 2; single-authority and controlled-transfer design approval. Complexity: medium.

**Acceptance/tests:** same ID/same hash returns original receipt; changed hash rejected; stale revision and wrong epoch rejected; event ordering independent of timestamp; duplicate/late/gapped events deterministic; rollback leaves neither state nor outbox partially committed. No simultaneous canonical writes in modeled cooperative transfers.

**Rollback:** contracts remain unused by production cloud until later opt-in. Do not change existing operation wire format in place.

### Phase 4 — Offline authorization and licence verifier

**Scope:** implement pure signed-credential verification and local authorization state machine using test keys, then staging-only activation issuance after review. Supabase remains identity provider. Distinguish licence, capability, authority and publisher credentials.

**Existing modules:** [Google auth](../src/lib/google-auth.ts), [auth route](../src/routes/auth.tsx), [protected route](../src/routes/_authenticated/route.tsx), [account gate](../src/components/account-access-gate.tsx), [feature access](../src/lib/feature-access.ts), [platform roles](../src/lib/platform-admin.ts), [auth tests](../src/test/auth-routing.test.ts), [account gate tests](../src/test/account-access-gate.test.tsx).

**Dependencies/risk:** Phase 3 and signed-off expiry/revocation/continuation policy; no fake roles in production. Complexity: high security review, delivered in verifier/issuer/activation increments.

**Acceptance/tests:** invalid signature/algorithm/audience/subject/key/scope/epoch/known revocation denied; finite expiry/continuation boundaries explicit; cloud outage does not invalidate valid local grant; paid cloud expiry leaves covered local rights intact; missing credentials cannot become authorized by offline status. Preserve Google login and cloud gate behavior.

**Rollback:** keep local activation disabled; cloud flow unchanged. Never deploy an unfinished verifier as a permissive fallback.

### Phase 5 — IndexedDB transactional repository

**Scope:** add Mobile storage adapter with raw entities, receipts, revisions, authority, audit/outbox and versioned migrations. Do not yet switch the production scorer. Implement recovery/export and a no-network local commit path.

**Existing modules:** [offline.ts](../src/lib/cricket/offline.ts), [use-scoring.ts](../src/lib/cricket/use-scoring.ts), [audio IndexedDB precedent](../src/lib/cricket/match-audio.ts), [dashboard saved matches](../src/routes/_authenticated/dashboard.tsx), [offline tests](../src/lib/cricket/offline.test.ts).

**Dependencies/risk:** Phases 2–4; quota, browser transaction lifetime, multi-tab writers, schema upgrades. Complexity: medium-high.

**Acceptance/tests:** abort injection at every transaction boundary gives all-or-nothing raw state/receipt/outbox; restart/refresh retains accepted operations; multiple tabs cannot overwrite queues; quota failure does not falsely acknowledge. Test real browsers as jsdom alone cannot establish persistence behavior.

**Migration safety:** existing localStorage queues remain intact. Import only after verifying source owner/match and reconciling acknowledged operation IDs; pending cloud commands are not automatically a new mobile authority. Use an import marker/checksum and backup, never two writers. Do not delete the old queue until validated recovery is possible.

**Rollback:** return to Cloud Mode only for a tournament with no new mobile-authoritative writes, or perform explicit export/reconciliation/authority transfer. Retain new store for recovery.

### Phase 6 — Complete phone-only workflow

**Scope:** opt-in Mobile Mode uses IndexedDB for tournament creation, teams/groups, fixture generation, settings, scoring/undo, playoffs, standings/statistics and awards. No laptop or TV required. Display local-save and pending-cloud status.

**Existing modules:** [tournament form](../src/components/cricket/tournament-form.tsx), [tournament page](../src/components/cricket/tournament-page.tsx), [tournament actions](../src/components/cricket/tournament-actions.tsx), [quick match creation](../src/routes/_authenticated/matches.new.tsx), [fixture UI](../src/components/cricket/smart-fixture-generator.tsx), [playoff hook](../src/lib/cricket/use-playoffs.ts), [honors control](../src/components/cricket/honours-control.tsx), [match award UI](../src/components/cricket/match-award.tsx), [PWA registration](../src/lib/pwa.ts).

**Dependencies/risk:** Phase 5 and activation; hidden Supabase reads in nested components, remote font/media requests, unsafe service-worker updates. Complexity: high but split by feature.

**Acceptance/tests:** a previously activated phone completes a new tournament with all network calls blocked, including restart, undo, Super Overs and awards. Local mode issues no required cloud request. Cached media/settings sufficient; unsupported storage produces clear recovery. Existing Cloud Mode tests remain green. Update activation deferred during an active local tournament.

**Rollback:** disable new Mobile tournaments; preserve/export existing local tournaments and finish them with a compatible build. No silent switch to cloud state.

### Phase 7 — Isolated desktop build and process prototype

**Scope:** in a separate build target, prove existing UI can run from local assets under Electron/Node, without relying on a Cloudflare worker artifact. Establish minimal main/preload/service boundaries and system-browser OAuth spike. No production desktop distribution yet.

**Existing modules:** [vite.config.ts](../vite.config.ts), [server.ts](../src/server.ts), [start.ts](../src/start.ts), [router](../src/router.tsx), [root route](../src/routes/__root.tsx), [PWA registration](../src/lib/pwa.ts), [Google auth](../src/lib/google-auth.ts).

**Dependencies/risk:** Phase 2 can support this in parallel with Mobile work after contract stability; new dependency approval and build-target evidence needed. Complexity: medium-high.

**Acceptance/tests:** separate outputs, existing cloud build/worker unaffected, no Node/Electron/server secret imports in web bundle, desktop assets load offline, sandbox/IPC boundaries verified, OAuth callback/state handling validated against staging. Inspect wrapper 2.27.1 behavior documented in the [architecture](./CREASE_2_ARCHITECTURE.md#5-nitro-cloudflare-and-packaging-separation), not just its config comment.

**Rollback:** exclude desktop targets from normal build; remove only prototype artifacts. Do not alter deployed Nitro preset to make desktop work.

### Phase 8 — Managed local PostgreSQL and desktop repository

**Scope:** supervisor-managed database/API, minimal local roles and transactional repository adapter. Reuse shared domain services; preserve constraint/security semantics without treating Supabase Auth's schema as a locally writable identity directory.

**Existing modules:** [SQL migrations](../drizzle/migrations), particularly [scoring](../drizzle/migrations/0002_scoring_sync_audit.sql), [fixture persistence](../drizzle/migrations/0010_smart_fixture_generator.sql), [tournament guards](../drizzle/migrations/0016_platform_tournament_management.sql), [global guard](../drizzle/migrations/0018_global_application_settings.sql), [independent matches](../drizzle/migrations/0019_independent_match_management.sql), [Super Over validation](../drizzle/migrations/0023_playoff_super_over.sql), [PGlite tests](../scripts/fixture-generator-db.test.mjs).

**Dependencies/risk:** Phases 3–4 and 7; SQL auth adaptation, broad locking, process permissions, installer compatibility. Complexity: high, separate database provisioning/API/transaction slices.

**Acceptance/tests:** no manual DB setup; app starts/stops/restarts service; port conflicts handled; role cannot bypass scopes; atomicity/idempotency suite passes on real PostgreSQL as well as shared adapter tests. Parallel tournaments do not acquire a platform-wide lock per ball. Prove quota/maintenance invariants after any lock redesign.

**Rollback:** versioned pre-migration backup; old local schema preserved until validated upgrade. Legacy cloud migrations are not repurposed destructively or applied to production by installer.

### Phase 9 — Desktop scoring, HDMI and optional LAN

**Scope:** first direct laptop scoring plus second-display read-only fullscreen; then optional LAN phone enrollment/API/WSS and hotspot/router support. Keep these as separate acceptance increments.

**Existing modules:** [score page](../src/routes/_authenticated/score.$matchId.tsx), [TV route](../src/routes/display.$matchId.tsx), [TV feed](../src/lib/cricket/tv-feed.ts), [TV presentation](../src/components/cricket/tv-presentation.tsx), [TV highlights](../src/components/cricket/tv-highlight.tsx), [TV honors](../src/components/cricket/tv-honours.tsx), [audio](../src/components/cricket/match-audio.tsx), [presentation state](../src/lib/cricket/tournament-presentation.ts).

**Dependencies/risk:** Phase 8 and local assets; display/hotspot/TLS platform differences, event replay on reconnect. Complexity: medium per increment.

**Acceptance/tests:** HDMI operation with all internet disabled and no router; secondary screen has no controls; unplug/replug does not interrupt scoring. Actual phone scores through authenticated LAN while authority remains desktop. Wi-Fi loss buffers proposals without calling them committed. Reconnect avoids duplicated celebrations; winning/hat-trick priority and settings restrictions preserved.

**Rollback:** disable optional LAN or second-window launch independently; laptop scoring remains available. Never downgrade a local tournament to unsynchronized cloud state.

### Phase 10 — Cloud ingestion and publisher

**Scope:** staging receiver with authority enforcement and durable receipts; mobile and desktop publishers with bounded retries/cursors; complete cooperative transfer. Then opt-in cloud authority fences for locally hosted tournaments.

**Existing modules:** [scoring operation contract](../src/lib/cricket/offline.ts), [sync hook](../src/lib/cricket/use-scoring.ts), [Supabase integration](../src/integrations/supabase), [platform permission helpers](../drizzle/migrations/0015_platform_user_management.sql), [tournament management](../drizzle/migrations/0016_platform_tournament_management.sql), [independent match management](../drizzle/migrations/0019_independent_match_management.sql).

**Dependencies/risk:** Phases 3–6 or 8–9, policy approval; migration compatibility and legacy mutation bypass. Complexity: high, receiver/publisher/transfer separate increments.

**Acceptance/tests:** duplicates/lost ACK/out-of-order/gaps/hash mismatch/old epoch rejected or resolved correctly; server revalidates shared domain rules. Complete outbox replay after long outage converges exactly. Worker shutdown/database failure does not delay local commits. Cross-owner IDs/keys fail. Legacy cloud writes denied only for opted-in local-authority tournaments after transfer.

**Rollback:** stop publishing, keep local operation/outbox safe. Receiver supports previous protocol for a defined window. Reverting hosting mode requires frozen source, validated checkpoint and explicit authority transfer.

### Phase 11 — Public projections and Redis cache

**Scope:** shared domain projection worker, durable projection jobs, revision-protected Redis writes, compact DTOs, visibility tombstones and bounded warmup. Add read adapter without switching all legacy spectators.

**Existing modules:** [live reader](../src/lib/cricket/match.ts), [spectator route](../src/routes/match.$matchId.tsx), [spectator stats](../src/components/cricket/spectator-live-stats.tsx), [tournament reader](../src/lib/cricket/use-tournament.ts), [tournament summary](../src/lib/cricket/tournament-summary.ts), [format-aware honors](../src/lib/cricket/honours-matches.ts), [public snapshot SQL](../drizzle/migrations/0022_public_live_match_snapshot.sql).

**Dependencies/risk:** Phase 10; cache race/eviction, visibility leakage, SQL fallback storm. Complexity: medium-high.

**Acceptance/tests:** stale revision never overwrites newer projection, including after Redis eviction; same-version hash mismatch alerts; hiding prevents stale resurrection; Redis outage cannot invoke per-viewer full-history queries. Bounded rebuild from PostgreSQL works after total cache loss. Projection parity with engine/standings/awards across undo and Super Overs.

**Rollback:** opt-in reader flag can return to an authorized bounded PostgreSQL projection service, not uncontrolled full-history polling. Stop cache worker without affecting local stores or accepted cloud events.

### Phase 12 — Spectator admission and delivery

**Scope:** atomic per-tournament leases, rate limiting, Redis admission generation, cache-aware conditional polling and globally accessible Vercel UI. Gate v2 data endpoints; keep legacy tournament behavior until deliberate migration.

**Existing modules:** [public home](../src/routes/index.tsx), [public tournament listing](../src/components/cricket/public-tournaments.tsx), [public tournament route](../src/routes/t.$tournamentId.tsx), [match route](../src/routes/match.$matchId.tsx), [live reader](../src/lib/cricket/match.ts), [visibility fixes](../drizzle/migrations/0020_tournament_owner_returning_rls.sql), [match visibility](../drizzle/migrations/0021_match_visibility_returning_rls.sql).

**Dependencies/risk:** Phase 11; CDN bypass, raw API bypass, Redis failover forgetting leases and regional latency. Complexity: medium-high.

**Acceptance/tests:** 150 admitted sessions/tournament and 750 total across five installations; overload attempts rejected/delayed predictably; Redis restart cannot admit new sessions alongside untracked old leases; no session-ID swapping across tournaments. Stale score/source time displayed correctly. Verify access from multiple geographic test regions and no install requirement.

**Rollback:** pause new spectator admission or serve an authorized delayed projection. Local scoring continues. Do not reopen raw public table access as an emergency capacity workaround.

### Phase 13 — Backups, signed distribution and release rehearsal

**Scope:** verified automatic desktop backups, mobile export/recovery, signed Windows installer/update manifests, rollback-compatible migrations, update deferral, operator runbooks and staging commercial activation.

**Existing modules:** [PWA policy](../src/lib/pwa.ts), [offline recovery](../src/lib/cricket/use-scoring.ts#L112), [audio assets](../src/lib/cricket/match-audio.ts), [settings](../src/routes/settings.tsx), [build configuration](../vite.config.ts). Installer/backup/licence services are new proposed components, not existing modules.

**Dependencies/risk:** local workflows and sync stable; signing keys, backup key recovery, package redistribution and interrupted upgrades. Complexity: high validation effort.

**Acceptance/tests:** clean Windows installation without developer tools/manual DB setup; offline startup; clean-host backup restoration; signature rejection/tamper/downgrade tests; active tournament blocks update activation; paid cloud expiry does not disable lifetime-covered local functionality. Do not certify capacity before Phase 14.

**Rollback:** retain previous signed compatible release and pre-upgrade backups; block binary downgrade incompatible with current schema. Preserve outbox/authority on reinstall; never default to deleting user data.

### Phase 14 — Reliability qualification and controlled rollout

**Scope:** execute the matrix below on representative hardware, correct failures in focused patches, pilot noncritical tournaments, then authorize a release. Document actual capacity and supported browser/Windows versions.

**Existing modules:** entire [application test suite](../src), [database test harness](../scripts/fixture-generator-db.test.mjs), [PWA tests](../src/lib/pwa.test.ts), plus new adapter/protocol/browser/process/load tests introduced in earlier phases.

**Dependencies/risk:** all applicable gates; synthetic tests alone cannot cover installer/network/operator failures. Complexity: sustained validation.

**Acceptance:** all final readiness criteria pass with reproducible artifacts. **Rollback:** stop new activations/cutovers; let existing local tournaments finish on a supported compatible version, collect diagnostics and reconcile explicitly. Production cloud release remains supported throughout.

## 3. Required automated and operational test plan

### Topology and measurements

Use at least five unique installations and five isolated tournaments: for example three Mobile authorities and two Desktop authorities, distinct subjects/keys and deliberately overlapping human-readable team/player names. Add multiple simultaneous matches within a Desktop tournament. Test both different owners and two tournaments under one owner. Scoring authority is never duplicated just to generate load.

Admit 150 spectator sessions to each tournament, 750 aggregate. Attempt 500 per tournament for overload (2,500 attempts total); the admitted cap remains configured at 150. Numbers are **test targets**, not certified supported production traffic. Run an eight-hour soak, at least 30 sequential match completions, bursts and concurrent match scoring.

Measure local p50/p95/p99 commit latency, TV update latency, browser storage, database locks/connections/CPU/IO, memory growth, outbox size/age, cloud convergence time, Redis hit/miss/eviction, gateway request counts, admission counts, public freshness and error rates. Use operation/epoch/revision correlation, not secret-bearing payload logs. Suggested p95 targets are in the [architecture](./CREASE_2_ARCHITECTURE.md#16-reliability-targets); approve hardware and thresholds before declaring a pass.

| Scenario | Injection / action | Required assertions |
|---|---|---|
| Five-installation isolation | Swap tenant/tournament/match IDs, capabilities, cache keys and session tokens | API/DB denies cross-scope access; no cache/standings contamination |
| 150 each / 750 aggregate | Sustained live scoring and viewer churn | Measured budget met; cache-based work bounded; local scoring unaffected |
| Overload | 500 attempts per tournament, burst refresh and reconnect | Atomic cap, bounded retries/waiting, fairness across tournaments; no database fallback flood |
| Cloud database failure | Drop/time out ingestion and projection DB calls while internet works | Local commits/undo continue; bounded publisher retry; pending state accurate |
| Redis failure | Stop/cache-flush/restart Redis during admitted traffic | New admission fails closed; generation change safe; bounded stale/unavailable responses; no stampede |
| Internet loss | Disconnect WAN while preserving LAN | Phone-only and desktop/HDMI usable; queues persist; cloud UI shows old source timestamp |
| Browser restart | Close/reopen Mobile after committed and in-flight transactions | Committed records survive within browser guarantees; aborted command not falsely acknowledged; dedup retry |
| Laptop restart | Kill API/DB/publisher at transaction/ACK boundaries and reboot | Automatic startup, committed records intact, receipt/outbox consistent, no manual DB intervention |
| Sync recovery | Duplicate, delay, reorder/drop batches and ACKs | Exact raw-log convergence, contiguous cursors, stable IDs, no replayed historical celebrations |
| Offline undo/correction | Edit/undo while cloud down then replay | Before/after history retained; public totals/awards corrected and stale publication invalidated |
| Authority transfer | Cooperative freeze/export/epoch switch; retry each step | Exactly one active supported authority; old-epoch cloud writes rejected; no missing cutoff events |
| Lost-host recovery | Attempt takeover without surrender | Initial unsupported path blocked; no false claim of safe automatic transfer |
| Multi-tab/mobile storage | Concurrent tabs, quota denial, schema version conflict | Transactional checks prevent lost queue writes; clear error and no fake save |
| Capability/licence | Bad signature, expired delegation, allowed continuation, cloud subscription expiry | Correct distinction among local right, permission, authority and publishing; no blanket bypass |
| Clock manipulation | Move clock forward/back and restart | Ordering unchanged; time anomalies surfaced; no trusting timestamps for authority or revocation bypass |
| Desktop LAN/HDMI | Router/hotspot loss, screen removal, DPI change | Laptop scoring/HDMI independent of WAN; phone proposals reconciled; read-only TV preserved |
| Backup/restore | Restore encrypted export/PG backup on clean device | Checksums/domain parity/assets/outbox verified; authority reconciled before writes |
| Updates | Offer/tamper/interrupt installer and PWA activation during play | Active tournament not reloaded/migrated; bad signature rejected; safe compatible recovery |
| Legacy cloud regression | Run baseline flows with local flags off | All 379 tests preserved, Google/admin/RLS/offline/TV behavior unchanged |

Required test layers: pure domain/property tests; adapter conformance; IndexedDB real-browser transaction/restart tests; real PostgreSQL concurrent transaction tests; protocol fault-injection tests; Electron process/IPC and installer tests; staged gateway/load tests; actual device/LAN/HDMI and clean-host restore drills. Existing PGlite tests omit realtime publications and do not replace tests against the actual deployed services.

## 4. Feature preservation checklist

| Behavior | Existing reference tests / modules |
|---|---|
| Runs, extras, strike, max wickets, innings, Super Overs, undo | [engine tests](../src/lib/cricket/engine.test.ts), [offline tests](../src/lib/cricket/offline.test.ts), [Super Over tests](../src/lib/cricket/super-over.test.ts) |
| Tournament/team management and fixtures | [tournament page tests](../src/components/cricket/tournament-page.test.tsx), [team editor tests](../src/components/cricket/team-editor.test.tsx), [fixture tests](../src/lib/cricket/fixture-generator.test.ts) |
| IPL/knockout progression | [playoff tests](../src/lib/cricket/playoffs.test.ts), [playoff hook tests](../src/lib/cricket/use-playoffs.test.ts) |
| NRR/points/statistics/awards | [tournament tests](../src/lib/cricket/tournament.test.ts), [summary tests](../src/lib/cricket/tournament-summary.test.ts), [award tests](../src/lib/cricket/match-award.test.ts) |
| Honors format, animations, sound, TV following | [honors tests](../src/components/cricket/tv-honours.test.tsx), [highlight tests](../src/lib/cricket/tv-highlights.test.ts), [audio tests](../src/components/cricket/match-audio.test.tsx), [feed tests](../src/lib/cricket/tv-feed.test.ts) |
| Permissions/settings/auth | [feature tests](../src/test/feature-access.test.tsx), [global defaults](../src/test/global-defaults.test.ts), [account gate tests](../src/test/account-access-gate.test.tsx), [auth routing tests](../src/test/auth-routing.test.ts) |

All inherited settings must resolve identically across adapters: application defaults, tournament override, match override and authorized feature availability. Test golden scenarios across Mobile, Desktop and Cloud; do not maintain separate award/NRR/scoring formulas to make adapters pass.

## 5. Rollback and data protection rules

- Before local data exists, flags can return users to the old cloud adapter. After local commits, rollback is a data/authority procedure, not merely a UI flag.
- Never run both old localStorage replay and new IndexedDB writer against the same tournament authority. Import with receipts, verification and a durable one-time marker.
- Back up before local schema migration; restore to an isolated store and verify before activation. Preserve operation receipts long enough to cover supported backups and delayed retries.
- Old-epoch data is quarantined, never silently discarded or merged by timestamp. An operator resolves conflicts using raw operation history.
- Cloud changes must be additive and scoped to opted-in tournaments until all compatible readers/writers are deployed. Preserve old protocol handling for a documented transition period.
- Spectator rollback can reduce freshness/availability without affecting local play. Do not weaken visibility or reopen unbounded raw reads to disguise an outage.
- Licence-server failures cannot trigger account deletion, local data deletion or an unexpected stop to already valid event authorization.

## 6. Final readiness criteria

Release only after:

1. All 379 original tests remain passing, new contract/security/adapter tests pass, cloud build and worker generation remain successful, and exact artifacts/versions are recorded.
2. Previously activated phone completes a tournament without laptop/internet; Desktop installer runs scoring/HDMI offline without developer tools/manual database setup.
3. Every accepted local commit has an atomic receipt/outbox; undo/corrections and delayed duplicates converge exactly. No unexplained data loss or stale-epoch acceptance.
4. Five-installation isolation, 750 admitted-viewer target, overload, cloud/Redis/WAN failure and eight-hour/30-match scenarios have measured results with an explicit supported capacity statement.
5. Existing Google login, platform roles, tournament scorer permissions and RLS remain effective. Offline authorization/expiry/revocation/transfer trade-offs have approved product policy.
6. A clean-host restore is demonstrated, authority reconciliation is verified and operators have a tested recovery runbook with declared RPO/RTO.
7. Desktop signing/update chain, mobile update deferral and compatible rollback are verified; no update can surprise an active tournament.
8. No private credentials appear in browser/renderer packages, logs, public DTOs or ordinary exports. Security review covers IPC, LAN API, activation, cloud ingestion, cache visibility and admission bypass.
9. A staged pilot finishes successfully before general commercial distribution. Remaining limitations are documented plainly.

## 7. Smallest safe next task

The originally recommended first task, **Phase 1 only**, is now implemented: a narrow scoring transport interface plus a Supabase adapter around the existing `scoring_snapshot` and `apply_score_operation` calls in [use-scoring.ts](../src/lib/cricket/use-scoring.ts), with behavior-preserving contract tests. LocalStorage, UI, auth, RPC payloads, database and build configuration remain unchanged.

This creates the first replaceable boundary for Mobile/Desktop without requiring a new runtime, dependency or migration. Review this change before authorizing any Phase 2 work. IndexedDB, Electron, PostgreSQL and Redis implementation has not begun.

## 8. Phase 1 implementation record

### Files and interface

Created:

- [scoring-transport.ts](../src/lib/cricket/scoring-transport.ts): type-only contract with `readSnapshot(matchId)` and `applyOperation(matchId, expectedRevision, operation)` returning a typed snapshot/error result. Error message and optional code are retained; rejected requests can still throw.
- [supabase-scoring-transport.ts](../src/lib/cricket/supabase-scoring-transport.ts): singleton default and only production adapter using the existing authenticated Supabase client. Maps the existing operation to the exact original RPC arguments, including empty-object delivery for state operations. No business rules, retry policy or authorization replacement.
- [supabase-scoring-transport.test.ts](../src/lib/cricket/supabase-scoring-transport.test.ts): 8 adapter tests.
- [use-scoring.test.tsx](../src/lib/cricket/use-scoring.test.tsx): 11 hook/queue integration tests with injectable transports or a mocked Supabase client.

Modified [use-scoring.ts](../src/lib/cricket/use-scoring.ts): optional third transport argument defaults to the singleton; both snapshot read sites and the operation write use it. Existing two-argument callers are unchanged. Keep injected transport instances stable across renders. This roadmap is also updated with implementation status.

Before: scorer hook → direct Supabase RPC → existing backend checks/transaction → durable base/queue update.

After: scorer hook → scoring transport → default Supabase adapter → same RPC/checks/transaction → same durable base/queue update.

The queue still owns localStorage persistence, UUID creation, replay, five-second synchronization, conflict handling and pending-operation removal. The engine, permissions, authentication, UI and database are unchanged. The recovery action also uses the injected snapshot method, preserving its existing error and draft-export behavior.

### Actual validation results

| Command / check | Result |
|---|---|
| `npm.cmd test` (Windows equivalent of `npm test`) | **PASS: 374 tests across 61 files**, exit 0; includes all 355 original application tests plus 19 new tests |
| `npm.cmd run test:fixtures:db` | **PASS: 24/24**, exit 0, isolated PGlite harness; no production database connection |
| Combined tests | **398 passed = 379 baseline + 19 new** |
| `npm.cmd run build` | **PASS**, exit 0; client, SSR and Nitro Cloudflare-module output generated |
| PWA generation | **PASS**; final precache 73 entries, worker and Workbox output generated |
| `git diff --check` | **PASS**; Git reports normal Windows LF/CRLF conversion notices |
| Additional `tsc --noEmit` | **Not clean:** seven diagnostics in unchanged files; none in the Phase 1 files. An in-memory compiler comparison using the HEAD hook and excluding the four added files reproduced the same seven baseline diagnostics without changing the working tree. This is separate from the successful required build |

Tests cover exact RPC payloads for ball/undo/edit/state, snapshot identity, backend error identity/codes, operation IDs, expected revisions, network rejection, lost-response retry returning an already-committed snapshot, duplicate acknowledgment, both SCORE_CONFLICT and SQLSTATE 23505, queue order with revision advancement, offline scoring/undo across remount, durable pending retention, five-second timing, recovery reads and default adapter compatibility. All new transport calls are mocked; no production database is contacted.

The initial focused run had one new test-setup failure: an expression-bodied `beforeEach` returned the mock function as a cleanup callback. It was corrected to return nothing before the successful full run; no application behavior or existing assertion was changed to fix it.

Observed nonfatal output: Node's experimental localStorage notices in the test environment, Vite's tsconfig-path plugin recommendation, plugin timing notices and Nitro's inlineDynamicImports/codeSplitting warning. No dependency or build configuration was changed to suppress them.

The optional TypeScript check reports a missing scheduled-match RPC type, nullable values in tournament actions/platform settings, and incomplete existing tournament/team/match test fixture shapes. These are outside Phase 1 and are not repaired here. See [scheduled match editor](../src/components/cricket/scheduled-match-editor.tsx#L30), [tournament actions](../src/components/cricket/tournament-actions.tsx#L580), [tournament form test](../src/components/cricket/tournament-form.test.tsx#L21), [platform settings](../src/components/platform-settings.tsx#L78) and [shared test fixtures](../src/test/tournament-fixtures.ts).

### Scope, diff and limitations

The tracked application diff is limited to the scorer hook (11 insertions, 14 deletions), plus four new transport/test files and this roadmap update. The roadmap was already untracked before this phase, so ordinary `git diff` does not show its document changes. Pre-existing audit, architecture, output and temporary files remain intact. No changes to release branches, source outside the hook/new files, packages/lockfiles, auth, schema/migrations or deployment configuration; no commits or pushes.

This is a transport seam, not a local-first backend. Permission/global-setting calls and the existing derivation module still depend on the current application architecture. The adapter retains the existing RPC JSON-to-snapshot assertion rather than introducing runtime validation. Queue/retry limitations from the audit remain intentionally unchanged. Tests exercise lost responses using a simulated accepted snapshot; live Supabase network-failure testing was not performed. Phase 2 extraction, new storage, authority transfer and new runtimes require separate review/authorization.

**Next step:** review Phase 1 and its validation. If accepted, scope a small Phase 2 extraction of pure match types/derivation, with unchanged Cloud Mode behavior and parity tests. Stop here until review.
