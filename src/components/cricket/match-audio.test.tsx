import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MatchAudio } from "./match-audio";
import { AUDIO_KEY } from "@/lib/cricket/match-audio";
vi.mock("@/lib/cricket/match-audio", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cricket/match-audio")>()),
  localTrack: vi.fn().mockResolvedValue(null),
}));
let audio: {
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  currentTime: number;
  loop: boolean;
  src: string;
};
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  vi.useFakeTimers();
  localStorage.clear();
  localStorage.setItem(AUDIO_KEY, "true");
  vi.stubGlobal(
    "Audio",
    class {
      play = vi.fn().mockResolvedValue(undefined);
      pause = vi.fn();
      currentTime = 0;
      loop = false;
      constructor(public src: string) {
        audio = this;
      }
    },
  );
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:test"), revokeObjectURL: vi.fn() });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function mount(settings = false) {
  const result = render(<MatchAudio settings={settings} />);
  await act(async () => {});
  return result;
}
async function play() {
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Play horn" })));
}
it("never autoplays, loops on demand, and stops at 90 seconds", async () => {
  await mount();
  expect(audio.play).not.toHaveBeenCalled();
  expect(audio.loop).toBe(true);
  expect(audio.src).toBe("/audio/ipl-horn.mp3");
  await play();
  expect(screen.getByRole("timer")).toHaveTextContent("1:30");
  act(() => vi.advanceTimersByTime(89000));
  expect(screen.getByRole("timer")).toHaveTextContent("0:01");
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  expect(audio.pause).toHaveBeenCalled();
  expect(audio.currentTime).toBe(0);
});
it("stops immediately and cleans up when leaving the scorer", async () => {
  const view = await mount();
  await play();
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  expect(vi.getTimerCount()).toBe(0);
  await play();
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
  expect(audio.pause).toHaveBeenCalled();
});
it("hides the scorer control when disabled and stops playback when disabled in settings", async () => {
  localStorage.setItem(AUDIO_KEY, "false");
  const view = await mount();
  expect(screen.queryByRole("button", { name: "Play horn" })).not.toBeInTheDocument();
  view.unmount();
  localStorage.setItem(AUDIO_KEY, "true");
  await mount(true);
  await play();
  await act(async () => fireEvent.click(screen.getByRole("checkbox")));
  expect(localStorage.getItem(AUDIO_KEY)).toBe("false");
  expect(screen.queryByRole("timer")).not.toBeInTheDocument();
});
