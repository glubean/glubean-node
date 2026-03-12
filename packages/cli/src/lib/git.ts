/**
 * Git helper utilities for the Glubean CLI.
 */

import { execFile } from "node:child_process";
import { resolve, relative } from "node:path";

function execGit(args: string[], cwd?: string): Promise<{ code: number; stdout: string }> {
  return new Promise((res) => {
    execFile("git", args, { cwd, encoding: "utf-8" }, (error, stdout) => {
      if (error) {
        res({ code: error.code ? 1 : 1, stdout: "" });
      } else {
        res({ code: 0, stdout: stdout ?? "" });
      }
    });
  });
}

export async function isGitRepo(dir?: string): Promise<boolean> {
  try {
    const { code } = await execGit(["rev-parse", "--is-inside-work-tree"], dir);
    return code === 0;
  } catch {
    return false;
  }
}

export async function gitShow(
  ref: string,
  filePath: string,
  dir?: string,
): Promise<string | null> {
  try {
    const { code, stdout } = await execGit(["show", `${ref}:${filePath}`], dir);
    if (code !== 0) return null;
    return stdout;
  } catch {
    return null;
  }
}

export async function gitRoot(dir?: string): Promise<string | null> {
  try {
    const { code, stdout } = await execGit(["rev-parse", "--show-toplevel"], dir);
    if (code !== 0) return null;
    return stdout.trim();
  } catch {
    return null;
  }
}

export async function gitRelativePath(
  filePath: string,
  dir?: string,
): Promise<string | null> {
  try {
    const { code, stdout } = await execGit(["ls-files", "--full-name", filePath], dir);
    if (code !== 0) return null;
    const result = stdout.trim();
    if (!result) {
      const rootDir = await gitRoot(dir);
      if (!rootDir) return null;
      const absPath = resolve(dir || process.cwd(), filePath);
      return relative(rootDir, absPath);
    }
    return result;
  } catch {
    return null;
  }
}
