import { test, expect } from "vitest";
import { applyPatch, deepMerge, parsePatchContent, patchToOpenApi } from "./openapi_patch.js";

// ---------------------------------------------------------------------------
// parsePatchContent
// ---------------------------------------------------------------------------

test("parsePatchContent: nested path/method/response", () => {
  const yaml = `
endpoints:
  /api/whoami:
    get:
      200:
        kind: string
        userId?: string
`;
  const patch = parsePatchContent(yaml);
  const get = patch.endpoints!["/api/whoami"].get;
  expect((get["200"] as Record<string, string>).kind).toBe("string");
  expect((get["200"] as Record<string, string>)["userId?"]).toBe("string");
});

test("parsePatchContent: description-only response", () => {
  const yaml = `
endpoints:
  /api/whoami:
    get:
      401: Unauthorized
`;
  const patch = parsePatchContent(yaml);
  expect(patch.endpoints!["/api/whoami"].get["401"]).toBe("Unauthorized");
});

test("parsePatchContent: schemas section", () => {
  const yaml = `
schemas:
  Project:
    id: string
    name: string
    isPublic: boolean
`;
  const patch = parsePatchContent(yaml);
  expect(patch.schemas?.Project.id).toBe("string");
  expect(patch.schemas?.Project.isPublic).toBe("boolean");
});

test("parsePatchContent: raw section preserved", () => {
  const yaml = `
raw:
  components:
    securitySchemes:
      BearerAuth:
        type: http
        scheme: bearer
`;
  const patch = parsePatchContent(yaml);
  expect(patch.raw?.components?.securitySchemes?.BearerAuth?.type).toBe("http");
});

test("parsePatchContent: multiple methods on same path", () => {
  const yaml = `
endpoints:
  /projects:
    get:
      200:
        items: string[]
    post:
      body:
        name: string
      201:
        id: string
`;
  const patch = parsePatchContent(yaml);
  expect(patch.endpoints!["/projects"].get != null).toBe(true);
  expect(patch.endpoints!["/projects"].post != null).toBe(true);
});

// ---------------------------------------------------------------------------
// patchToOpenApi
// ---------------------------------------------------------------------------

test("patchToOpenApi: converts endpoint with object response to OpenAPI", () => {
  const patch = parsePatchContent(`
endpoints:
  /api/whoami:
    get:
      summary: Get identity
      200:
        kind: string
        userId?: string
`);
  const result = patchToOpenApi(patch);

  expect(result.paths["/api/whoami"].get.summary).toBe("Get identity");

  const schema = result.paths["/api/whoami"].get.responses["200"].content["application/json"].schema;
  expect(schema.type).toBe("object");
  expect(schema.properties.kind).toEqual({ type: "string" });
  expect(schema.properties.userId).toEqual({ type: "string" });
  expect(schema.required).toEqual(["kind"]);
});

test("patchToOpenApi: converts string response to description only", () => {
  const patch = parsePatchContent(`
endpoints:
  /api/whoami:
    get:
      401: Unauthorized
`);
  const result = patchToOpenApi(patch);
  expect(result.paths["/api/whoami"].get.responses["401"]).toEqual({
    description: "Unauthorized",
  });
});

test("patchToOpenApi: converts request body", () => {
  const patch = parsePatchContent(`
endpoints:
  /projects:
    post:
      body:
        name: string
        teamId: string
      201:
        shortId: string
`);
  const result = patchToOpenApi(patch);

  const bodySchema = result.paths["/projects"].post.requestBody.content["application/json"].schema;
  expect(bodySchema.properties.name).toEqual({ type: "string" });
  expect(bodySchema.required).toContain("name");
  expect(bodySchema.required).toContain("teamId");
});

test("patchToOpenApi: enum type via pipe syntax", () => {
  const patch = parsePatchContent(`
endpoints:
  /api/whoami:
    get:
      200:
        kind: '"user" | "project"'
`);
  const result = patchToOpenApi(patch);
  const schema = result.paths["/api/whoami"].get.responses["200"].content["application/json"].schema;
  expect(schema.properties.kind).toEqual({ type: "string", enum: ["user", "project"] });
});

test("patchToOpenApi: array type", () => {
  const patch = parsePatchContent(`
endpoints:
  /projects:
    get:
      200:
        items: string[]
`);
  const result = patchToOpenApi(patch);
  const schema = result.paths["/projects"].get.responses["200"].content["application/json"].schema;
  expect(schema.properties.items).toEqual({ type: "array", items: { type: "string" } });
});

test("patchToOpenApi: datetime format shorthand", () => {
  const patch = parsePatchContent(`
endpoints:
  /projects/{id}:
    get:
      200:
        createdAt: datetime
`);
  const result = patchToOpenApi(patch);
  const schema = result.paths["/projects/{id}"].get.responses["200"].content["application/json"].schema;
  expect(schema.properties.createdAt).toEqual({ type: "string", format: "date-time" });
});

test("patchToOpenApi: schema reference via schemas section", () => {
  const patch = parsePatchContent(`
schemas:
  Project:
    id: string
    name: string

endpoints:
  /projects:
    get:
      200:
        items: Project[]
`);
  const result = patchToOpenApi(patch);

  expect(result.components.schemas.Project.properties.id).toEqual({ type: "string" });

  const schema = result.paths["/projects"].get.responses["200"].content["application/json"].schema;
  expect(schema.properties.items).toEqual({
    type: "array",
    items: { $ref: "#/components/schemas/Project" },
  });
});

test("patchToOpenApi: multiple methods on same path", () => {
  const patch = parsePatchContent(`
endpoints:
  /projects/{id}/tokens:
    post:
      201:
        id: string
        token: string
    get:
      200:
        tokens: string[]
`);
  const result = patchToOpenApi(patch);
  expect(result.paths["/projects/{id}/tokens"].post.responses["201"] != null).toBe(true);
  expect(result.paths["/projects/{id}/tokens"].get.responses["200"] != null).toBe(true);
});

test("patchToOpenApi: non-type string becomes description", () => {
  const patch = parsePatchContent(`
endpoints:
  /api/whoami:
    get:
      200:
        kind: Identity type of the caller
        userId?: string
`);
  const result = patchToOpenApi(patch);
  const schema = result.paths["/api/whoami"].get.responses["200"].content["application/json"].schema;
  expect(schema.properties.kind).toEqual({ type: "string", description: "Identity type of the caller" });
  expect(schema.properties.userId).toEqual({ type: "string" });
  expect(schema.required).toEqual(["kind"]);
});

test("patchToOpenApi: record with type + description + validations", () => {
  const patch = parsePatchContent(`
endpoints:
  /api/items:
    get:
      200:
        count:
          type: integer
          description: Number of items returned
          minimum: 0
          maximum: 100
        name:
          type: string
          description: Display name
          minLength: 1
          maxLength: 255
          example: "My Project"
`);
  const result = patchToOpenApi(patch);
  const schema = result.paths["/api/items"].get.responses["200"].content["application/json"].schema;
  expect(schema.properties.count).toEqual({
    type: "integer",
    description: "Number of items returned",
    minimum: 0,
    maximum: 100,
  });
  expect(schema.properties.name).toEqual({
    type: "string",
    description: "Display name",
    minLength: 1,
    maxLength: 255,
    example: "My Project",
  });
});

test("patchToOpenApi: record with pattern and default", () => {
  const patch = parsePatchContent(`
endpoints:
  /api/users:
    post:
      body:
        email:
          type: email
          description: User email address
          pattern: "^[^@]+@[^@]+$"
        role:
          type: string
          default: viewer
          enum: [viewer, editor, admin]
`);
  const result = patchToOpenApi(patch);
  const bodySchema = result.paths["/api/users"].post.requestBody.content["application/json"].schema;
  expect(bodySchema.properties.email).toEqual({
    type: "string",
    format: "email",
    description: "User email address",
    pattern: "^[^@]+@[^@]+$",
  });
  expect(bodySchema.properties.role).toEqual({
    type: "string",
    default: "viewer",
    enum: ["viewer", "editor", "admin"],
  });
});

// ---------------------------------------------------------------------------
// deepMerge
// ---------------------------------------------------------------------------

test("deepMerge: merges nested objects", () => {
  const target = { a: { b: 1, c: 2 } };
  const source = { a: { c: 3, d: 4 } };
  expect(deepMerge(target, source)).toEqual({ a: { b: 1, c: 3, d: 4 } });
});

test("deepMerge: source replaces arrays", () => {
  const target = { a: [1, 2] };
  const source = { a: [3] };
  expect(deepMerge(target, source)).toEqual({ a: [3] });
});

test("deepMerge: adds new keys", () => {
  const target = { a: 1 };
  const source = { b: 2 };
  expect(deepMerge(target, source)).toEqual({ a: 1, b: 2 });
});

test("deepMerge: handles null/undefined", () => {
  expect(deepMerge(null, { a: 1 })).toEqual({ a: 1 });
  expect(deepMerge({ a: 1 }, null)).toEqual({ a: 1 });
});

// ---------------------------------------------------------------------------
// applyPatch (integration)
// ---------------------------------------------------------------------------

test("applyPatch: merges patch into spec, adding missing response schemas", () => {
  const spec = {
    openapi: "3.0.0",
    paths: {
      "/open/v1/whoami": {
        get: {
          operationId: "WhoamiController_whoami",
          summary: "Identify the caller",
          responses: {
            "200": { description: "Success" },
            "401": { description: "Unauthorized" },
          },
        },
      },
    },
  };

  const patch = parsePatchContent(`
endpoints:
  /open/v1/whoami:
    get:
      200:
        kind: string
        userId?: string
        projectId?: string
`);

  const result = applyPatch(spec, patch);

  expect(result.paths["/open/v1/whoami"].get.operationId).toBe("WhoamiController_whoami");
  expect(result.paths["/open/v1/whoami"].get.summary).toBe("Identify the caller");

  const schema = result.paths["/open/v1/whoami"].get.responses["200"].content["application/json"].schema;
  expect(schema.type).toBe("object");
  expect(schema.properties.kind).toEqual({ type: "string" });
  expect(schema.properties.userId).toEqual({ type: "string" });
  expect(schema.required).toEqual(["kind"]);

  expect(result.paths["/open/v1/whoami"].get.responses["401"].description).toBe("Unauthorized");
});

test("applyPatch: raw section merged before endpoints", () => {
  const spec = { openapi: "3.0.0", paths: {} };

  const patch = parsePatchContent(`
raw:
  info:
    title: My API
    version: "1.0"

endpoints:
  /health:
    get:
      200:
        status: string
`);

  const result = applyPatch(spec, patch);
  expect(result.info.title).toBe("My API");
  expect(result.paths["/health"].get.responses["200"].content["application/json"].schema.properties.status).toEqual({
    type: "string",
  });
});
