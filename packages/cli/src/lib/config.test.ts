/**
 * Tests for the unified config loader (lib/config.ts).
 */

import { test, expect } from "vitest";
import { join, resolve } from "node:path";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  type GlubeanConfigInput,
  loadConfig,
  mergeConfigInputs,
  mergeRunOptions,
  readSingleConfig,
  RUN_DEFAULTS,
} from "./config.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function withTempDir(
  files: Record<string, string>,
  fn: (dir: string) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "glubean-config-test-"));
  try {
    for (const [name, content] of Object.entries(files)) {
      const filePath = resolve(dir, name);
      const parentDir = filePath.substring(0, filePath.lastIndexOf("/"));
      await mkdir(parentDir, { recursive: true });
      await writeFile(filePath, content, "utf-8");
    }
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// readSingleConfig
// ═════════════════════════════════════════════════════════════════════════════

test("readSingleConfig: plain JSON file", async () => {
  await withTempDir(
    {
      "my-config.json": JSON.stringify({
        run: { verbose: true, pretty: false },
        redaction: { replacementFormat: "labeled" },
      }),
    },
    async (dir) => {
      const config = await readSingleConfig(resolve(dir, "my-config.json"));
      expect(config.run?.verbose).toBe(true);
      expect(config.run?.pretty).toBe(false);
      expect(config.redaction?.replacementFormat).toBe("labeled");
    },
  );
});

test("readSingleConfig: package.json extracts glubean field", async () => {
  await withTempDir(
    {
      "package.json": JSON.stringify({
        name: "test-project",
        dependencies: {},
        glubean: {
          run: { emitFullTrace: true },
          redaction: {
            sensitiveKeys: ["x-custom-key"],
          },
        },
      }),
    },
    async (dir) => {
      const config = await readSingleConfig(resolve(dir, "package.json"));
      expect(config.run?.emitFullTrace).toBe(true);
      expect(config.redaction?.sensitiveKeys).toEqual([
        "x-custom-key",
      ]);
    },
  );
});

test("readSingleConfig: package.json without glubean field returns empty", async () => {
  await withTempDir(
    {
      "package.json": JSON.stringify({
        name: "test-project",
        dependencies: {},
      }),
    },
    async (dir) => {
      const config = await readSingleConfig(resolve(dir, "package.json"));
      expect(config).toEqual({});
    },
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// mergeConfigInputs
// ═════════════════════════════════════════════════════════════════════════════

test("mergeConfigInputs: scalar override (right wins)", () => {
  const base: GlubeanConfigInput = {
    run: { verbose: false, pretty: true },
    redaction: { replacementFormat: "simple" },
  };
  const overlay: GlubeanConfigInput = {
    run: { verbose: true },
    redaction: { replacementFormat: "labeled" },
  };
  const merged = mergeConfigInputs(base, overlay);
  expect(merged.run?.verbose).toBe(true);
  expect(merged.run?.pretty).toBe(true); // kept from base
  expect(merged.redaction?.replacementFormat).toBe("labeled");
});

test("mergeConfigInputs: arrays concatenate", () => {
  const base: GlubeanConfigInput = {
    redaction: {
      sensitiveKeys: ["key-a"],
      customPatterns: [{ name: "pat-a", regex: "a+" }],
    },
  };
  const overlay: GlubeanConfigInput = {
    redaction: {
      sensitiveKeys: ["key-b"],
      customPatterns: [{ name: "pat-b", regex: "b+" }],
    },
  };
  const merged = mergeConfigInputs(base, overlay);
  expect(merged.redaction?.sensitiveKeys).toEqual(["key-a", "key-b"]);
  expect(merged.redaction?.customPatterns?.length).toBe(2);
  expect(merged.redaction?.customPatterns?.[0].name).toBe("pat-a");
  expect(merged.redaction?.customPatterns?.[1].name).toBe("pat-b");
});

test("mergeConfigInputs: empty inputs produce empty", () => {
  const merged = mergeConfigInputs({}, {});
  expect(merged.run).toBeUndefined();
  expect(merged.redaction).toBeUndefined();
});

// ═════════════════════════════════════════════════════════════════════════════
// loadConfig
// ═════════════════════════════════════════════════════════════════════════════

test("loadConfig: auto-reads package.json glubean field", async () => {
  await withTempDir(
    {
      "package.json": JSON.stringify({
        name: "test",
        glubean: {
          run: { verbose: true, pretty: false },
        },
      }),
    },
    async (dir) => {
      const config = await loadConfig(dir);
      expect(config.run.verbose).toBe(true);
      expect(config.run.pretty).toBe(false);
      // Defaults still applied for unspecified fields
      expect(config.run.logFile).toBe(RUN_DEFAULTS.logFile);
      expect(config.run.emitFullTrace).toBe(RUN_DEFAULTS.emitFullTrace);
    },
  );
});

test("loadConfig: no package.json returns defaults", async () => {
  await withTempDir({}, async (dir) => {
    const config = await loadConfig(dir);
    expect(config.run).toEqual({ ...RUN_DEFAULTS });
    // Redaction should be the default config
    expect(config.redaction.replacementFormat).toBe("partial");
    expect(config.redaction.scopes.length).toBeGreaterThan(0);
  });
});

test("loadConfig: explicit --config skips auto package.json", async () => {
  await withTempDir(
    {
      "package.json": JSON.stringify({
        glubean: { run: { verbose: true } },
      }),
      "ci.json": JSON.stringify({
        run: { pretty: false, failFast: true },
      }),
    },
    async (dir) => {
      const config = await loadConfig(dir, ["ci.json"]);
      expect(config.run.verbose).toBe(false); // default, not from package.json
      expect(config.run.pretty).toBe(false); // from ci.json
      expect(config.run.failFast).toBe(true); // from ci.json
    },
  );
});

test("loadConfig: --config with package.json in list (explicit)", async () => {
  await withTempDir(
    {
      "package.json": JSON.stringify({
        name: "test",
        glubean: {
          run: { verbose: true, pretty: true },
          redaction: {
            sensitiveKeys: ["x-api-key"],
          },
        },
      }),
      "staging.json": JSON.stringify({
        run: { verbose: false },
        redaction: {
          sensitiveKeys: ["x-staging-key"],
        },
      }),
    },
    async (dir) => {
      const config = await loadConfig(dir, ["package.json", "staging.json"]);
      expect(config.run.verbose).toBe(false); // staging overrides
      expect(config.run.pretty).toBe(true); // from package.json, not overridden
      expect(
        config.redaction.globalRules.sensitiveKeys.includes("x-api-key"),
      ).toBe(true);
      expect(
        config.redaction.globalRules.sensitiveKeys.includes("x-staging-key"),
      ).toBe(true);
    },
  );
});

test("loadConfig: multi-file merge left to right", async () => {
  await withTempDir(
    {
      "base.json": JSON.stringify({
        run: { verbose: false, pretty: true, failFast: false },
      }),
      "env.json": JSON.stringify({
        run: { verbose: true },
      }),
      "override.json": JSON.stringify({
        run: { failFast: true },
      }),
    },
    async (dir) => {
      const config = await loadConfig(dir, [
        "base.json",
        "env.json",
        "override.json",
      ]);
      expect(config.run.verbose).toBe(true); // from env.json
      expect(config.run.pretty).toBe(true); // from base.json
      expect(config.run.failFast).toBe(true); // from override.json
    },
  );
});

test("loadConfig: missing config file shows warning", async () => {
  await withTempDir({}, async (dir) => {
    const config = await loadConfig(dir, ["nonexistent.json"]);
    expect(config.run).toEqual({ ...RUN_DEFAULTS });
  });
});

test("loadConfig: redaction custom patterns accumulate across files", async () => {
  await withTempDir(
    {
      "a.json": JSON.stringify({
        redaction: {
          customPatterns: [{ name: "pat-a", regex: "aaa" }],
        },
      }),
      "b.json": JSON.stringify({
        redaction: {
          customPatterns: [{ name: "pat-b", regex: "bbb" }],
        },
      }),
    },
    async (dir) => {
      const config = await loadConfig(dir, ["a.json", "b.json"]);
      const customNames = config.redaction.globalRules.customPatterns.map((p: any) => p.name);
      expect(customNames).toContain("pat-a");
      expect(customNames).toContain("pat-b");
    },
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// redaction v2 integration
// ═════════════════════════════════════════════════════════════════════════════

test("resolved redaction config compiles and redacts correctly", async () => {
  const { compileScopes, redactEvent, BUILTIN_SCOPES } = await import("@glubean/redaction");

  await withTempDir(
    {
      "package.json": JSON.stringify({
        glubean: {
          redaction: {
            sensitiveKeys: ["x-custom-secret"],
          },
        },
      }),
    },
    async (dir) => {
      const config = await loadConfig(dir);

      // Compile scopes from resolved config
      const compiled = compileScopes({
        builtinScopes: BUILTIN_SCOPES,
        globalRules: config.redaction.globalRules,
        replacementFormat: config.redaction.replacementFormat,
      });

      // Trace event with sensitive data
      const event = {
        type: "trace",
        data: {
          requestHeaders: { authorization: "Bearer secret-token-12345" },
          requestBody: { "x-custom-secret": "hidden", username: "alice" },
        },
      };

      const redacted = redactEvent(event, compiled, config.redaction.replacementFormat);
      const data = redacted.data as Record<string, unknown>;

      // Built-in scope key (authorization in http.request.headers)
      const headers = data.requestHeaders as Record<string, unknown>;
      expect(headers.authorization).not.toBe("Bearer secret-token-12345");

      // User-added global key (x-custom-secret in http.request.body)
      const body = data.requestBody as Record<string, unknown>;
      expect(body["x-custom-secret"]).not.toBe("hidden");
      expect(body.username).toBe("alice");
    },
  );
});

test("resolved redaction config applies custom patterns", async () => {
  const { compileScopes, redactEvent, BUILTIN_SCOPES } = await import("@glubean/redaction");

  await withTempDir(
    {
      "config.json": JSON.stringify({
        redaction: {
          customPatterns: [{ name: "internal-id", regex: "INT-[A-Z0-9]{8}" }],
        },
      }),
    },
    async (dir) => {
      const config = await loadConfig(dir, ["config.json"]);

      const compiled = compileScopes({
        builtinScopes: BUILTIN_SCOPES,
        globalRules: config.redaction.globalRules,
        replacementFormat: config.redaction.replacementFormat,
      });

      const event = {
        type: "log",
        message: "Processing INT-ABCD1234 for user",
      };

      const redacted = redactEvent(event, compiled, config.redaction.replacementFormat);
      expect(redacted.message).not.toContain("INT-ABCD1234");
    },
  );
});

test("redactEvent passes through non-matching event types", async () => {
  const { compileScopes, redactEvent, BUILTIN_SCOPES } = await import("@glubean/redaction");

  const config = await loadConfig(process.cwd());
  const compiled = compileScopes({
    builtinScopes: BUILTIN_SCOPES,
    globalRules: config.redaction.globalRules,
    replacementFormat: config.redaction.replacementFormat,
  });

  const event = { type: "metric", name: "duration", value: 42 };
  const result = redactEvent(event, compiled, config.redaction.replacementFormat);
  expect(result).toBe(event); // same reference, no clone
});

test("redactEvent does not mutate original event", async () => {
  const { compileScopes, redactEvent, BUILTIN_SCOPES } = await import("@glubean/redaction");

  const config = await loadConfig(process.cwd());
  const compiled = compileScopes({
    builtinScopes: BUILTIN_SCOPES,
    globalRules: config.redaction.globalRules,
    replacementFormat: config.redaction.replacementFormat,
  });

  const event = {
    type: "trace",
    data: {
      requestHeaders: { authorization: "Bearer secret" },
    },
  };

  redactEvent(event, compiled, config.redaction.replacementFormat);
  expect((event.data.requestHeaders as any).authorization).toBe("Bearer secret");
});

// ═════════════════════════════════════════════════════════════════════════════
// mergeRunOptions
// ═════════════════════════════════════════════════════════════════════════════

test("mergeRunOptions: CLI flags override config", () => {
  const config = { ...RUN_DEFAULTS, verbose: false, pretty: true };
  const result = mergeRunOptions(config, {
    verbose: true,
    pretty: false,
  });
  expect(result.verbose).toBe(true);
  expect(result.pretty).toBe(false);
  expect(result.logFile).toBe(RUN_DEFAULTS.logFile);
  expect(result.emitFullTrace).toBe(RUN_DEFAULTS.emitFullTrace);
});

test("mergeRunOptions: undefined CLI flags preserve config", () => {
  const config = {
    ...RUN_DEFAULTS,
    verbose: true,
    pretty: false,
    failFast: true,
  };
  const result = mergeRunOptions(config, {});
  expect(result.verbose).toBe(true);
  expect(result.pretty).toBe(false);
  expect(result.failFast).toBe(true);
});

test("mergeRunOptions: failAfter number", () => {
  const result = mergeRunOptions(RUN_DEFAULTS, { failAfter: 5 });
  expect(result.failAfter).toBe(5);
});

test("mergeRunOptions: envFile override", () => {
  const result = mergeRunOptions(RUN_DEFAULTS, { envFile: ".env.staging" });
  expect(result.envFile).toBe(".env.staging");
});

// ═════════════════════════════════════════════════════════════════════════════
// cloud config
// ═════════════════════════════════════════════════════════════════════════════

test("loadConfig: cloud section from package.json", async () => {
  await withTempDir(
    {
      "package.json": JSON.stringify({
        glubean: {
          cloud: { projectId: "proj_abc", apiUrl: "https://custom.api.com" },
        },
      }),
    },
    async (dir) => {
      const config = await loadConfig(dir);
      expect(config.cloud?.projectId).toBe("proj_abc");
      expect(config.cloud?.apiUrl).toBe("https://custom.api.com");
    },
  );
});

test("mergeConfigInputs: cloud section merges", () => {
  const base: GlubeanConfigInput = {
    cloud: { projectId: "proj_a" },
  };
  const overlay: GlubeanConfigInput = {
    cloud: { apiUrl: "https://overlay.api.com" },
  };
  const merged = mergeConfigInputs(base, overlay);
  expect(merged.cloud?.projectId).toBe("proj_a");
  expect(merged.cloud?.apiUrl).toBe("https://overlay.api.com");
});
