import type { MatchRow } from "./match";
import type { NodeState } from "./playoffs";

export function automaticDraw(
  match: MatchRow | null,
  approved: boolean,
  following: boolean,
  enabled: boolean,
  preparing: string | null,
  resultElapsed: boolean,
) {
  if (!match || !approved || !following || !enabled) return false;
  if (["completed", "abandoned", "cancelled"].includes(match.status)) return resultElapsed;
  return match.status === "scheduled" && !match.toss_winner && preparing !== match.id;
}
/** Up to four fixtures per slide: legible on television without scrolling. */
export function tvBracketSlides(states: NodeState[]) {
  if(states.length>0&&states.length<=4)return [{round:0,nodes:states,part:1,parts:1}];
  const rounds = [...new Set(states.map((s) => s.node.round))];
  return rounds.flatMap((round) => {
    const nodes = states.filter((s) => s.node.round === round),
      pages = [];
    for (let i = 0; i < nodes.length; i += 4)
      pages.push({
        round,
        nodes: nodes.slice(i, i + 4),
        part: i / 4 + 1,
        parts: Math.ceil(nodes.length / 4),
      });
    return pages;
  });
}
