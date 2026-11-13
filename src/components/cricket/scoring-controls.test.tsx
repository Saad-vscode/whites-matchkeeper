import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: unknown) => config,
  Link: () => null,
}));
import { SelectPlayers, ExtrasDialog, Scorer, LegacyRunOutCorrection } from "@/routes/_authenticated/score.$matchId";
import { deliveryFixture, matchFixture } from "@/test/tournament-fixtures";
import { derive } from "@/lib/cricket/match";
import type { useScoring } from "@/lib/cricket/use-scoring";
function scorer() {
  const match = matchFixture({
    status: "live",
    live: { innings: 1, striker: "Alex", nonStriker: "Sam", bowler: "Lee" },
  });
  const mutate = vi.fn().mockResolvedValue(true);
  const lm = {
    match,
    derived: derive(match, []),
    deliveries: [],
    mutate,
    pending: 0,
    online: true,
    conflict: false,
  } as unknown as ReturnType<typeof useScoring>;
  render(<Scorer lm={lm} />);
  return mutate;
}
it("records retired hurt through the durable scoring operation without a wicket or ball", () => {
  const mutate = scorer();
  fireEvent.click(screen.getByRole("button", { name: "More" }));
  fireEvent.click(screen.getByRole("button", { name: "Retired hurt · Alex" }));
  expect(mutate).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "ball",
      delivery: expect.objectContaining({
        extra_type: "penalty",
        extras: 0,
        wicket: { kind: "retired_hurt", playerOut: "Alex" },
      }),
      patch: expect.objectContaining({
        live: expect.objectContaining({ striker: null, nonStriker: "Sam" }),
      }),
    }),
  );
});
it("requires confirmation to abandon and keeps the delivery log", () => {
  const mutate = scorer();
  fireEvent.click(screen.getByRole("button", { name: "More" }));
  fireEvent.click(screen.getByRole("button", { name: "Abandon match" }));
  expect(mutate).not.toHaveBeenCalled();
  fireEvent.click(
    within(screen.getByRole("alertdialog")).getByRole("button", { name: "Abandon match" }),
  );
  expect(mutate).toHaveBeenCalledWith({
    kind: "state",
    delivery: null,
    patch: { status: "abandoned" },
    reason: "",
  });
  expect(screen.queryByText("Correct an earlier ball")).not.toBeInTheDocument();
  expect(screen.queryByText("Change history")).not.toBeInTheDocument();
});
afterEach(cleanup);
it("publishes confirmed batters and bowler before Continue or a delivery", async () => {
  const publish = vi.fn().mockResolvedValue(true);
  const save = vi.fn();
  render(<SelectPlayers title="Openers" batting={["Sam", "Alex"]} bowling={["Lee"]} need={{ striker: true, non: true, bowler: true }} out={new Set()} live={{}} eligibility={() => null} onSave={save} onSelection={publish} />);
  fireEvent.click(screen.getByRole("button", { name: "Select batsmen" }));
  fireEvent.click(screen.getByRole("button", { name: "Sam" }));
  fireEvent.click(screen.getByRole("button", { name: "Alex" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm batsmen" }));
  expect(publish).toHaveBeenCalledWith({ striker: "Sam", nonStriker: "Alex" });
  await vi.waitFor(() => expect(screen.getByRole("button", { name: "Select bowler" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Select bowler" }));
  fireEvent.click(screen.getByRole("button", { name: "Lee" }));
  expect(publish).toHaveBeenLastCalledWith({ bowler: "Lee" });
  expect(save).not.toHaveBeenCalled();
});
it("assigns the first picked batter to strike and selects one eligible bowler", () => {
  const save = vi.fn();
  render(
    <SelectPlayers
      title="Openers"
      batting={["Amal", "Bimal", "Chamal"]}
      bowling={["Dilan", "Eshan"]}
      need={{ striker: true, non: true, bowler: true }}
      out={new Set()}
      live={{}}
      eligibility={(name) => (name === "Dilan" ? "Over limit reached" : null)}
      onSave={save}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Select batsmen" }));
  fireEvent.click(screen.getByRole("button", { name: "Bimal" }));
  fireEvent.click(screen.getByRole("button", { name: "Amal" }));
  expect(screen.getByRole("button", { name: "Chamal" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm batsmen" }));
  fireEvent.click(screen.getByRole("button", { name: "Select bowler" }));
  expect(screen.getByRole("button", { name: "Dilan" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Eshan" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(save).toHaveBeenCalledWith({ striker: "Bimal", nonStriker: "Amal", bowler: "Eshan" });
});
it.each(["bye", "legbye"] as const)("offers six quick choices for %s", (kind) => {
  const record = vi.fn();
  render(
    <ExtrasDialog
      kind={kind}
      onClose={vi.fn()}
      cfg={{ wideRuns: 1, noBallRuns: 1 }}
      busy={false}
      onRecord={record}
      live={{}}
      fielders={[]}
    />,
  );
  for (const n of [1, 2, 3, 4, 5, 6])
    expect(screen.getByRole("button", { name: String(n) })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "6" }));
  expect(record).toHaveBeenCalledWith({ extra_type: kind, extras: 6 });
});
it("adds configured wide runs to WD+2", () => {
  const record = vi.fn();
  render(
    <ExtrasDialog
      kind="wide"
      onClose={vi.fn()}
      cfg={{ wideRuns: 2, noBallRuns: 1 }}
      busy={false}
      onRecord={record}
      live={{}}
      fielders={[]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "WD+2" }));
  expect(record).toHaveBeenCalledWith({ extra_type: "wide", extras: 4 });
});
it("records a no-ball with five bat runs and the configured extra", () => {
  const record = vi.fn();
  render(
    <ExtrasDialog
      kind="noball"
      onClose={vi.fn()}
      cfg={{ wideRuns: 1, noBallRuns: 2 }}
      busy={false}
      onRecord={record}
      live={{}}
      fielders={[]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "5" }));
  expect(record).toHaveBeenCalledWith({ extra_type: "noball", extras: 2, runs_bat: 5 });
});
it("shows dismissal choices when Out is opened", () => {
  render(
    <ExtrasDialog
      kind="wicket"
      onClose={vi.fn()}
      cfg={{ wideRuns: 1, noBallRuns: 1 }}
      busy={false}
      onRecord={vi.fn()}
      live={{ striker: "Amal", nonStriker: "Bimal" }}
      fielders={["Dilan"]}
    />,
  );
  const dialog = within(screen.getByRole("dialog"));
  for (const name of ["Bowled", "Caught", "LBW", "Run out", "Stumped", "Hit wicket"])
    expect(dialog.getByRole("button", { name })).toBeInTheDocument();
});
it("records assisted run-outs with distinct fielders for MVP attribution", () => {
  const record = vi.fn();
  render(
    <ExtrasDialog
      kind="wicket"
      onClose={vi.fn()}
      cfg={{ wideRuns: 1, noBallRuns: 1 }}
      busy={false}
      onRecord={record}
      live={{ striker: "Alex", nonStriker: "Sam" }}
      fielders={["Lee", "Kim"]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Run out" }));
  fireEvent.click(screen.getByRole("button", { name: "Alex" }));
  fireEvent.click(screen.getByRole("button", { name: "Lee" }));
  fireEvent.click(screen.getByRole("button", { name: "Assisted" }));
  expect(screen.getByRole("button", { name: "Confirm wicket" })).toBeDisabled();
  const field = screen.getByText("Second fielder").parentElement!;
  fireEvent.click(within(field).getByRole("button", { name: "Kim" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm wicket" }));
  expect(record).toHaveBeenCalledWith({
    runs_bat: 0,
    wicket: {
      kind: "run_out",
      playerOut: "Alex",
      fielder: "Lee",
      runOutType: "assisted",
      assistedBy: "Kim",
    },
  });
});

it("classifies a legacy run-out through an audited edit without changing its runs or order", async () => {
  const match = matchFixture({ status: "completed", team_b_players: ["Lee", "Kim"] });
  const delivery = deliveryFixture({ id: "legacy", seq: 4, runs_bat: 2, wicket: { kind: "run_out", playerOut: "Alex", fielder: "Lee" } });
  const mutate = vi.fn().mockResolvedValue(true);
  const lm = { match, deliveries: [delivery], mutate, pending: 0, conflict: false, online: true, syncing: false } as unknown as ReturnType<typeof useScoring>;
  render(<LegacyRunOutCorrection lm={lm} />);
  fireEvent.change(screen.getByLabelText("Run-out type"), { target: { value: "assisted" } });
  fireEvent.change(screen.getByLabelText("Second fielder"), { target: { value: "Kim" } });
  fireEvent.click(screen.getByRole("button", { name: "Save run-out credit" }));
  await waitFor(() => expect(mutate).toHaveBeenCalledWith({
    kind: "edit", delivery: { ...delivery, wicket: { ...delivery.wicket, runOutType: "assisted", assistedBy: "Kim" } },
    patch: {}, reason: "Classified legacy run-out fielding credit",
  }));
});