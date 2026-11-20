import { playoffNode, type PlayoffContext } from "./playoffs";
import { matchStageTitle } from "./match-stage";

/** Bracket fixtures take precedence over older manually labelled knockout matches. */
export function honoursMatches(ctx: Pick<PlayoffContext, "matches"> & Partial<Pick<PlayoffContext, "playoff">>) {
  const active = ctx.matches.filter(m => m.status !== "cancelled");
  if (ctx.playoff) {
    const nodes = ctx.playoff.draw.nodes.filter(n => ctx.playoff!.draw.format === "ipl"
      ? ["q1", "q2", "eliminator", "final"].includes(n.id)
      : n.id === "final" || /^semi[ -]final/i.test(n.title));
    return nodes.flatMap(n => active.filter(m => playoffNode(m) === n.id));
  }
  const bracket = active.filter(m => playoffNode(m));
  const source = bracket.some(m => playoffNode(m) === "final") ? bracket : active;
  return source.filter(m => /^(semi[ -]final(?: \d+)?|qualifier [12]|eliminator|final)$/i.test(matchStageTitle(m.rules)?.trim() ?? "") || playoffNode(m) === "final")
    .sort((a, b) => (matchStageTitle(a.rules) ?? "").localeCompare(matchStageTitle(b.rules) ?? "", undefined, { numeric: true }) || a.created_at.localeCompare(b.created_at));
}
