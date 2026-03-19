import { dirname, isAbsolute, resolve } from "node:path";

export type DataPathMode = "file" | "project" | "absolute";

export interface ResolveDataPathOptions {
  filePath?: string;
  projectRoot?: string;
}

export interface ResolvedDataPath {
  mode: DataPathMode;
  resolvedPath: string;
}

export function classifyDataPath(rawPath: string): DataPathMode {
  if (isAbsolute(rawPath)) return "absolute";
  if (rawPath.startsWith("./") || rawPath.startsWith("../")) return "file";
  return "project";
}

function preserveTrailingSlash(rawPath: string, resolvedPath: string): string {
  if (rawPath.endsWith("/") && !resolvedPath.endsWith("/")) {
    return `${resolvedPath}/`;
  }
  return resolvedPath;
}

/**
 * Resolve a source-relative or project-root-relative path for static analysis.
 *
 * This keeps the path contract aligned with the runtime SDK and VSCode
 * extension:
 * - `./` / `../` → file-relative
 * - bare paths → project-root-relative
 * - absolute paths → unchanged
 */
export function resolveDataPath(
  rawPath: string,
  options?: ResolveDataPathOptions,
): ResolvedDataPath {
  const mode = classifyDataPath(rawPath);

  if (mode === "absolute") {
    return { mode, resolvedPath: preserveTrailingSlash(rawPath, rawPath) };
  }

  if (mode === "file") {
    if (options?.filePath) {
      return {
        mode,
        resolvedPath: preserveTrailingSlash(
          rawPath,
          resolve(dirname(options.filePath), rawPath),
        ),
      };
    }
    return { mode, resolvedPath: rawPath };
  }

  if (options?.projectRoot) {
    return {
      mode,
      resolvedPath: preserveTrailingSlash(
        rawPath,
        resolve(options.projectRoot, rawPath),
      ),
    };
  }
  return { mode, resolvedPath: rawPath };
}
