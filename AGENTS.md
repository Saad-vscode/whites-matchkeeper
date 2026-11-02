<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Project rules

- All cricket numbers (runs, overs, strike, results) are derived from the `deliveries` log by the pure engine in `src/lib/cricket/engine.ts`; never store computed totals. Why: undo/corrections stay consistent.
- `matches.live` only holds who is on strike / non-strike / bowling and the current innings. Why: those are scorer choices the log cannot infer.
- Deliveries use client-generated UUIDs plus unique (match, innings, seq). Why: a ball can never be counted twice.
- Permissions are enforced by RLS helpers `is_match_owner` / `can_score`; spectators read publicly. Why: backend is the authority.
