import { generateFixtures, type FixtureContext, type ScheduleMode } from "./fixture-generator";
self.onmessage = (
  event: MessageEvent<{ context: FixtureContext; mode: ScheduleMode; target: number }>,
) => {
  try {
    self.postMessage({
      result: generateFixtures(event.data.context, event.data.mode, event.data.target),
    });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "Could not generate fixtures.",
    });
  }
};
