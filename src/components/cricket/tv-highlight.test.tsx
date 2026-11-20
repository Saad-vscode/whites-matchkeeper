const featureState = vi.hoisted(() => ({ boundaries: true, wickets: true }));
vi.mock("@/lib/feature-access", async (original) => { const module = await original<typeof import("@/lib/feature-access")>(); const access = module.allFeatures(true); return { ...module, useFeatureAccess: () => ({ allows: () => true, access: { ...access, boundaries: featureState.boundaries, wickets: featureState.wickets } }) }; });
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { deliveryFixture } from "@/test/tournament-fixtures";
import { TvHighlights, TvHighlightScene } from "./tv-highlight";

it.each(["four", "six", "winning_four", "winning_six", "triple_six", "duck", "golden_duck", "hat_chance", "hat_trick", "caught", "stumped"] as const)("renders the %s broadcast scene with real player information", (kind) => {
  const view = render(<TvHighlightScene event={{ id: kind, kind, player: "Alex Fernando", detail: "Confirmed event", ...(kind.startsWith("winning_") ? {team: "Eagles"} : {}) }} />);
  expect(screen.getByText("Alex Fernando")).toBeInTheDocument();
  if (["four", "six", "winning_four", "winning_six"].includes(kind)) {
    expect(view.container.querySelectorAll(".umpire-arm")).toHaveLength(2);
    expect(view.container.querySelectorAll(".umpire-elbow")).toHaveLength(2);
    expect(view.container.querySelectorAll(".umpire-wrist")).toHaveLength(2);
  }
  if (kind === "hat_chance" || kind === "hat_trick") expect(view.container.querySelectorAll('.broadcast-wicket-letter')).toHaveLength(kind === "hat_chance" ? 2 : 3);
  if (kind === "duck" || kind === "golden_duck") expect(view.container.querySelectorAll(".duck-step")).toHaveLength(2);
  if (kind.startsWith("winning_")) expect(screen.getByText("Eagles")).toBeInTheDocument();
  if (kind === "stumped") {
    expect(view.container.querySelectorAll(".keeper-standing-stumps rect")).toHaveLength(5);
    expect(view.container.querySelectorAll(".keeper-bail")).toHaveLength(2);
    expect(view.container.querySelector(".dismissal-gloves")).toBeInTheDocument();
  }
  if (kind === "caught") expect(view.container.querySelector(".catch-arms .dismissal-held-ball")).toBeInTheDocument();
});

it.each(["caught", "stumped"] as const)("cancels %s on correction, ignores duplicates and does not replay after reconnect", kind => {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const view=render(<TvHighlights matchId="a" deliveries={[]} conn="live" />);
  const out=deliveryFixture({wicket:{kind,playerOut:"Alex",fielder:"Taylor"}});
  view.rerender(<TvHighlights matchId="a" deliveries={[out]} conn="live" />);
  expect(screen.getByRole("status")).toHaveTextContent(kind === "caught" ? "CAUGHT!" : "STUMPED!");
  act(()=>vi.advanceTimersByTime(1000));
  view.rerender(<TvHighlights matchId="a" deliveries={[{...out}]} conn="live" />);
  act(()=>vi.advanceTimersByTime(1800));
  expect(screen.queryByRole("status")).toBeNull();
  const second={...out,id:"second",seq:2};
  view.rerender(<TvHighlights matchId="a" deliveries={[out,second]} conn="live" />);
  expect(screen.getByRole("status")).toBeInTheDocument();
  view.rerender(<TvHighlights matchId="a" deliveries={[out,{...second,wicket:null}]} conn="live" />);
  expect(screen.queryByRole("status")).toBeNull();
  view.rerender(<TvHighlights matchId="a" deliveries={[out]} conn="live" />);
  view.rerender(<TvHighlights matchId="a" deliveries={[out]} conn="connecting" />);
  view.rerender(<TvHighlights matchId="a" deliveries={[out,second]} conn="live" />);
  expect(screen.queryByRole("status")).toBeNull();
});

it("reports playback completion and silently consumes events while another TV presentation is selected", () => {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const onActiveChange = vi.fn();
  const ball = deliveryFixture({ runs_bat: 6 });
  const view = render(<TvHighlights matchId="a" deliveries={[]} conn="live" onActiveChange={onActiveChange} />);
  view.rerender(<TvHighlights matchId="a" deliveries={[ball]} conn="live" onActiveChange={onActiveChange} />);
  expect(onActiveChange).toHaveBeenLastCalledWith(true);
  act(() => vi.advanceTimersByTime(2800));
  expect(onActiveChange).toHaveBeenLastCalledWith(false);
  const next = deliveryFixture({ id: "next", seq: 2, runs_bat: 4 });
  view.rerender(<TvHighlights matchId="a" deliveries={[ball, next]} conn="live" suppressed onActiveChange={onActiveChange} />);
  view.rerender(<TvHighlights matchId="a" deliveries={[ball, next]} conn="live" onActiveChange={onActiveChange} />);
  expect(screen.queryByRole("status")).toBeNull();
});
afterEach(() => {
  cleanup();
  featureState.boundaries = true;
  featureState.wickets = true;
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it("shows each confirmed boundary for 2.8 seconds and then clears the overlay", () => {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const view = render(<TvHighlights matchId="a" deliveries={[]} conn="live" />);
  const ball = deliveryFixture({ runs_bat: 6 });
  view.rerender(<TvHighlights matchId="a" deliveries={[ball]} conn="live" />);
  expect(screen.getByRole("status")).toHaveAccessibleName("Six · Alex");
  act(() => vi.advanceTimersByTime(2799));
  expect(screen.getByRole("status")).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.queryByRole("status")).toBeNull();
  view.rerender(<TvHighlights matchId="a" deliveries={[{ ...ball }]} conn="live" />);
  expect(screen.queryByRole("status")).toBeNull();
});
it("clears on match changes and never replays existing scores", () => {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const view = render(<TvHighlights matchId="a" deliveries={[]} conn="live" />);
  const ball = deliveryFixture({ runs_bat: 4 });
  view.rerender(<TvHighlights matchId="a" deliveries={[ball]} conn="live" />);
  view.rerender(<TvHighlights matchId="b" deliveries={[ball]} conn="live" />);
  expect(screen.queryByRole("status")).toBeNull();
});
it("draws three separate stumps and two bails for the impact sequence", () => {
  const view = render(
    <TvHighlightScene event={{ id: "w", kind: "wicket", player: "Alex", detail: "bowled" }} />,
  );
  expect(view.container.querySelectorAll(".tv-stump")).toHaveLength(3);
  expect(view.container.querySelectorAll(".tv-bail")).toHaveLength(2);
});
it("cancels an active highlight when its delivery is undone", () => {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const view = render(<TvHighlights matchId="a" deliveries={[]} conn="live" />);
  view.rerender(
    <TvHighlights matchId="a" deliveries={[deliveryFixture({ runs_bat: 4 })]} conn="live" />,
  );
  expect(screen.getByRole("status")).toBeInTheDocument();
  view.rerender(<TvHighlights matchId="a" deliveries={[]} conn="live" />);
  expect(screen.queryByRole("status")).toBeNull();
});
it("plays consecutive events once each rather than restarting the active animation", () => {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const view = render(<TvHighlights matchId="a" deliveries={[]} conn="live" />);
  const four = deliveryFixture({ runs_bat: 4 }),
    six = deliveryFixture({ id: "six", seq: 2, runs_bat: 6 });
  view.rerender(<TvHighlights matchId="a" deliveries={[four]} conn="live" />);
  act(() => vi.advanceTimersByTime(1000));
  view.rerender(<TvHighlights matchId="a" deliveries={[four, six]} conn="live" />);
  expect(screen.getByRole("status")).toHaveAccessibleName("Four · Alex");
  act(() => vi.advanceTimersByTime(1800));
  expect(screen.getByRole("status")).toHaveAccessibleName("Six · Alex");
  act(() => vi.advanceTimersByTime(2800));
  expect(screen.queryByRole("status")).toBeNull();
});

it("cancels a revoked boundary and does not replay it when access returns", () => {
 vi.useFakeTimers(); vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
 const view = render(<TvHighlights matchId="a" deliveries={[]} conn="live" />);
 const ball = deliveryFixture({ runs_bat: 6 });
 view.rerender(<TvHighlights matchId="a" deliveries={[ball]} conn="live" />);
 expect(screen.getByRole("status")).toBeInTheDocument();
 featureState.boundaries = false;
 view.rerender(<TvHighlights matchId="a" deliveries={[ball]} conn="live" />);
 expect(screen.queryByRole("status")).toBeNull();
 featureState.boundaries = true;
 view.rerender(<TvHighlights matchId="a" deliveries={[ball]} conn="live" />);
 expect(screen.queryByRole("status")).toBeNull();
});

it.each(["caught", "stumped"] as const)("blocks %s when wicket animation permission is denied",kind=>{
  vi.spyOn(document,"visibilityState","get").mockReturnValue("visible");
  featureState.wickets=false;
  const view=render(<TvHighlights matchId="a" deliveries={[]} conn="live" />);
  view.rerender(<TvHighlights matchId="a" deliveries={[deliveryFixture({wicket:{kind,playerOut:"Alex"}})]} conn="live" />);
  expect(screen.queryByRole("status")).toBeNull();
});
