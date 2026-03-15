import { test, expect, afterAll, beforeAll } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import { TestExecutor } from "./executor.js";
import type { ExecutionEvent } from "./executor.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const RUNNER_ROOT = resolve(__dirname, "..");
const TMP_DIR = join(RUNNER_ROOT, ".tmp-session-test");
let tmpSeq = 0;

beforeAll(async () => {
  await rm(TMP_DIR, { recursive: true, force: true }).catch(() => {});
  await mkdir(TMP_DIR, { recursive: true });
});

afterAll(async () => {
  await rm(TMP_DIR, { recursive: true, force: true }).catch(() => {});
});

async function makeTempDir(): Promise<string> {
  const dir = join(TMP_DIR, String(tmpSeq++));
  await mkdir(dir, { recursive: true });
  return dir;
}

function createExecutor(): TestExecutor {
  return TestExecutor.fromSharedConfig(
    {
      failFast: false,
      timeoutMs: 10_000,
      emitFullTrace: false,
    },
    { cwd: RUNNER_ROOT },
  );
}

async function collectEvents(
  executor: TestExecutor,
  fileUrl: string,
  testId: string,
  context: Record<string, unknown>,
): Promise<ExecutionEvent[]> {
  const events: ExecutionEvent[] = [];
  for await (const event of executor.run(fileUrl, testId, context as any)) {
    events.push(event);
  }
  return events;
}

// ── Session setup execution ──────────────────────────────────────────────────

test("session setup: calls setup() and emits session:set events", async () => {
  const dir = await makeTempDir();
  const sessionFile = join(dir, "session.ts");
  await writeFile(
    sessionFile,
    `
import { defineSession } from "@glubean/sdk";

export default defineSession({
  async setup(ctx) {
    ctx.session.set("token", "abc123");
    ctx.session.set("userId", "42");
    ctx.log("session setup done");
  },
});
`,
  );

  const executor = createExecutor();
  const events = await collectEvents(
    executor,
    pathToFileURL(sessionFile).href,
    "__session__",
    { vars: {}, secrets: {}, session: {}, sessionMode: "setup" },
  );

  // Should have session:set events
  const sessionSets = events.filter((e) => e.type === "session:set");
  expect(sessionSets).toHaveLength(2);
  expect(sessionSets[0]).toMatchObject({ key: "token", value: "abc123" });
  expect(sessionSets[1]).toMatchObject({ key: "userId", value: "42" });

  // Should have completed status
  const statuses = events.filter((e) => e.type === "status");
  expect(statuses).toContainEqual(
    expect.objectContaining({ status: "completed" }),
  );
}, 15_000);

test("session setup: fails with clear error when default export missing", async () => {
  const dir = await makeTempDir();
  const sessionFile = join(dir, "session.ts");
  await writeFile(sessionFile, `export const foo = 42;`);

  const executor = createExecutor();
  const events = await collectEvents(
    executor,
    pathToFileURL(sessionFile).href,
    "__session__",
    { vars: {}, secrets: {}, session: {}, sessionMode: "setup" },
  );

  const statuses = events.filter((e) => e.type === "status");
  expect(statuses).toContainEqual(
    expect.objectContaining({
      status: "failed",
      error: expect.stringContaining("SessionDefinition"),
    }),
  );
}, 15_000);

test("session setup: setup error emits failed status", async () => {
  const dir = await makeTempDir();
  const sessionFile = join(dir, "session.ts");
  await writeFile(
    sessionFile,
    `
import { defineSession } from "@glubean/sdk";

export default defineSession({
  async setup() {
    throw new Error("auth server down");
  },
});
`,
  );

  const executor = createExecutor();
  const events = await collectEvents(
    executor,
    pathToFileURL(sessionFile).href,
    "__session__",
    { vars: {}, secrets: {}, session: {}, sessionMode: "setup" },
  );

  const statuses = events.filter((e) => e.type === "status");
  expect(statuses).toContainEqual(
    expect.objectContaining({
      status: "failed",
      error: "auth server down",
    }),
  );
}, 15_000);

// ── Session teardown execution ───────────────────────────────────────────────

test("session teardown: calls teardown() with accumulated state", async () => {
  const dir = await makeTempDir();
  const sessionFile = join(dir, "session.ts");
  await writeFile(
    sessionFile,
    `
import { defineSession } from "@glubean/sdk";

export default defineSession({
  async setup(ctx) {
    ctx.session.set("token", "will-be-overridden");
  },
  async teardown(ctx) {
    ctx.log("teardown-token:" + ctx.session.get("token"));
  },
});
`,
  );

  const executor = createExecutor();
  const events = await collectEvents(
    executor,
    pathToFileURL(sessionFile).href,
    "__session__",
    {
      vars: {},
      secrets: {},
      session: { token: "final-value" },
      sessionMode: "teardown",
    },
  );

  const logs = events.filter(
    (e) => e.type === "log" && e.message.includes("teardown-token:"),
  );
  expect(logs).toHaveLength(1);
  expect((logs[0] as any).message).toBe("teardown-token:final-value");

  const statuses = events.filter((e) => e.type === "status");
  expect(statuses).toContainEqual(
    expect.objectContaining({ status: "completed" }),
  );
}, 15_000);

// ── Session + test integration ───────────────────────────────────────────────

test("test receives session state via context injection", async () => {
  const dir = await makeTempDir();
  const testFile = join(dir, "api.test.ts");
  await writeFile(
    testFile,
    `
import { test } from "@glubean/sdk";

export const checkSession = test("check-session", async (ctx) => {
  const token = ctx.session.require("token");
  ctx.assert(token === "abc123", "token should match");
  ctx.log("got-token:" + token);
});
`,
  );

  const executor = createExecutor();
  const events = await collectEvents(
    executor,
    pathToFileURL(testFile).href,
    "check-session",
    { vars: {}, secrets: {}, session: { token: "abc123" } },
  );

  const assertions = events.filter((e) => e.type === "assertion");
  expect(assertions).toContainEqual(
    expect.objectContaining({ passed: true, message: "token should match" }),
  );

  const statuses = events.filter((e) => e.type === "status");
  expect(statuses).toContainEqual(
    expect.objectContaining({ status: "completed" }),
  );
}, 15_000);

// ── session:set NOT in execute() results ─────────────────────────────────────

test("session:set events are filtered from execute() timeline", async () => {
  const dir = await makeTempDir();
  const testFile = join(dir, "writer.test.ts");
  await writeFile(
    testFile,
    `
import { test } from "@glubean/sdk";

export const writeSession = test("write-session", async (ctx) => {
  ctx.session.set("newKey", "newValue");
  ctx.assert(true, "ok");
});
`,
  );

  const executor = createExecutor();
  const result = await executor.execute(
    pathToFileURL(testFile).href,
    "write-session",
    { vars: {}, secrets: {}, session: {} },
  );

  // execute() returns ExecutionResult with events: TimelineEvent[]
  // session:set should NOT appear in timeline events
  const sessionEvents = result.events.filter(
    (e) => (e as any).type === "session:set",
  );
  expect(sessionEvents).toHaveLength(0);

  // But the test should still pass
  expect(result.success).toBe(true);
}, 15_000);
