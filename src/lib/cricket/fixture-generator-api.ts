import { supabase } from "@/integrations/supabase/client";
import type { FixtureContext, Pair, ScheduleMode } from "./fixture-generator";

function failure(error: { message: string; code?: string }) {
  if (error.code === "PGRST202" || error.code === "42883")
    return new Error(
      "Smart Fixture Generator needs database migration 0010. Apply it in Lovable, then try again.",
    );
  return new Error(error.message);
}
export async function loadFixtureContext(
  tournamentId: string,
  groupId: string,
): Promise<FixtureContext> {
  const { data, error } = await supabase.rpc("fixture_generator_context", {
    _t: tournamentId,
    _group: groupId,
  });
  if (error) throw failure(error);
  if (!data || typeof data !== "object" || Array.isArray(data) || typeof data["token"] !== "string")
    throw new Error("Invalid fixture preview response.");
  return data as unknown as FixtureContext;
}
export async function saveGeneratedFixtures(
  context: FixtureContext,
  mode: ScheduleMode,
  target: number,
  pairs: Pair[],
  requestId: string,
) {
  const { data, error } = await supabase.rpc("create_generated_fixtures", {
    _t: context.tournament.id,
    _group: context.group.id,
    _mode: mode,
    _target: target,
    _token: context.token,
    _pairs: pairs,
    _request: requestId,
  });
  if (error) throw failure(error);
  return data ?? [];
}
