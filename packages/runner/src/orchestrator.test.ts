import { describe, it, expect } from "vitest";
import {
  buildExecutionOrder,
  collectSessionUpdates,
  discoverSessionFile,
} from "./orchestrator.js";
import type { ExecutionEvent } from "./executor.js";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("discoverSessionFile", () => {
  it("finds session.ts in root dir", () => {
    const dir = mkdtempSync(join(tmpdir(), "glubean-session-"));
    writeFileSync(join(dir, "session.ts"), "export default {}");
    try {
      const result = discoverSessionFile(dir);
      expect(result).toBe(join(dir, "session.ts"));
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("finds session.setup.ts as fallback", () => {
    const dir = mkdtempSync(join(tmpdir(), "glubean-session-"));
    writeFileSync(join(dir, "session.setup.ts"), "export default {}");
    try {
      const result = discoverSessionFile(dir);
      expect(result).toBe(join(dir, "session.setup.ts"));
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("prefers session.ts over session.setup.ts", () => {
    const dir = mkdtempSync(join(tmpdir(), "glubean-session-"));
    writeFileSync(join(dir, "session.ts"), "export default {}");
    writeFileSync(join(dir, "session.setup.ts"), "export default {}");
    try {
      const result = discoverSessionFile(dir);
      expect(result).toBe(join(dir, "session.ts"));
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("returns undefined when no session file exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "glubean-session-"));
    try {
      const result = discoverSessionFile(dir);
      expect(result).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});

describe("buildExecutionOrder", () => {
  it("returns single level for independent files", () => {
    const levels = buildExecutionOrder([
      { filePath: "/a.test.ts", dependsOn: [] },
      { filePath: "/b.test.ts", dependsOn: [] },
      { filePath: "/c.test.ts", dependsOn: [] },
    ]);
    expect(levels).toHaveLength(1);
    expect(levels[0]).toHaveLength(3);
  });

  it("orders files by dependency chain", () => {
    const levels = buildExecutionOrder([
      { filePath: "/setup.test.ts", dependsOn: [] },
      { filePath: "/orders.test.ts", dependsOn: ["setup.test.ts"] },
      { filePath: "/billing.test.ts", dependsOn: ["orders.test.ts"] },
    ]);
    expect(levels).toHaveLength(3);
    expect(levels[0]).toEqual(["/setup.test.ts"]);
    expect(levels[1]).toEqual(["/orders.test.ts"]);
    expect(levels[2]).toEqual(["/billing.test.ts"]);
  });

  it("allows parallel independent files with shared dependency", () => {
    const levels = buildExecutionOrder([
      { filePath: "/setup.test.ts", dependsOn: [] },
      { filePath: "/users.test.ts", dependsOn: ["setup.test.ts"] },
      { filePath: "/orders.test.ts", dependsOn: ["setup.test.ts"] },
    ]);
    expect(levels).toHaveLength(2);
    expect(levels[0]).toEqual(["/setup.test.ts"]);
    expect(levels[1]).toContain("/users.test.ts");
    expect(levels[1]).toContain("/orders.test.ts");
  });

  it("throws on circular dependency", () => {
    expect(() =>
      buildExecutionOrder([
        { filePath: "/a.test.ts", dependsOn: ["b.test.ts"] },
        { filePath: "/b.test.ts", dependsOn: ["a.test.ts"] },
      ]),
    ).toThrow("Circular dependency");
  });

  it("throws on unknown dependency", () => {
    expect(() =>
      buildExecutionOrder([
        { filePath: "/a.test.ts", dependsOn: ["nonexistent.test.ts"] },
      ]),
    ).toThrow("does not match any discovered test file");
  });
});

describe("collectSessionUpdates", () => {
  it("extracts session:set events and accumulates state", () => {
    const state: Record<string, string> = {};
    const events: ExecutionEvent[] = [
      { type: "log", message: "hello" },
      { type: "session:set", key: "token", value: "abc", ts: 1 },
      { type: "assertion", passed: true, message: "ok" },
      { type: "session:set", key: "userId", value: "42", ts: 2 },
    ];

    const filtered = collectSessionUpdates(events, state);

    expect(state).toEqual({ token: "abc", userId: "42" });
    expect(filtered).toHaveLength(2);
    expect(filtered[0]).toEqual({ type: "log", message: "hello" });
    expect(filtered[1]).toEqual({
      type: "assertion",
      passed: true,
      message: "ok",
    });
  });

  it("handles empty events", () => {
    const state: Record<string, string> = {};
    const filtered = collectSessionUpdates([], state);
    expect(filtered).toHaveLength(0);
    expect(state).toEqual({});
  });

  it("overwrites existing keys", () => {
    const state: Record<string, string> = { token: "old" };
    const events: ExecutionEvent[] = [
      { type: "session:set", key: "token", value: "new", ts: 1 },
    ];

    collectSessionUpdates(events, state);
    expect(state.token).toBe("new");
  });
});
