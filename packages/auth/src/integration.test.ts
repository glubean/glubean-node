import { describe, it, expect } from "vitest";
import { configure, test as glubeanTest } from "@glubean/sdk";
import { bearer, apiKey } from "./index.js";

describe("plugin integration with configure()", () => {
  it("bearer() works with configure()", () => {
    const config = configure({
      http: bearer("BASE_URL", "API_TOKEN"),
      vars: { BASE_URL: "https://api.example.com" },
      secrets: { API_TOKEN: "test-token-123" },
    });

    // configure() returns a typed context with http client
    expect(config.http).toBeDefined();
  });

  it("apiKey() works with configure()", () => {
    const config = configure({
      http: apiKey("BASE_URL", "X-API-Key", "MY_KEY"),
      vars: { BASE_URL: "https://api.example.com" },
      secrets: { MY_KEY: "secret-key-456" },
    });

    expect(config.http).toBeDefined();
  });

  it("test() + bearer() creates a runnable test definition", () => {
    const { http, expect: ex, log } = configure({
      http: bearer("BASE_URL", "TOKEN"),
      vars: { BASE_URL: "https://dummyjson.com" },
      secrets: { TOKEN: "dummy" },
    });

    const myTest = glubeanTest(
      { id: "auth-test", name: "Auth integration" },
      async ({ http }) => {
        // This would run in the harness — just verify the test definition is valid
        expect(http).toBeDefined();
      },
    );

    // test() returns a valid test export
    expect(myTest).toBeDefined();
  });
});
