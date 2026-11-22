# Tournament playoffs

Apply [migration 0012](../drizzle/migrations/0012_tournament_playoffs.sql) in the Supabase/Lovable SQL editor after migrations 0005–0011. No existing scores are rewritten. Refresh the app afterwards.

The **Playoffs** tab follows Matches once all group/league fixtures finish (completed or abandoned), with at least one fixture for each participating team. Cancelled fixtures do not count. Direct knockout tournaments can prepare a draw without a group round.

## Organiser workflow

1. Open the tournament management page → Playoffs.
2. Choose the qualifying count for each group, then **Use top teams from standings**.
3. Review seed order. Selecting an already selected team swaps its position. Select another registered team to override a qualifier.
4. Review the full draw. **Save draft** publishes a preview without creating matches; **Approve draw & create fixtures** authorises automatic progression.
5. Ready fixtures appear in Matches, with the tournament's overs, balls-per-over, squads and rules. Schedule and assign scorers there as usual.

Defaults: one league with four qualifiers uses Qualifier 1 (1 v 2), Eliminator (3 v 4), Qualifier 2 (Q1 loser v Eliminator winner), then Final. Two groups with two qualifiers each now default to Qualifier 1 (A1 v B1), Eliminator (A2 v B2), Qualifier 2 (Q1 loser v Eliminator winner), then Final (Q1 winner v Q2 winner). Single elimination remains selectable and uses A1 v B2 and B1 v A2. Existing draws keep their saved format: before any playoff starts, use Edit draw, select IPL, use the top teams from standings, and approve again to replace unstarted fixtures. Other group counts use an editable seeded knockout; 2–32 qualifiers are supported and higher seeds receive necessary byes. No fixture is created for a bye.

The organiser can replace the draft and unstarted fixtures before the first playoff begins. Started matches and their logs are protected. Tied playoffs use the Super Over and deciding-toss flow below. Abandoned matches wait for an organiser to choose an advancing team with a reason. That decision is invalidated by a scoring revision; it does not change the score or manufacture a win in the delivery log.

## Automatic progression and recovery

The tournament management page and playoff scorer pages listen for match changes and retry reads every 15 seconds. On a confirmed result they use the pure cricket engine to resolve the draw and call a guarded, atomic RPC to create ready fixtures. No spectator writes occur. If all authorised pages are closed/offline, progression catches up when one reopens; this is not a server-side scheduled job.

The RPC checks permissions and a token covering the complete tournament snapshot. A unique tournament/node key prevents duplicate fixtures. Corrections can replace an untouched dependent fixture; if that match has started, advancement stops with an organiser-review message. Offline or unconfirmed scoring never drives advancement. Fixture schedules may need to be set again after a correction replaces a pairing.

No calculated cricket totals or winners are stored. Stored data consists of the approved bracket, explicit organiser decisions, and normal match fixtures. Supabase RLS and security-definer permission checks remain authoritative for writes.

## TV broadcast

After approval, the TV automatically shows the draw between matches when **Automatically follow tournament** and **Show playoffs between matches** are enabled. Opening a scheduled match in the scorer switches to its introduction; the toss and player selections then drive the usual scoreboard. Completed results stay for 12 seconds before the draw returns. A newly published Man of the Match restarts this result interval. A resolved final leads to a champions presentation.

**Show draw** in the TV header displays it for 10 seconds. **Display options** offers 5 seconds, 10 seconds, or **Until dismissed**. A new match or toss takes priority over a held draw. **Return to scoreboard** dismisses the automatic presentation for the current match. These controls operate on this TV browser, not as a remote control from another device.

Small brackets fit together on one screen; larger brackets rotate every eight seconds through panels with at most four fixtures. TV colors, fonts, tournament watermark and reduced-motion preferences are respected. No additional migration beyond 0012 is required for the TV presentation.

## TV celebrations and tournament honours

Apply `drizzle/migrations/0013_tournament_presentation.sql` after 0012. This stores only presentation commands, never cricket scores or calculated awards. Run it manually in the database SQL editor.

After the final, tournament management Home offers **Start tournament honours** / **Stop presentation** to the owner or an authorized match scorer. The TV must be open on a match in that tournament with **Automatically follow tournament** enabled. Commands are checked by the database; the TV polls every two seconds and reconnecting TVs recover the current state. “Presentation enabled” describes the command state, not an acknowledgement from a connected TV.

The loop shows champions, runners-up, then tournament honours. Each screen lasts eight seconds by default (5–10 seconds in Settings on the controlling browser). Stop returns the TV to the result scoreboard. Honours uses the delivery-derived Player of the Tournament (a player from a team that reached a qualifying round), Most Runs, Most Wickets, and revision-valid published Man of the Match awards from the semi-finals and final. Unpublished awards are labelled as awaiting publication. Corrections invalidate stale match awards.

Victory celebrations are TV-only, silent and default to ten seconds. Normal matches use a restrained reveal, playoffs use a framed presentation, and finals use trophy and confetti styling. Publishing a match award replays its celebration with the winner’s name and no points. Spectator awards remain static. Themes, duration, motion and previews are in Settings; reduced-motion preferences are respected.

App Light/Dark/Device, accent and typography preferences are stored in the current browser, independently of TV themes. Animation options are grouped under Batting, Wickets and Bowling. The TV uses its existing viewport fitter to avoid scrolling.

The **Awards to show on TV** checklist in Settings controls Most Runs, Most Wickets, Player of the Tournament and the published semi-final/final Man of the Match cards. These are browser-local display preferences: set them on the TV browser. All default to enabled, including for existing saved settings. Hiding a category does not change its calculations or publication. If all four are off, the honours slide is skipped and champions/runners-up continue looping. No additional migration is needed for this checklist.

## Super Over and deciding toss

Apply [migration 0023](../drizzle/migrations/0023_playoff_super_over.sql) after migrations 0000-0022 before using this feature. The scorer checks backend support and will not silently start a decider against an older database.

A tied qualifying or knockout fixture stays unresolved. In the scorer, choose **Start Super Over**, then select the batters and bowler using the normal player-selection controls. The team that batted second in the normal match bats first. Each side has six legal balls and at most two wickets (one wicket for a two-player side); wides and no-balls use the match's existing penalties and do not consume a legal ball. The chase finishes as soon as the target is reached. Last-man batting does not apply to the Super Over.

If the Super Over is also tied, the scorer opens **Deciding toss**. Conduct the toss, select its winner, and confirm. This records the actual toss outcome; the app does not simulate a random coin flip. The original pre-match toss remains intact. **Correct deciding toss** reopens this choice without deleting a ball. Once synchronized, the winner feeds the existing bracket progression. Group-stage matches can still finish tied.

Normal innings remain 1 and 2; Super Over innings are 3 and 4 in the same delivery log. The scorecard, ball history and TV label them separately. Super Over deliveries do not enter normal player statistics, MVP or net run rate. Match results and advancement are derived from the log plus the raw deciding-toss choice. Undo clears that choice and reopens the result; undo across innings returns to the previous innings. Correcting normal innings after the Super Over starts requires undoing the Super Over first.

All scoring operations, including the deciding toss, use the existing revision-checked, idempotent RPC and durable device queue. Connect and synchronize before starting or confirming a decider. Once started, ball scoring keeps the existing offline behavior. An already-started dependent fixture still requires organizer review if an earlier result changes.
