import { basename, dirname, extname, resolve } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { parseSpec, splitSpec } from "../lib/openapi_split.js";

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

export interface SpecSplitOptions {
  output?: string;
}

export async function specSplitCommand(
  specPath: string,
  options: SpecSplitOptions = {},
): Promise<void> {
  const absSpec = resolve(specPath);

  let content: string;
  try {
    content = await readFile(absSpec, "utf-8");
  } catch {
    console.error(`Error: Cannot read spec file: ${specPath}`);
    process.exit(1);
    return;
  }

  let spec: Record<string, unknown>;
  try {
    spec = parseSpec(content, absSpec);
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
    return;
  }

  if (!spec || typeof spec !== "object") {
    console.error("Error: Spec file did not parse to a valid object.");
    process.exit(1);
    return;
  }

  if (!spec.paths || typeof spec.paths !== "object" || Object.keys(spec.paths).length === 0) {
    console.error("Error: No paths found in spec. Is this an OpenAPI 3.x file?");
    process.exit(1);
    return;
  }

  const specBasename = basename(absSpec, extname(absSpec));
  const outDir = options.output ? resolve(options.output) : resolve(dirname(absSpec), `${specBasename}-endpoints`);

  const { endpoints, index } = splitSpec(spec);

  await mkdir(outDir, { recursive: true });

  await writeFile(resolve(outDir, "_index.md"), index, "utf-8");
  console.log(
    `  ${colors.green}create${colors.reset} _index.md`,
  );

  for (const ep of endpoints) {
    const filePath = resolve(outDir, `${ep.slug}.json`);
    await writeFile(filePath, JSON.stringify(ep.content, null, 2) + "\n", "utf-8");
    console.log(
      `  ${colors.green}create${colors.reset} ${ep.slug}.json`,
    );
  }

  const relOut = outDir.startsWith(process.cwd()) ? outDir.slice(process.cwd().length + 1) : outDir;

  console.log(
    `\n${colors.bold}Done:${colors.reset} ${endpoints.length} endpoints → ${colors.cyan}${relOut}/${colors.reset}`,
  );
}
