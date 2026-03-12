import { test, expect } from "vitest";
import type { FileMeta } from "@glubean/scanner";
import { computeRootHash, deriveMetadataStats, normalizeFileMap } from "./metadata.js";

test("computeRootHash is order independent", async () => {
  const fileA: FileMeta = { hash: "sha256-a", exports: [] };
  const fileB: FileMeta = { hash: "sha256-b", exports: [] };

  const hashA = await computeRootHash({
    "b.ts": fileB,
    "a.ts": fileA,
  });
  const hashB = await computeRootHash({
    "a.ts": fileA,
    "b.ts": fileB,
  });

  expect(hashA).toBe(hashB);
});

test("deriveMetadataStats counts tests and tags", () => {
  const files: Record<string, FileMeta> = {
    "api.test.ts": {
      hash: "sha256-a",
      exports: [
        {
          type: "test",
          id: "login",
          exportName: "login",
          tags: ["smoke"],
        },
        {
          type: "test",
          id: "auth-reset",
          exportName: "authReset",
          tags: ["auth", "smoke"],
        },
      ],
    },
  };

  const stats = deriveMetadataStats(files);
  expect(stats.fileCount).toBe(1);
  expect(stats.testCount).toBe(2);
  expect(stats.tags).toEqual(["auth", "smoke"]);
});

test("normalizeFileMap rejects duplicate normalized paths", () => {
  const files: Record<string, FileMeta> = {
    "tests\\a.ts": { hash: "sha256-a", exports: [] },
    "tests/a.ts": { hash: "sha256-b", exports: [] },
  };

  expect(() => normalizeFileMap(files)).toThrow(
    "Duplicate file path after normalization",
  );
});
