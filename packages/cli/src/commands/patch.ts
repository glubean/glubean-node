import { basename, dirname, extname, resolve } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import { applyPatch, findPatchFile, loadPatchFile } from "../lib/openapi_patch.js";

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
};

export interface PatchCommandOptions {
  patch?: string;
  output?: string;
  stdout?: boolean;
  format?: "json" | "yaml";
}

export async function patchCommand(
  specPath: string,
  options: PatchCommandOptions = {},
): Promise<void> {
  const resolvedSpec = resolve(specPath);

  let specContent: string;
  try {
    specContent = await readFile(resolvedSpec, "utf-8");
  } catch {
    console.error(
      `${colors.red}Error: Cannot read spec file: ${specPath}${colors.reset}`,
    );
    process.exit(1);
    return;
  }

  const specExt = extname(resolvedSpec).toLowerCase();
  let spec: Record<string, unknown>;
  try {
    if (specExt === ".yaml" || specExt === ".yml") {
      spec = yamlParse(specContent) as Record<string, unknown>;
    } else {
      spec = JSON.parse(specContent);
    }
  } catch {
    console.error(
      `${colors.red}Error: Failed to parse spec file: ${specPath}${colors.reset}`,
    );
    process.exit(1);
    return;
  }

  let patchPath: string | null;
  if (options.patch) {
    patchPath = resolve(options.patch);
  } else {
    patchPath = await findPatchFile(resolvedSpec);
  }

  if (!patchPath) {
    console.error(
      `${colors.red}Error: No patch file found for ${specPath}${colors.reset}`,
    );
    console.error(
      `${colors.dim}Expected one of: ${
        basename(resolvedSpec, extname(resolvedSpec))
      }.patch.yaml, .patch.yml, .patch.json${colors.reset}`,
    );
    process.exit(1);
    return;
  }

  const patch = await loadPatchFile(patchPath);
  const merged = applyPatch(spec!, patch);

  const outputFormat = options.format ??
    (specExt === ".yaml" || specExt === ".yml" ? "yaml" : "json");

  let outputContent: string;
  if (outputFormat === "yaml") {
    outputContent = yamlStringify(merged as Record<string, unknown>);
  } else {
    outputContent = JSON.stringify(merged, null, 2) + "\n";
  }

  if (options.stdout) {
    process.stdout.write(outputContent);
    return;
  }

  const outputPath = options.output ? resolve(options.output) : resolve(
    dirname(resolvedSpec),
    `${basename(resolvedSpec, extname(resolvedSpec))}.patched${outputFormat === "yaml" ? ".yaml" : ".json"}`,
  );

  await writeFile(outputPath, outputContent, "utf-8");

  const relPatch = patchPath.startsWith(process.cwd()) ? patchPath.slice(process.cwd().length + 1) : patchPath;
  const relOutput = outputPath.startsWith(process.cwd()) ? outputPath.slice(process.cwd().length + 1) : outputPath;

  console.log(
    `${colors.green}Patched${colors.reset} ${specPath} + ${relPatch} → ${colors.bold}${relOutput}${colors.reset}`,
  );
}
