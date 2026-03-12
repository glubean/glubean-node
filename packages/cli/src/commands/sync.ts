/**
 * Sync command - packages and uploads test files to the Glubean cloud registry.
 */

import { join, relative, resolve } from "node:path";
import { readdir, readFile, writeFile, stat, rm } from "node:fs/promises";
import archiver from "archiver";
import { createWriteStream } from "node:fs";
import type { BundleMetadata, FileMeta } from "@glubean/scanner";
import { scan } from "@glubean/scanner";
import { buildMetadata } from "../metadata.js";
import { CLI_VERSION } from "../version.js";
import { resolveApiUrl, resolveProjectId, resolveToken } from "../lib/auth.js";
import { loadConfig } from "../lib/config.js";
import { loadProjectEnv } from "../lib/env.js";

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
};

export interface SyncOptions {
  project?: string;
  version?: string;
  dir?: string;
  dryRun?: boolean;
  apiUrl?: string;
  token?: string;
}

const DEFAULT_SKIP_DIRS = [
  "node_modules",
  ".git",
  ".glubean",
  "dist",
  "build",
];

function parseIgnorePatterns(content: string): RegExp[] {
  const patterns: RegExp[] = [];

  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    let pattern = line;
    if (pattern.startsWith("/")) pattern = pattern.slice(1);
    if (pattern.endsWith("/")) pattern = pattern.slice(0, -1);

    pattern = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    pattern = pattern
      .replace(/\*\*/g, "{{GLOBSTAR}}")
      .replace(/\*/g, "[^/]*")
      .replace(/\?/g, "[^/]")
      .replace(/\{\{GLOBSTAR\}\}/g, ".*");

    patterns.push(new RegExp(`(^|/)${pattern}(/|$)`));
  }

  return patterns;
}

async function walkForFiles(dir: string, skipPatterns: RegExp[]): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".env" && entry.name !== ".glubeanignore") {
      // Skip hidden files except .env and .glubeanignore
    }
    const full = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (DEFAULT_SKIP_DIRS.includes(entry.name)) continue;
      files.push(...await walkForFiles(full, skipPatterns));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }

  return files;
}

async function collectBundleFiles(dir: string): Promise<string[]> {
  const skipPatterns = DEFAULT_SKIP_DIRS.map(
    (d) => new RegExp(`(^|/)${d}(/|$)`),
  );

  const ignorePath = join(dir, ".glubeanignore");
  try {
    const content = await readFile(ignorePath, "utf-8");
    skipPatterns.push(...parseIgnorePatterns(content));
  } catch {
    // No .glubeanignore
  }

  const allFiles = await walkForFiles(dir, skipPatterns);
  const files: string[] = [];
  for (const file of allFiles) {
    const rel = relative(dir, file);
    if (rel.startsWith(".glubean-bundle-")) continue;
    // Apply skip patterns
    if (skipPatterns.some((p) => p.test(rel))) continue;
    files.push(rel);
  }

  return files.sort();
}

async function createBundleTar(
  dir: string,
  metadata: BundleMetadata,
  outputPath: string,
): Promise<number> {
  const bundleFiles = await collectBundleFiles(dir);

  return new Promise((resolve, reject) => {
    const output = createWriteStream(outputPath);
    const archive = archiver("tar");

    output.on("close", () => resolve(bundleFiles.length));
    archive.on("error", (err: Error) => reject(err));

    archive.pipe(output);

    // Add metadata.json
    const metadataContent = JSON.stringify(metadata, null, 2);
    archive.append(metadataContent, { name: "metadata.json" });

    // Add all project files
    for (const filePath of bundleFiles) {
      const srcPath = join(dir, filePath);
      archive.file(srcPath, { name: filePath });
    }

    archive.finalize();
  });
}

interface InitSyncResponse {
  bundleId: string;
  uploadUrl: string;
  uploadKey: string;
  expiresAt: string;
}

interface CompleteSyncResponse {
  bundleId: string;
  shortId: string;
  version: string;
  testCount: number;
  fileCount: number;
}

async function initSync(
  projectId: string,
  version: string,
  apiUrl: string,
  token?: string,
): Promise<InitSyncResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(
    `${apiUrl}/projects/${projectId}/bundles/sync/init`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ version }),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Init sync failed: ${response.status} - ${error}`);
  }

  return response.json();
}

async function uploadToS3(tarPath: string, uploadUrl: string): Promise<void> {
  const tarContent = await readFile(tarPath);

  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/x-tar" },
    body: tarContent,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`S3 upload failed: ${response.status} - ${error}`);
  }
}

async function completeSync(
  projectId: string,
  bundleId: string,
  timestamp: number,
  files: Record<string, FileMeta>,
  apiUrl: string,
  token?: string,
): Promise<CompleteSyncResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(
    `${apiUrl}/projects/${projectId}/bundles/sync/complete`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ bundleId, timestamp, files }),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Complete sync failed: ${response.status} - ${error}`);
  }

  return response.json();
}

export async function syncCommand(options: SyncOptions = {}): Promise<void> {
  console.log(
    `\n${colors.bold}${colors.blue}☁️  Glubean Sync${colors.reset}\n`,
  );

  const dir = options.dir ? resolve(options.dir) : process.cwd();

  const config = await loadConfig(dir);
  const envFileVars = await loadProjectEnv(dir, config.run.envFile);
  const sources = { envFileVars, cloudConfig: config.cloud };
  const authOpts = {
    token: options.token,
    project: options.project,
    apiUrl: options.apiUrl,
  };

  const projectId = await resolveProjectId(authOpts, sources);
  if (!projectId) {
    console.log(`${colors.red}✗ Error: No project ID found.${colors.reset}`);
    console.log(
      `${colors.dim}  Use --project, set GLUBEAN_PROJECT_ID, add to .env, or configure in package.json glubean.cloud.${colors.reset}\n`,
    );
    process.exit(1);
  }

  const version = options.version ||
    new Date().toISOString().replace(/[:.]/g, "-");
  const apiUrl = (await resolveApiUrl(authOpts, sources)).replace(/\/$/, "");
  const token = await resolveToken(authOpts, sources);

  console.log(`${colors.dim}Project:   ${colors.reset}${projectId}`);
  console.log(`${colors.dim}Version:   ${colors.reset}${version}`);
  console.log(`${colors.dim}Directory: ${colors.reset}${dir}`);
  console.log();

  console.log(`${colors.cyan}→ Scanning test files...${colors.reset}`);
  const scanResult = await scan(dir);
  if (scanResult.fileCount === 0) {
    console.log(`${colors.yellow}⚠️  No test files found.${colors.reset}`);
    console.log(
      `${colors.dim}   Make sure your test files import from @glubean/sdk and export test().${colors.reset}\n`,
    );
    return;
  }

  const metadata = await buildMetadata(scanResult, {
    generatedBy: `@glubean/cli@${CLI_VERSION}`,
    projectId,
    version,
  });
  const files = metadata.files;
  const testCount = metadata.testCount;
  const fileCount = metadata.fileCount;

  console.log(
    `${colors.green}✓ Found ${testCount} test(s) in ${fileCount} file(s)${colors.reset}`,
  );

  for (const [path, meta] of Object.entries(files)) {
    console.log(`${colors.dim}  • ${path}${colors.reset}`);
    for (const exp of meta.exports) {
      const tagStr = exp.tags ? ` [${exp.tags.join(", ")}]` : "";
      console.log(`${colors.dim}    - ${exp.id}${tagStr}${colors.reset}`);
    }
  }
  console.log();

  console.log(`${colors.cyan}→ Generating metadata.json...${colors.reset}`);
  console.log(`${colors.green}✓ Metadata generated${colors.reset}\n`);
  const syncTimestamp = Date.now();

  const tarPath = join(process.cwd(), `.glubean-bundle-${version}.tar`);
  console.log(`${colors.cyan}→ Bundling project files...${colors.reset}`);
  const bundledFileCount = await createBundleTar(dir, metadata, tarPath);

  const tarStat = await stat(tarPath);
  const sizeKB = (tarStat.size / 1024).toFixed(2);
  const dataFileCount = bundledFileCount - fileCount;
  const breakdown = dataFileCount > 0 ? ` (${fileCount} test + ${dataFileCount} data/support)` : "";
  console.log(
    `${colors.green}✓ Bundle created: ${bundledFileCount} files${breakdown}, ${sizeKB} KB${colors.reset}\n`,
  );

  if (options.dryRun) {
    console.log(`${colors.yellow}🔍 Dry run - skipping upload${colors.reset}`);
    console.log(`${colors.dim}   Bundle saved to: ${tarPath}${colors.reset}`);
    console.log(`${colors.dim}   Metadata:${colors.reset}`);
    console.log(JSON.stringify(metadata, null, 2));
    console.log(
      `\n${colors.green}${colors.bold}✓ Sync complete (dry run)!${colors.reset}\n`,
    );
    return;
  }

  try {
    console.log(`${colors.cyan}→ Initializing sync...${colors.reset}`);
    const initResult = await initSync(
      projectId,
      version,
      apiUrl,
      token ?? undefined,
    );
    console.log(
      `${colors.green}✓ Bundle ID: ${initResult.bundleId}${colors.reset}`,
    );

    console.log(`${colors.cyan}→ Uploading to cloud storage...${colors.reset}`);
    await uploadToS3(tarPath, initResult.uploadUrl);
    console.log(`${colors.green}✓ Upload complete${colors.reset}`);

    console.log(`${colors.cyan}→ Finalizing sync...${colors.reset}`);
    const completeResult = await completeSync(
      projectId,
      initResult.bundleId,
      syncTimestamp,
      metadata.files,
      apiUrl,
      token ?? undefined,
    );
    console.log(`${colors.green}✓ Sync finalized${colors.reset}`);

    console.log();
    console.log(`${colors.bold}Bundle Summary:${colors.reset}`);
    console.log(
      `${colors.dim}   ID:      ${colors.reset}${completeResult.bundleId}`,
    );
    console.log(
      `${colors.dim}   Version: ${colors.reset}${completeResult.version}`,
    );
    console.log(
      `${colors.dim}   Tests:   ${colors.reset}${completeResult.testCount}`,
    );
    console.log(
      `${colors.dim}   Files:   ${colors.reset}${completeResult.fileCount}`,
    );

    await rm(tarPath).catch(() => {});
  } catch (error) {
    console.log(
      `${colors.red}✗ Sync failed: ${error instanceof Error ? error.message : error}${colors.reset}`,
    );
    console.log(
      `${colors.dim}   Bundle saved locally: ${tarPath}${colors.reset}`,
    );
    process.exit(1);
  }

  console.log(
    `\n${colors.green}${colors.bold}✓ Sync complete!${colors.reset}\n`,
  );
}
