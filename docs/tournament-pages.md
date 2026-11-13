# Tournament pages

Public viewers use `/t/:tournamentId`. Owners, existing app administrators, and assigned scorers use `/tournaments/:tournamentId/manage`. Both routes render the shared [tournament page](../src/components/cricket/tournament-page.tsx), using the same tournament record. Public routes always suppress management controls, including for signed-in owners.

Tournament information editing has its own `/tournaments/:tournamentId/edit` route. Teams/squads, fixtures and groups have separate forms in their respective tabs. Team details are opened from the Teams tab. Format and squad changes affect future fixtures; existing matches retain their recorded configuration and player names.

## Database rollout

Migration `0009_match_format_overrides` extends the existing `apply_score_operation` RPC to accept match-specific overs and balls-per-over alongside toss confirmation. It retains durable operation IDs, revision checks, audit records and the scoring queue. Changes are accepted only for scheduled matches before the toss and with no deliveries (1–100 overs, 1–12 balls per over). Tournament defaults remain unchanged. A capability RPC keeps format controls disabled until the migration is deployed. This migration replaces the scoring function; review any cloud-side customizations before applying it.

Migration `0008_edit_scheduled_matches` enables the Edit button beside scheduled-fixture deletion. It updates only optional date, time and venue, preserving creation order, teams, rules and scoring state. The authenticated owner/admin operation locks the match, checks the loaded revision, and rejects started matches or any match with recorded deliveries. Apply this migration before saving schedule edits.

Migration `0007_delete_scheduled_matches` adds the owner/admin scheduled-fixture deletion operation. Apply it before using Delete scheduled match. It revokes direct match deletion from application roles and exposes an authenticated RPC that locks the match, checks ownership, and refuses deletion unless status is scheduled and there are no deliveries. Completed and in-progress matches are retained. The UI requires confirmation and never falls back to an unguarded delete if the RPC is unavailable.

Apply [0005_tournament_pages.sql](../drizzle/migrations/0005_tournament_pages.sql) with the project's existing Drizzle migration runner before publishing these changes. The migration is registered in the migration journal. With `LOVABLE_DB_MIGRATION_URL` configured in the deployment environment, run `npx drizzle-kit migrate`. Do not run schema push against the intentionally empty generated schema file.

The additive migration preserves existing tournaments, teams, matches and deliveries. It adds:

- Tournament location, description, dates, competition format, standings order and no-result points.
- Team logos and captains, with captains constrained to the registered squad.
- Scheduled match time (local to the venue).
- Groups, constrained to distinct teams in the same tournament. A team can belong to only one group.
- An atomic group-save RPC that also enables group-stage format.
- Public read policies, owner/admin write policies and realtime publication for tournament configuration.

`is_tournament_owner` recognizes the existing app-level admin role, consistently with match ownership. It does not grant any new role. Scoring still requires `can_score` and `apply_score_operation`; no computed totals are stored or direct score updates introduced.

Until the migration is applied, public pages tolerate the missing groups table and continue showing legacy tournaments. Management shows a deployment notice. New metadata, team editing, fixture time and group writes require the migration. The client has no migration credentials and cannot apply it itself.

## Derived data and updates

The scoring workspace uses Scoring, Scorecard, Balls and Info tabs with the shared white/teal theme. Batter selection is ordered (first pick takes strike); bowler selection enforces existing eligibility. Quick extras include 1–6 byes/leg-byes, WD plus additional runs, and no-ball bat/byes runs plus the configured penalty. More exposes retired hurt and confirmed abandonment. Bonus runs use penalty log entries; retired hurt uses a zero-run penalty entry with a retired-hurt wicket marker, so neither consumes a ball and retirement does not count as a wicket. Undo still uses the durable scoring operation. Earlier-ball correction and change-history UI are removed, while backend audit and correction support remain intact. Spectator, TV and scorer management links remain available.

Fixture date, time and venue are optional. Match lists use creation order (oldest first) within each status section, including team history and knockout progression; scheduled dates do not change that order.

New fixtures first require a group-stage/group selection or an Other Match title (including knockout rounds). Classification is saved in the existing match rules JSON as `tournamentStage`, alongside the unchanged cricket rules; no additional schema migration is needed. Group fixtures offer only members of the selected group. Explicitly classified Other Matches are excluded from points tables, while unclassified legacy fixtures retain their previous membership-based behavior. Player statistics still include all tournament matches.

### Team leadership registration

Apply migration `0006_team_vice_captain` after `0005_tournament_pages` to save vice-captains. Team registration uses fixed captain and vice-captain rows followed by removable player rows. Existing unassigned roles stay blank until explicitly chosen; no existing player is silently promoted. Names are trimmed and duplicates are rejected case-insensitively, treating repeated whitespace as equivalent. The current schema stores player names rather than player IDs. Editing updates the existing team only; existing match rosters and delivery records remain unchanged. Squad registration has no maximum size. The existing fixture check still requires enough players for the configured playing side.

[tournament-summary.ts](../src/lib/cricket/tournament-summary.ts) aggregates pure engine innings output. Batters and bowlers are attributed by toss and innings to team IDs; identical names on opposing teams remain separate. The existing data model identifies players by name within their team, so two players with identical names on the same team cannot be distinguished.

Only completed, engine-derived outcomes enter win/tie/loss standings. Abandoned matches receive configured no-result points and are excluded from NRR; cancelled fixtures do not count. NRR uses each match's balls-per-over setting and full allotted overs when all out. Group tables count only fixtures between members of that group. Knockout mode displays scheduled fixtures and derived winners in chronological order; it does not invent unscheduled bracket rounds.

[use-tournament.ts](../src/lib/cricket/use-tournament.ts) paginates teams, matches and deliveries, listens to realtime changes (including deletion/undo), refetches on reconnect, and polls every 15 seconds as a fallback. Fetch errors retain the last successful snapshot with an error notice. No-match statistics use zero values and no player name. Player photos are not supported by the existing player model, so cards use a neutral avatar.

## Verification

Run `npm test`, `npx tsc --noEmit` and `npm run build`. Tests cover tournament scoping, same-name players, credited wickets, boundaries, best innings, undo/corrections, all-out NRR, no results, pagination and public/owner/scorekeeper controls. After applying the migration, verify owner/admin create/update operations, anonymous write rejection, group membership validation and delivery updates across two live browser sessions.
