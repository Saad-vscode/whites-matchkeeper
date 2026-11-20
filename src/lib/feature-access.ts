import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { HighlightKind } from "@/lib/cricket/tv-highlights";

export const FEATURE_IDS = [
  "tv",
  "boundaries",
  "wickets",
  "moments",
  "sound",
  "celebrations",
  "honours",
  "appearance",
  "fixtures",
  "branding",
  "awards",
  "offline",
] as const;
export type FeatureId = (typeof FEATURE_IDS)[number];
export type FeatureAccess = Record<FeatureId, boolean>;
export type FeatureRow = {
  id: FeatureId;
  label: string;
  category: string;
  enabled: boolean;
  default_enabled: boolean;
  overridden: boolean;
  changed_at: string | null;
  changed_by: string | null;
  administrator: string | null;
};
export const allFeatures = (enabled: boolean) =>
  Object.fromEntries(FEATURE_IDS.map((id) => [id, enabled])) as FeatureAccess;
const ENABLED = allFeatures(true);
const DISABLED = allFeatures(false);
export function animationFeature(kind: HighlightKind): FeatureId {
  if (["four", "six", "winning_four", "winning_six"].includes(kind)) return "boundaries";
  if (["wicket", "caught", "stumped", "run_out", "duck", "golden_duck"].includes(kind)) return "wickets";
  return "moments";
}
export async function readFeatureAccess(
  scope: { match?: string | undefined; tournament?: string | undefined } = {},
) {
  const { data, error } = await supabase.rpc("read_feature_access", {
    ...(scope.match ? { _match: scope.match } : {}),
    ...(scope.tournament ? { _t: scope.tournament } : {}),
  });
  if (error) throw error;
  const result = allFeatures(false);
  for (const id of FEATURE_IDS)
    result[id] = !!data && typeof data === "object" && !Array.isArray(data) && data[id] === true;
  return result;
}
export function useFeatureAccess(
  scope: { match?: string | undefined; tournament?: string | undefined } = {},
) {
  const client = useQueryClient();
  const session = useQuery({
    queryKey: ["feature-session"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      return data.session?.user.id ?? null;
    },
    staleTime: Infinity,
    retry: false,
    networkMode: "always",
  });
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      client.setQueryData(["feature-session"], next?.user.id ?? null);
      void client.invalidateQueries({ queryKey: ["feature-access"] });
    });
    return () => data.subscription.unsubscribe();
  }, [client]);
  const user = session.data ? { id: session.data } : null;
  const ready = session.isSuccess;
  const shared = !!(scope.match || scope.tournament);
  const query = useQuery({
    queryKey: ["feature-access", scope.match ?? null, scope.tournament ?? null, user?.id ?? null],
    queryFn: async () => {
      const result = await readFeatureAccess(scope);
      if (!shared && user) {
        try {
          localStorage.setItem(
            `crease-feature-offline:${user.id}`,
            JSON.stringify({ offline: result.offline }),
          );
        } catch {
          /* In-memory access remains usable. */
        }
      }
      return result;
    },
    enabled: shared || !!user,
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });
  let cached = DISABLED;
  if (!shared && user && !navigator.onLine) {
    try {
      if (
        JSON.parse(localStorage.getItem(`crease-feature-offline:${user.id}`) ?? "{}").offline ===
        true
      )
        cached = { ...DISABLED, offline: true };
    } catch {
      /* No verified permission. */
    }
  }
  const access =
    !shared && ready && !user
      ? ENABLED
      : query.isError && navigator.onLine
        ? DISABLED
        : (query.data ?? cached);
  return { ...query, access, allows: (feature: FeatureId) => access[feature] };
}
export async function featureDetails(target: string): Promise<FeatureRow[]> {
  const { data, error } = await supabase.rpc("platform_feature_details", { _target: target });
  if (error) throw error;
  return data as unknown as FeatureRow[];
}
export async function saveFeatures(target: string, values: Partial<FeatureAccess>, reset = false) {
  const { error } = await supabase.rpc("platform_save_features", {
    _target: target,
    _values: values,
    _reset: reset,
  });
  if (error) throw error;
}
