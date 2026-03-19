import { describe, test, expect } from "vitest";
import { deriveFailureFromEvents, type TimelineEvent } from "./derive_failure.js";

describe("deriveFailureFromEvents", () => {
  // --- Simple tests (no steps) ---

  test("no events → no failure", () => {
    expect(deriveFailureFromEvents([])).toBe(false);
  });

  test("all assertions passed → no failure", () => {
    const events: TimelineEvent[] = [
      { type: "assertion", ts: 1, passed: true, message: "ok" },
      { type: "assertion", ts: 2, passed: true, message: "ok2" },
    ];
    expect(deriveFailureFromEvents(events)).toBe(false);
  });

  test("one assertion failed → failure", () => {
    const events: TimelineEvent[] = [
      { type: "assertion", ts: 1, passed: true, message: "ok" },
      { type: "assertion", ts: 2, passed: false, message: "expected 0 >= 1" },
    ];
    expect(deriveFailureFromEvents(events)).toBe(true);
  });

  test("only failed assertions → failure", () => {
    const events: TimelineEvent[] = [
      { type: "assertion", ts: 1, passed: false, message: "fail1" },
      { type: "assertion", ts: 2, passed: false, message: "fail2" },
    ];
    expect(deriveFailureFromEvents(events)).toBe(true);
  });

  test("non-assertion events only → no failure", () => {
    const events: TimelineEvent[] = [
      { type: "log", ts: 1, message: "hello" },
      { type: "metric", ts: 2, name: "http_duration_ms", value: 100 },
    ];
    expect(deriveFailureFromEvents(events)).toBe(false);
  });

  test("schema validation failure via assertion → failure", () => {
    const events: TimelineEvent[] = [
      { type: "schema_validation", ts: 1, label: "test", success: false, severity: "error" },
      { type: "assertion", ts: 2, passed: false, message: "Schema validation failed: test" },
    ];
    expect(deriveFailureFromEvents(events)).toBe(true);
  });

  // --- Step tests ---

  test("all steps passed → no failure", () => {
    const events: TimelineEvent[] = [
      { type: "step_start", ts: 1, index: 0, name: "step1", total: 2 },
      { type: "step_end", ts: 2, index: 0, name: "step1", status: "passed", durationMs: 100, assertions: 1, failedAssertions: 0 },
      { type: "step_start", ts: 3, index: 1, name: "step2", total: 2 },
      { type: "step_end", ts: 4, index: 1, name: "step2", status: "passed", durationMs: 100, assertions: 1, failedAssertions: 0 },
    ];
    expect(deriveFailureFromEvents(events)).toBe(false);
  });

  test("one step failed → failure", () => {
    const events: TimelineEvent[] = [
      { type: "step_end", ts: 1, index: 0, name: "step1", status: "passed", durationMs: 100, assertions: 1, failedAssertions: 0 },
      { type: "step_end", ts: 2, index: 1, name: "step2", status: "failed", durationMs: 100, assertions: 1, failedAssertions: 1 },
    ];
    expect(deriveFailureFromEvents(events)).toBe(true);
  });

  test("step retry success — step_end passed despite intermediate assertion failures", () => {
    // Retry scenario: first attempt fails, second succeeds.
    // Events include both attempts' assertions, but step_end is "passed".
    const events: TimelineEvent[] = [
      { type: "assertion", ts: 1, passed: false, message: "attempt 1 fail", stepIndex: 0 },
      { type: "assertion", ts: 2, passed: true, message: "attempt 2 pass", stepIndex: 0 },
      { type: "step_end", ts: 3, index: 0, name: "flaky", status: "passed", durationMs: 200, assertions: 1, failedAssertions: 0, attempts: 2, retriesUsed: 1 },
    ];
    // step_end says passed → no failure (intermediate assertion failures are from retried attempt)
    expect(deriveFailureFromEvents(events)).toBe(false);
  });

  test("step skipped → no failure", () => {
    const events: TimelineEvent[] = [
      { type: "step_end", ts: 1, index: 0, name: "step1", status: "passed", durationMs: 100, assertions: 0, failedAssertions: 0 },
      { type: "step_end", ts: 2, index: 1, name: "step2", status: "skipped", durationMs: 0, assertions: 0, failedAssertions: 0 },
    ];
    expect(deriveFailureFromEvents(events)).toBe(false);
  });
});
