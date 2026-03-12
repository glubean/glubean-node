import { describe, it, expect } from "vitest";
import { bearer, basicAuth, apiKey } from "./index.js";

describe("bearer", () => {
  it("returns ConfigureHttpOptions with Authorization header", () => {
    const opts = bearer("base_url", "token");
    expect(opts.prefixUrl).toBe("base_url");
    expect(opts.headers).toEqual({ Authorization: "Bearer {{token}}" });
  });
});

describe("basicAuth", () => {
  it("returns ConfigureHttpOptions with beforeRequest hook", () => {
    const opts = basicAuth("base_url", "user", "pass");
    expect(opts.prefixUrl).toBe("base_url");
    expect(opts.hooks?.beforeRequest).toHaveLength(1);
  });

  it("hook computes base64 from marker header", () => {
    const opts = basicAuth("base_url", "user", "pass");
    const hook = opts.hooks!.beforeRequest![0];

    const request = new Request("https://example.com", {
      headers: { "X-Glubean-Basic-Auth": "admin:secret123" },
    });
    const result = hook(request, {}) as Request;

    expect(result.headers.get("Authorization")).toBe(
      `Basic ${Buffer.from("admin:secret123").toString("base64")}`
    );
    expect(result.headers.has("X-Glubean-Basic-Auth")).toBe(false);
  });
});

describe("apiKey", () => {
  it("header mode: sets header with template", () => {
    const opts = apiKey("base_url", "X-API-Key", "key_secret");
    expect(opts.headers).toEqual({ "X-API-Key": "{{key_secret}}" });
    expect(opts.hooks).toBeUndefined();
  });

  it("query mode: uses beforeRequest hook", () => {
    const opts = apiKey("base_url", "api_key", "key_secret", "query");
    expect(opts.hooks?.beforeRequest).toHaveLength(1);

    const hook = opts.hooks!.beforeRequest![0];
    const request = new Request("https://example.com/path", {
      headers: { "X-Glubean-ApiKey-Query": "my-secret-key" },
    });
    const result = hook(request, {}) as Request;

    const url = new URL(result.url);
    expect(url.searchParams.get("api_key")).toBe("my-secret-key");
    expect(result.headers.has("X-Glubean-ApiKey-Query")).toBe(false);
  });
});
