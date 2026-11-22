import type { Json } from "@/integrations/supabase/types";

export const otherMatchTypes = [
  "Match",
  "Series Match",
  "Knockout",
  "Qualifier",
  "Eliminator",
  "Quarter Final",
  "Semi Final",
  "Final",
] as const;

export function countsForPoints(rules: Json, groupId?: string) {
  if (!rules || typeof rules !== "object" || Array.isArray(rules)) return true;
  const stage = rules["tournamentStage"];
  // Preserve legacy standings for fixtures created before explicit classification.
  if (!stage || typeof stage !== "object" || Array.isArray(stage)) return true;
  return stage["kind"] === "group" && (!groupId || stage["groupId"] === groupId);
}

export function matchStageTitle(rules: Json): string | null {
  if (!rules || typeof rules !== "object" || Array.isArray(rules)) return null;
  const stage = rules["tournamentStage"];
  if (
    !stage ||
    typeof stage !== "object" ||
    Array.isArray(stage) ||
    typeof stage["title"] !== "string"
  )
    return null;
  return stage["kind"] === "group" ? `Group Stage · ${stage["title"]}` : stage["title"];
}

/** Explicit playoff fixtures only; group-stage ties remain valid results. */
export function requiresDecider(rules: Json): boolean {
  if (!rules || typeof rules !== "object" || Array.isArray(rules)) return false;
  const stage = rules["tournamentStage"];
  if (stage && typeof stage === "object" && !Array.isArray(stage) && stage["kind"] === "group") return false;
  return typeof rules["playoffNode"] === "string" ||
    /^(Qualifier|Eliminator|Knockout|Quarter Final|Semi Final|Final)( \d+)?$/i.test(matchStageTitle(rules) ?? "");
}
