import type { TimelineEvent } from "./executor.js";
export type { TimelineEvent } from "./executor.js";

/**
 * Derive whether a test failed from its timeline events.
 * - Step tests: any step_end with status "failed" → failure.
 * - Simple tests: any assertion with passed=false → failure.
 * Returns true if the test should be marked as failed.
 */
export function deriveFailureFromEvents(events: TimelineEvent[]): boolean {
  const stepEnds = events.filter(
    (e): e is Extract<TimelineEvent, { type: "step_end" }> => e.type === "step_end",
  );
  if (stepEnds.length > 0) {
    return stepEnds.some((e) => e.status === "failed");
  }
  return events.some(
    (e): e is Extract<TimelineEvent, { type: "assertion" }> => e.type === "assertion" && !e.passed,
  );
}
