/**
 * Integration tests for the validate-metadata command.
 */

import { test, expect } from "vitest";
import { join } from "node:path";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { runCli } from "../test-helpers.js";
import type { BundleMetadata, FileMeta } from "@glubean/scanner";

async function createTempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "glubean-validate-test-"));
}

function sha256(content: string): string {
  const hash = createHash("sha256").update(content).digest("hex");
  return `sha256-${hash}`;
}

function computeRootHash(files: Record<string, { hash: string }>): string {
  const entries = Object.entries(files).sort(([a], [b]) => a.localeCompare(b));
  const payload = entries
    .map(([filePath, meta]) => `${filePath}:${meta.hash}`)
    .join("\n");
  const hash = createHash("sha256").update(payload).digest("hex");
  return `sha256-${hash}`;
}

test("validate-metadata passes with valid metadata", async () => {
  const dir = await createTempDir();
  try {
    const fileContent = "export const x = 1;";
    const filePath = "test.ts";
    await writeFile(join(dir, filePath), fileContent, "utf-8");

    const fileHash = sha256(fileContent);
    const files: Record<string, FileMeta> = {
      [filePath]: { hash: fileHash, exports: [] },
    };

    const metadata: BundleMetadata = {
      schemaVersion: "1",
      specVersion: "2.0",
      generatedBy: "@glubean/cli@0.2.0",
      generatedAt: new Date().toISOString(),
      rootHash: computeRootHash(files),
      files,
      testCount: 0,
      fileCount: 1,
      tags: [],
    };

    await writeFile(
      join(dir, "metadata.json"),
      JSON.stringify(metadata, null, 2),
      "utf-8",
    );

    const { code } = await runCli(["validate-metadata", "--dir", dir]);
    expect(code).toBe(0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("validate-metadata fails when metadata.json is missing", async () => {
  const dir = await createTempDir();
  try {
    const { code } = await runCli(["validate-metadata", "--dir", dir]);
    expect(code).toBe(1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("validate-metadata fails with invalid schemaVersion", async () => {
  const dir = await createTempDir();
  try {
    const metadata = {
      schemaVersion: "99",
      specVersion: "2.0",
      generatedBy: "@glubean/cli@0.2.0",
      generatedAt: new Date().toISOString(),
      rootHash: "sha256-fake",
      files: {},
      testCount: 0,
      fileCount: 0,
      tags: [],
    };

    await writeFile(
      join(dir, "metadata.json"),
      JSON.stringify(metadata, null, 2),
      "utf-8",
    );

    const { code } = await runCli(["validate-metadata", "--dir", dir]);
    expect(code).toBe(1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("validate-metadata fails when file hash mismatch", async () => {
  const dir = await createTempDir();
  try {
    const fileContent = "export const x = 1;";
    const filePath = "test.ts";
    await writeFile(join(dir, filePath), fileContent, "utf-8");

    const wrongHash = "sha256-wrong-hash-does-not-match";
    const files: Record<string, FileMeta> = {
      [filePath]: { hash: wrongHash, exports: [] },
    };

    const metadata: BundleMetadata = {
      schemaVersion: "1",
      specVersion: "2.0",
      generatedBy: "@glubean/cli@0.2.0",
      generatedAt: new Date().toISOString(),
      rootHash: computeRootHash(files),
      files,
      testCount: 0,
      fileCount: 1,
      tags: [],
    };

    await writeFile(
      join(dir, "metadata.json"),
      JSON.stringify(metadata, null, 2),
      "utf-8",
    );

    const { code } = await runCli(["validate-metadata", "--dir", dir]);
    expect(code).toBe(1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("validate-metadata fails when referenced file is missing", async () => {
  const dir = await createTempDir();
  try {
    const files: Record<string, FileMeta> = {
      "missing-file.ts": { hash: "sha256-fake", exports: [] },
    };

    const metadata: BundleMetadata = {
      schemaVersion: "1",
      specVersion: "2.0",
      generatedBy: "@glubean/cli@0.2.0",
      generatedAt: new Date().toISOString(),
      rootHash: computeRootHash(files),
      files,
      testCount: 0,
      fileCount: 1,
      tags: [],
    };

    await writeFile(
      join(dir, "metadata.json"),
      JSON.stringify(metadata, null, 2),
      "utf-8",
    );

    const { code } = await runCli(["validate-metadata", "--dir", dir]);
    expect(code).toBe(1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("validate-metadata fails when rootHash mismatch", async () => {
  const dir = await createTempDir();
  try {
    const fileContent = "export const x = 1;";
    const filePath = "test.ts";
    await writeFile(join(dir, filePath), fileContent, "utf-8");

    const fileHash = sha256(fileContent);
    const files: Record<string, FileMeta> = {
      [filePath]: { hash: fileHash, exports: [] },
    };

    const metadata: BundleMetadata = {
      schemaVersion: "1",
      specVersion: "2.0",
      generatedBy: "@glubean/cli@0.2.0",
      generatedAt: new Date().toISOString(),
      rootHash: "sha256-wrong-root-hash",
      files,
      testCount: 0,
      fileCount: 1,
      tags: [],
    };

    await writeFile(
      join(dir, "metadata.json"),
      JSON.stringify(metadata, null, 2),
      "utf-8",
    );

    const { code } = await runCli(["validate-metadata", "--dir", dir]);
    expect(code).toBe(1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
