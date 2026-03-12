import { test, expect } from "vitest";
import { join } from "node:path";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { loadEnvFile, loadProjectEnv } from "./env.js";

test("loadEnvFile: parses key=value pairs", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "glubean-env-test-"));
  const envPath = join(tmp, ".env");
  await writeFile(envPath, "FOO=bar\nBAZ=qux\n", "utf-8");

  const vars = await loadEnvFile(envPath);
  expect(vars.FOO).toBe("bar");
  expect(vars.BAZ).toBe("qux");

  await rm(tmp, { recursive: true, force: true });
});

test("loadEnvFile: returns empty for missing file", async () => {
  const vars = await loadEnvFile("/nonexistent/.env.nope");
  expect(vars).toEqual({});
});

test("loadProjectEnv: merges .env and .env.secrets", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "glubean-env-test-"));
  await writeFile(join(tmp, ".env"), "A=1\nB=2\n", "utf-8");
  await writeFile(join(tmp, ".env.secrets"), "B=override\nC=3\n", "utf-8");

  const vars = await loadProjectEnv(tmp);
  expect(vars.A).toBe("1");
  expect(vars.B).toBe("override"); // secrets wins
  expect(vars.C).toBe("3");

  await rm(tmp, { recursive: true, force: true });
});

test("loadProjectEnv: custom envFileName", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "glubean-env-test-"));
  await writeFile(join(tmp, ".env.staging"), "STAGE=true\n", "utf-8");
  await writeFile(join(tmp, ".env.staging.secrets"), "TOKEN=secret\n", "utf-8");

  const vars = await loadProjectEnv(tmp, ".env.staging");
  expect(vars.STAGE).toBe("true");
  expect(vars.TOKEN).toBe("secret");

  await rm(tmp, { recursive: true, force: true });
});

test("loadProjectEnv: missing files return empty", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "glubean-env-test-"));
  const vars = await loadProjectEnv(tmp);
  expect(vars).toEqual({});
  await rm(tmp, { recursive: true, force: true });
});
