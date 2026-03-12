import { test, expect } from "vitest";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildLastRunSummary,
  diagnoseProjectConfig,
  filterLocalDebugEvents,
  type LocalRunSnapshot,
  MCP_TOOL_NAMES,
  toLocalDebugEvents,
} from "./index.js";
import { MCP_PACKAGE_VERSION, DEFAULT_GENERATED_BY } from "./version.js";

test("mcp runtime version constants align with package version", async () => {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const pkg = require("../package.json") as { version: string };
  expect(MCP_PACKAGE_VERSION).toBe(pkg.version);
  expect(DEFAULT_GENERATED_BY).toBe(`@glubean/mcp@${pkg.version}`);
});

test("mcp tool name registry includes all tools", () => {
  const names = Object.values(MCP_TOOL_NAMES);
  expect(names).toContain("glubean_get_last_run_summary");
  expect(names).toContain("glubean_get_local_events");
  expect(names).toContain("glubean_diagnose_config");
  expect(new Set(names).size).toBe(names.length);
});

test("toLocalDebugEvents flattens local run results", () => {
  const snapshot: LocalRunSnapshot = {
    createdAt: "2026-02-19T00:00:00.000Z",
    fileUrl: "file:///tmp/sample.test.ts",
    projectRoot: "/tmp/project",
    summary: { total: 1, passed: 1, failed: 0 },
    includeLogs: true,
    includeTraces: true,
    results: [{
      exportName: "sample",
      id: "sample-test",
      name: "Sample Test",
      success: true,
      durationMs: 25,
      assertions: [{ passed: true, message: "ok" }],
      logs: [{ message: "hello" }],
      traces: [{ method: "GET", url: "https://example.com", status: 200 }],
    }],
  };

  const events = toLocalDebugEvents(snapshot);
  expect(events).toHaveLength(4);
  expect(events[0].type).toBe("result");
  expect(events[1].type).toBe("assertion");
  expect(events[2].type).toBe("log");
  expect(events[3].type).toBe("trace");
  expect(events[3].data).toEqual({
    method: "GET",
    url: "https://example.com",
    status: 200,
  });
});

test("filterLocalDebugEvents applies type/testId/limit", () => {
  const events = [
    { type: "log" as const, testId: "a", exportName: "x", message: "1" },
    { type: "log" as const, testId: "b", exportName: "x", message: "2" },
    { type: "assertion" as const, testId: "a", exportName: "x", message: "3" },
  ];

  const filteredByType = filterLocalDebugEvents([...events], { type: "log" });
  expect(filteredByType).toHaveLength(2);

  const filteredByTest = filterLocalDebugEvents([...events], { testId: "a" });
  expect(filteredByTest).toHaveLength(2);

  const limited = filterLocalDebugEvents([...events], { limit: 1 });
  expect(limited).toHaveLength(1);
});

test("buildLastRunSummary computes event counters", () => {
  const snapshot: LocalRunSnapshot = {
    createdAt: "2026-02-19T00:00:00.000Z",
    fileUrl: "file:///tmp/sample.test.ts",
    projectRoot: "/tmp/project",
    summary: { total: 2, passed: 1, failed: 1 },
    includeLogs: true,
    includeTraces: false,
    results: [
      {
        exportName: "a",
        id: "a",
        success: true,
        durationMs: 10,
        assertions: [{ passed: true, message: "ok" }],
        logs: [{ message: "l1" }],
        traces: [],
      },
      {
        exportName: "b",
        id: "b",
        success: false,
        durationMs: 20,
        assertions: [{ passed: false, message: "bad" }],
        logs: [],
        traces: [],
        error: { message: "boom" },
      },
    ],
  };

  const summary = buildLastRunSummary(snapshot);
  expect(summary.summary).toEqual({ total: 2, passed: 1, failed: 1 });
  expect(summary.eventCounts).toEqual({
    result: 2,
    assertion: 2,
    log: 1,
    trace: 0,
  });
});

test("diagnoseProjectConfig reports missing and present essentials", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mcp-diagnose-"));
  try {
    await writeFile(join(dir, "package.json"), "{}");
    await writeFile(join(dir, ".env"), "BASE_URL=https://api.example.com\n");
    await writeFile(join(dir, ".env.secrets"), "TOKEN=secret\n");
    await mkdir(join(dir, "tests"), { recursive: true });

    const diagnostics = await diagnoseProjectConfig({ dir });
    expect(diagnostics.projectRoot).toBe(dir);
    expect(diagnostics.packageJson.exists).toBe(true);
    expect(diagnostics.envFile.exists).toBe(true);
    expect(diagnostics.envFile.hasBaseUrl).toBe(true);
    expect(diagnostics.secretsFile.exists).toBe(true);
    expect(diagnostics.testsDir.exists).toBe(true);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("diagnoseProjectConfig emits recommendations for missing files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mcp-diagnose-missing-"));
  try {
    await writeFile(join(dir, "package.json"), "{}");

    const diagnostics = await diagnoseProjectConfig({ dir });
    expect(diagnostics.packageJson.exists).toBe(true);
    expect(diagnostics.envFile.exists).toBe(false);
    expect(diagnostics.testsDir.exists).toBe(false);
    expect(diagnostics.exploreDir.exists).toBe(false);
    expect(diagnostics.recommendations.length).toBeGreaterThan(0);
    expect(diagnostics.recommendations).toContain('Missing ".env" file (expected BASE_URL).');
    expect(diagnostics.recommendations).toContain('Create "tests/" or "explore/" to add runnable test files.');
  } finally {
    await rm(dir, { recursive: true });
  }
});
