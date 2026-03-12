/**
 * OpenAPI Patch — a concise YAML DSL for supplementing incomplete OpenAPI specs.
 */

import { stat } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { parse as yamlParse } from "yaml";

type OpenApiSpec = Record<string, any>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PatchFile {
  endpoints?: Record<string, Record<string, OperationPatch>>;
  schemas?: Record<string, Record<string, unknown>>;
  raw?: Record<string, any>;
}

export interface OperationPatch {
  summary?: string;
  description?: string;
  body?: Record<string, string>;
  [statusOrField: string]: unknown;
}

const TYPE_MAP: Record<string, { type: string; format?: string }> = {
  string: { type: "string" },
  number: { type: "number" },
  integer: { type: "integer" },
  boolean: { type: "boolean" },
  datetime: { type: "string", format: "date-time" },
  date: { type: "string", format: "date" },
  email: { type: "string", format: "email" },
  uri: { type: "string", format: "uri" },
  url: { type: "string", format: "uri" },
  uuid: { type: "string", format: "uuid" },
};

// ---------------------------------------------------------------------------
// Patch file discovery & loading
// ---------------------------------------------------------------------------

const PATCH_EXTENSIONS = [".patch.yaml", ".patch.yml", ".patch.json"];

export async function findPatchFile(
  specPath: string,
): Promise<string | null> {
  const lastDot = specPath.lastIndexOf(".");
  const base = lastDot > 0 ? specPath.substring(0, lastDot) : specPath;

  for (const ext of PATCH_EXTENSIONS) {
    const candidate = `${base}${ext}`;
    try {
      await stat(candidate);
      return candidate;
    } catch {
      // not found
    }
  }
  return null;
}

export async function loadPatchFile(path: string): Promise<PatchFile> {
  const content = await readFile(path, "utf-8");
  return parsePatchContent(content);
}

export function parsePatchContent(content: string): PatchFile {
  const parsed = yamlParse(content) as PatchFile;
  if (!parsed || typeof parsed !== "object") {
    return {};
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// DSL → OpenAPI conversion
// ---------------------------------------------------------------------------

function parseTypeString(typeStr: string, schemas?: Record<string, Record<string, unknown>>): Record<string, any> {
  if (typeStr.endsWith("[]")) {
    const inner = typeStr.slice(0, -2);
    return {
      type: "array",
      items: parseTypeString(inner, schemas),
    };
  }

  if (typeStr.includes("|")) {
    const values = typeStr.split("|").map((v) => v.trim().replace(/^["']|["']$/g, ""));
    return { type: "string", enum: values };
  }

  const mapped = TYPE_MAP[typeStr.toLowerCase()];
  if (mapped) {
    return { ...mapped };
  }

  if (schemas && schemas[typeStr]) {
    return { $ref: `#/components/schemas/${typeStr}` };
  }

  return { type: "string" };
}

function isTypeExpression(value: string, schemas?: Record<string, Record<string, unknown>>): boolean {
  if (value.endsWith("[]")) return true;
  if (value.includes("|")) return true;
  if (TYPE_MAP[value.toLowerCase()]) return true;
  if (schemas && schemas[value]) return true;
  return false;
}

const VALIDATION_KEYS = new Set([
  "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum",
  "minLength", "maxLength", "pattern", "minItems", "maxItems",
  "uniqueItems", "enum", "example", "default", "format",
]);

function fieldsToSchema(
  fields: Record<string, unknown>,
  schemas?: Record<string, Record<string, unknown>>,
): Record<string, any> {
  const properties: Record<string, any> = {};
  const required: string[] = [];

  for (const [rawKey, fieldValue] of Object.entries(fields)) {
    const optional = rawKey.endsWith("?");
    const key = optional ? rawKey.slice(0, -1) : rawKey;

    if (typeof fieldValue === "string") {
      if (isTypeExpression(fieldValue, schemas)) {
        properties[key] = parseTypeString(fieldValue, schemas);
      } else {
        properties[key] = { type: "string", description: fieldValue };
      }
    } else if (typeof fieldValue === "object" && fieldValue !== null) {
      const obj = fieldValue as Record<string, unknown>;
      const typeStr = typeof obj.type === "string" ? obj.type : "string";
      const parsed = parseTypeString(typeStr, schemas);
      if (obj.description) parsed.description = obj.description;
      for (const vKey of VALIDATION_KEYS) {
        if (obj[vKey] !== undefined) parsed[vKey] = obj[vKey];
      }
      properties[key] = parsed;
    } else {
      properties[key] = { type: "string" };
    }

    if (!optional) {
      required.push(key);
    }
  }

  const schema: Record<string, any> = { type: "object", properties };
  if (required.length > 0) {
    schema.required = required;
  }
  return schema;
}

function isStatusCode(key: string): boolean {
  return /^\d{3}$/.test(key);
}

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options", "trace"]);

export function patchToOpenApi(patch: PatchFile): OpenApiSpec {
  const result: Record<string, any> = {};

  if (patch.schemas) {
    result.components = { schemas: {} };
    for (const [name, fields] of Object.entries(patch.schemas)) {
      result.components.schemas[name] = fieldsToSchema(fields, patch.schemas);
    }
  }

  if (patch.endpoints) {
    result.paths = {};
    for (const [path, methods] of Object.entries(patch.endpoints)) {
      if (!result.paths[path]) {
        result.paths[path] = {};
      }

      for (const [method, opPatch] of Object.entries(methods)) {
        if (!HTTP_METHODS.has(method.toLowerCase())) continue;

        const operation: Record<string, any> = {};

        if (opPatch.summary) operation.summary = opPatch.summary;
        if (opPatch.description) operation.description = opPatch.description;
        if (opPatch.deprecated) operation.deprecated = opPatch.deprecated;
        if (opPatch.tags) operation.tags = opPatch.tags;

        if (opPatch.body && typeof opPatch.body === "object") {
          operation.requestBody = {
            required: true,
            content: {
              "application/json": {
                schema: fieldsToSchema(
                  opPatch.body as Record<string, string>,
                  patch.schemas,
                ),
              },
            },
          };
        }

        for (const [rKey, rValue] of Object.entries(opPatch)) {
          if (!isStatusCode(rKey)) continue;

          if (typeof rValue === "string") {
            if (!operation.responses) operation.responses = {};
            operation.responses[rKey] = { description: rValue };
          } else if (typeof rValue === "object" && rValue !== null) {
            if (!operation.responses) operation.responses = {};
            operation.responses[rKey] = {
              description: "",
              content: {
                "application/json": {
                  schema: fieldsToSchema(
                    rValue as Record<string, string>,
                    patch.schemas,
                  ),
                },
              },
            };
          }
        }

        result.paths[path][method.toLowerCase()] = operation;
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Deep Merge
// ---------------------------------------------------------------------------

export function deepMerge(target: any, source: any): any {
  if (source == null) return target;
  if (target == null) return source;

  if (typeof target !== "object" || typeof source !== "object") {
    return source;
  }

  if (Array.isArray(source)) {
    return source;
  }

  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      key in result && typeof result[key] === "object" && typeof source[key] === "object" && !Array.isArray(source[key])
    ) {
      result[key] = deepMerge(result[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Public API: apply patch to spec
// ---------------------------------------------------------------------------

export function applyPatch(spec: OpenApiSpec, patch: PatchFile): OpenApiSpec {
  let result = spec;

  if (patch.raw) {
    result = deepMerge(result, patch.raw);
  }

  const converted = patchToOpenApi(patch);
  result = deepMerge(result, converted);

  return result;
}
