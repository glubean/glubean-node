/**
 * Integration tests for the scan command.
 */

import { test, expect } from "vitest";
import { join } from "node:path";
import { mkdtemp, writeFile, readFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { runCli } from "../test-helpers.js";
import type { BundleMetadata } from "@glubean/scanner";

async function createTempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "glubean-scan-test-"));
}

const TEST_FILE_CONTENT = `import { test } from "@glubean/sdk";

export const myTest = test({
  id: "test-1",
  name: "My Test",
  tags: ["smoke"],
}, async (ctx) => {
  ctx.log("Hello");
});
`;

test("scan command generates metadata.json with valid structure", async () => {
  const dir = await createTempDir();
  try {
    await writeFile(join(dir, "api.test.ts"), TEST_FILE_CONTENT, "utf-8");

    // Create package.json with SDK dependency
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({
        name: "test-project",
        type: "module",
        dependencies: { "@glubean/sdk": "workspace:*" },
      }),
      "utf-8",
    );

    const { code } = await runCli(["scan", "--dir", dir]);
    expect(code).toBe(0);

    // Verify metadata.json was created
    const metadataContent = await readFile(join(dir, "metadata.json"), "utf-8");
    const metadata: BundleMetadata = JSON.parse(metadataContent);

    expect(metadata.schemaVersion).toBe("1");
    expect(typeof metadata.rootHash).toBe("string");
    expect(metadata.rootHash.startsWith("sha256-")).toBe(true);
    expect(typeof metadata.generatedBy).toBe("string");
    expect(typeof metadata.generatedAt).toBe("string");
    expect(metadata.fileCount).toBe(1);
    expect(metadata.testCount).toBe(1);
    expect(metadata.tags).toEqual(["smoke"]);
    expect(Object.keys(metadata.files).length).toBe(1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("scan command exits with error when no test files found", async () => {
  const dir = await createTempDir();
  try {
    await writeFile(join(dir, "package.json"), "{}", "utf-8");

    const { code } = await runCli(["scan", "--dir", dir]);
    expect(code).toBe(1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
