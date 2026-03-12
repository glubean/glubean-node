/**
 * OpenAPI Spec Splitter — dereference $refs and split into per-endpoint files.
 */

import { parse as yamlParse } from "yaml";

type AnyObj = Record<string, any>;

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options", "trace"];

// ---------------------------------------------------------------------------
// $ref resolution
// ---------------------------------------------------------------------------

function resolvePointer(root: AnyObj, ref: string): unknown {
  if (!ref.startsWith("#/")) return undefined;
  const parts = ref.slice(2).split("/");
  let current: unknown = root;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as AnyObj)[part];
  }
  return current;
}

function deref(node: unknown, root: AnyObj, visited: Set<string> = new Set()): unknown {
  if (node == null || typeof node !== "object") return node;

  if (Array.isArray(node)) {
    return node.map((item) => deref(item, root, visited));
  }

  const obj = node as AnyObj;

  if (typeof obj["$ref"] === "string") {
    const ref = obj["$ref"] as string;
    if (visited.has(ref)) {
      return { _circular_ref: ref };
    }
    const resolved = resolvePointer(root, ref);
    if (resolved === undefined) return obj;
    visited.add(ref);
    const result = deref(resolved, root, new Set(visited));
    return result;
  }

  const result: AnyObj = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = deref(value, root, visited);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Split
// ---------------------------------------------------------------------------

export interface EndpointFile {
  slug: string;
  content: AnyObj;
}

export interface SplitResult {
  endpoints: EndpointFile[];
  index: string;
}

function toSlug(path: string, method: string): string {
  return (
    method +
    "-" +
    path
      .replace(/^\//, "")
      .replace(/\{([^}]+)\}/g, "$1")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/-+$/, "")
      .toLowerCase()
  );
}

export function splitSpec(spec: AnyObj): SplitResult {
  const paths = spec.paths;
  if (!paths || typeof paths !== "object") {
    return { endpoints: [], index: "# API Endpoints Index\n\nNo paths found.\n" };
  }

  const endpoints: EndpointFile[] = [];
  const slugCounts = new Map<string, number>();
  const warnings: string[] = [];
  const tagGroups = new Map<string, { method: string; path: string; slug: string; summary: string }[]>();

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== "object") continue;
    const pathObj = pathItem as AnyObj;

    let pathParams: AnyObj[] | undefined;
    if (Array.isArray(pathObj.parameters)) {
      pathParams = deref(pathObj.parameters, spec) as AnyObj[];
      if (!Array.isArray(pathParams)) pathParams = undefined;
    }

    for (const method of HTTP_METHODS) {
      const operation = pathObj[method];
      if (!operation || typeof operation !== "object") continue;

      let slug = toSlug(path, method);
      const count = slugCounts.get(slug) || 0;
      slugCounts.set(slug, count + 1);
      if (count > 0) {
        slug = `${slug}-${count + 1}`;
      }

      let derefOp: AnyObj;
      try {
        derefOp = deref(operation, spec) as AnyObj;
      } catch {
        warnings.push(`Warning: Failed to dereference ${method.toUpperCase()} ${path}, skipping`);
        continue;
      }

      const endpoint: AnyObj = {
        path,
        method: method.toUpperCase(),
        ...derefOp,
      };

      if (pathParams) {
        const opParams = Array.isArray(endpoint.parameters) ? endpoint.parameters : [];
        const opParamKeys = new Set(
          opParams
            .filter((p: AnyObj) => p && typeof p === "object" && p.in && p.name)
            .map((p: AnyObj) => `${p.in}:${p.name}`),
        );
        const merged = [
          ...opParams,
          ...pathParams.filter(
            (p: AnyObj) =>
              p && typeof p === "object" && p.in && p.name &&
              !opParamKeys.has(`${p.in}:${p.name}`),
          ),
        ];
        endpoint.parameters = merged;
      }

      const security = endpoint.security || spec.security;
      if (Array.isArray(security) && spec.components?.securitySchemes) {
        const schemeNames = new Set<string>();
        for (const req of security) {
          if (req && typeof req === "object") {
            for (const name of Object.keys(req)) {
              schemeNames.add(name);
            }
          }
        }
        const schemes: AnyObj = {};
        for (const name of schemeNames) {
          if (spec.components.securitySchemes[name]) {
            try {
              schemes[name] = deref(spec.components.securitySchemes[name], spec);
            } catch {
              // Skip unresolvable
            }
          }
        }
        if (Object.keys(schemes).length > 0) {
          endpoint._securitySchemes = schemes;
        }
      }

      if (spec.servers) {
        endpoint._servers = spec.servers;
      }

      endpoints.push({ slug, content: endpoint });

      const tags = Array.isArray(derefOp.tags) ? derefOp.tags : ["untagged"];
      const summary = derefOp.summary || derefOp.operationId || "";
      for (const tag of tags) {
        const tagStr = String(tag);
        if (!tagGroups.has(tagStr)) tagGroups.set(tagStr, []);
        tagGroups.get(tagStr)!.push({ method: method.toUpperCase(), path, slug, summary: String(summary) });
      }
    }
  }

  const lines: string[] = ["# API Endpoints Index", ""];

  if (warnings.length > 0) {
    lines.push("## Warnings", "");
    for (const w of warnings) {
      lines.push(`- ${w}`);
    }
    lines.push("");
  }

  const sortedTags = [...tagGroups.keys()].sort();
  for (const tag of sortedTags) {
    lines.push(`## ${tag}`, "");
    const ops = tagGroups.get(tag)!;
    for (const op of ops) {
      lines.push(`- ${op.method} ${op.path} → \`${op.slug}.json\` — ${op.summary}`);
    }
    lines.push("");
  }

  return { endpoints, index: lines.join("\n") };
}

// ---------------------------------------------------------------------------
// Parse input spec
// ---------------------------------------------------------------------------

export function parseSpec(content: string, filePath: string): AnyObj {
  const ext = filePath.toLowerCase();
  try {
    if (ext.endsWith(".yaml") || ext.endsWith(".yml")) {
      const parsed = yamlParse(content);
      if (!parsed || typeof parsed !== "object") {
        throw new Error("YAML parsed to a non-object value");
      }
      return parsed as AnyObj;
    }
    return JSON.parse(content);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse spec (${ext.endsWith(".json") ? "JSON" : "YAML"}): ${msg}`);
  }
}
