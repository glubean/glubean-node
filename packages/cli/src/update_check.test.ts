import { test, expect } from "vitest";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { checkForUpdates, isNewer } from "./update_check.js";

test("checkForUpdates caches results and skips frequent fetches", async () => {
  const dir = await mkdtemp(join(tmpdir(), "glubean-update-check-"));
  try {
    const cachePath = join(dir, "update-check.json");
    let fetchCount = 0;
    const fetchFn = () => {
      fetchCount += 1;
      return Promise.resolve(
        new Response(JSON.stringify({ version: "1.2.3" }), { status: 200 }),
      );
    };

    await checkForUpdates("1.0.0", {
      cachePath,
      now: 1000,
      fetchFn,
    });

    await checkForUpdates("1.0.0", {
      cachePath,
      now: 2000,
      fetchFn,
    });

    expect(fetchCount).toBe(1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("checkForUpdates fetches again after interval", async () => {
  const dir = await mkdtemp(join(tmpdir(), "glubean-update-check-"));
  try {
    const cachePath = join(dir, "update-check.json");
    let fetchCount = 0;
    const fetchFn = () => {
      fetchCount += 1;
      return Promise.resolve(
        new Response(JSON.stringify({ version: "2.0.0" }), { status: 200 }),
      );
    };

    await checkForUpdates("1.0.0", {
      cachePath,
      now: 0,
      fetchFn,
    });

    await checkForUpdates("1.0.0", {
      cachePath,
      now: 25 * 60 * 60 * 1000,
      fetchFn,
    });

    expect(fetchCount).toBe(2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// =============================================================================
// isNewer — semver comparison
// =============================================================================

test("isNewer - basic version comparison", () => {
  expect(isNewer("2.0.0", "1.0.0")).toBe(true);
  expect(isNewer("1.1.0", "1.0.0")).toBe(true);
  expect(isNewer("1.0.1", "1.0.0")).toBe(true);
  expect(isNewer("1.0.0", "1.0.0")).toBe(false);
  expect(isNewer("1.0.0", "2.0.0")).toBe(false);
});

test("isNewer - stable release beats pre-release", () => {
  expect(isNewer("1.0.0", "1.0.0-rc.9")).toBe(true);
  expect(isNewer("1.0.0", "1.0.0-alpha.1")).toBe(true);
});

test("isNewer - pre-release does not beat stable", () => {
  expect(isNewer("1.0.0-rc.1", "1.0.0")).toBe(false);
});

test("isNewer - pre-release ordering (rc.2 > rc.1)", () => {
  expect(isNewer("1.0.0-rc.2", "1.0.0-rc.1")).toBe(true);
  expect(isNewer("1.0.0-rc.1", "1.0.0-rc.2")).toBe(false);
  expect(isNewer("1.0.0-rc.1", "1.0.0-rc.1")).toBe(false);
  expect(isNewer("1.0.0-beta.1", "1.0.0-alpha.1")).toBe(true);
});

test("isNewer - build metadata is ignored", () => {
  expect(isNewer("1.0.1+build.123", "1.0.0")).toBe(true);
  expect(isNewer("1.0.0+build.999", "1.0.0+build.1")).toBe(false);
});

test("isNewer - numeric pre-release ids compared as integers", () => {
  expect(isNewer("1.0.0-rc.10", "1.0.0-rc.9")).toBe(true);
  expect(isNewer("1.0.0-rc.9", "1.0.0-rc.10")).toBe(false);
});
