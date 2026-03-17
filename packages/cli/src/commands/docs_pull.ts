/**
 * glubean docs pull — download @glubean/lens to .glubean/docs/
 *
 * Uses `npm pack` to fetch the package tarball, then extracts markdown files.
 * Writes a .pulled_at timestamp for staleness checking by AI skills.
 */

import { execSync } from "node:child_process";
import { mkdir, writeFile, rm, readdir, copyFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const PACKAGE_NAME = "@glubean/lens";

interface DocsPullOptions {
  dir?: string;
}

export async function docsPullCommand(options: DocsPullOptions): Promise<void> {
  const projectRoot = resolve(options.dir ?? process.cwd());
  const docsDir = join(projectRoot, ".glubean", "docs");
  const tmpDir = join(tmpdir(), `glubean-lens-${Date.now()}`);

  try {
    // 1. npm pack to temp directory
    console.log(`Fetching ${PACKAGE_NAME}...`);
    await mkdir(tmpDir, { recursive: true });

    const packOutput = execSync(`npm pack ${PACKAGE_NAME} --pack-destination ${tmpDir}`, {
      stdio: "pipe",
      encoding: "utf-8",
    }).trim();

    const tgzName = packOutput.split("\n").pop()!;
    const tgzPath = join(tmpDir, tgzName);

    // 2. Extract tarball
    execSync(`tar xzf ${tgzPath} -C ${tmpDir}`, { stdio: "pipe" });
    const extractedDir = join(tmpDir, "package");

    // 3. Clear and copy to .glubean/docs/
    await rm(docsDir, { recursive: true, force: true });
    await mkdir(docsDir, { recursive: true });
    await copyRecursive(extractedDir, docsDir);

    // 4. Write timestamp
    await writeFile(join(docsDir, ".pulled_at"), new Date().toISOString() + "\n");

    // 5. Ensure .gitignore covers .glubean/
    await ensureGitignore(projectRoot);

    console.log(`✓ Lens docs pulled to ${docsDir}`);
    const files = await countFiles(docsDir);
    console.log(`  ${files} files (index + sdk-reference + cli-reference + patterns)`);
    console.log(`  Timestamp: .glubean/docs/.pulled_at`);
  } catch (err: any) {
    if (err.message?.includes("E404") || err.stderr?.includes("E404")) {
      console.error(`✗ Package ${PACKAGE_NAME} not found on npm. It may not be published yet.`);
    } else {
      console.error(`✗ Failed to pull docs: ${err.message}`);
    }
    process.exit(1);
  } finally {
    // Cleanup temp
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function copyRecursive(src: string, dest: string): Promise<void> {
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.name === "package.json") continue; // Skip package.json
    if (entry.isDirectory()) {
      await mkdir(destPath, { recursive: true });
      await copyRecursive(srcPath, destPath);
    } else {
      await copyFile(srcPath, destPath);
    }
  }
}

async function ensureGitignore(projectRoot: string): Promise<void> {
  const gitignorePath = join(projectRoot, ".gitignore");
  let content = "";
  try {
    const { readFile } = await import("node:fs/promises");
    content = await readFile(gitignorePath, "utf-8");
  } catch {
    // No .gitignore yet
  }

  if (!content.includes(".glubean/")) {
    content = content.trimEnd() + (content.trim() ? "\n" : "") + ".glubean/\n";
    await writeFile(gitignorePath, content);
  }
}

async function countFiles(dir: string): Promise<number> {
  let count = 0;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (entry.isDirectory()) {
      count += await countFiles(join(dir, entry.name));
    } else {
      count++;
    }
  }
  return count;
}
