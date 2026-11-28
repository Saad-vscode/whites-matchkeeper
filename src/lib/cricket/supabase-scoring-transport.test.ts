import { beforeEach, expect, it, vi } from "vitest";
import { deliveryFixture, matchFixture } from "@/test/tournament-fixtures";
import type { ScoreOperation } from "./offline";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
import { supabaseScoringTransport as transport } from "./supabase-scoring-transport";

const snapshot = { match: matchFixture({ score_revision: 7 }), deliveries: [deliveryFixture()] };
beforeEach(() => { rpc.mockReset(); });

it("uses the exact snapshot RPC and returns the unmodified snapshot", async () => {
  rpc.mockResolvedValue({ data: snapshot, error: null });
  const response = await transport.readSnapshot("match-id");
  expect(rpc).toHaveBeenCalledExactlyOnceWith("scoring_snapshot", { _match: "match-id" });
  expect(response).toEqual({ data: snapshot, error: null });
  expect(response.data).toBe(snapshot);
});

it.each(["ball", "undo", "edit", "state"] as const)("preserves the exact %s operation payload", async (kind) => {
  const operation: ScoreOperation = {
    id: "original-operation-id", kind, delivery: kind === "state" ? null : deliveryFixture(),
    patch: { live: { innings: 1, striker: "Alex" }, status: "live" }, reason: "scorer reason",
  };
  rpc.mockResolvedValue({ data: snapshot, error: null });
  const response = await transport.applyOperation("match-id", 6, operation);
  expect(rpc).toHaveBeenCalledExactlyOnceWith("apply_score_operation", {
    _match: "match-id", _id: "original-operation-id", _expected: 6, _kind: kind,
    _delivery: operation.delivery ?? {}, _patch: operation.patch, _reason: "scorer reason",
  });
  expect(response.data).toBe(snapshot);
  expect(operation.id).toBe("original-operation-id");
});

it.each(["read", "apply"])("preserves backend error identity and fields for %s", async (method) => {
  const error = { message: "SCORE_CONFLICT", code: "23505", details: "revision changed", hint: "reload" };
  rpc.mockResolvedValue({ data: null, error });
  const response = method === "read" ? await transport.readSnapshot("match") :
    await transport.applyOperation("match", 0, { id: "op", kind: "state", delivery: null, patch: {}, reason: "" });
  expect(response.error).toBe(error);
  expect(response.data).toBeNull();
});

it("does not catch or replace a rejected network request", async () => {
  const error = new Error("Network disconnected");
  rpc.mockRejectedValue(error);
  await expect(transport.readSnapshot("match")).rejects.toBe(error);
});
