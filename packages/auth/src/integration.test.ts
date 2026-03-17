import { describe, it, expect } from "vitest";
import { configure, test as glubeanTest } from "@glubean/sdk";
import { bearer, apiKey } from "./index.js";

describe("plugin integration with configure()", () => {
  it("bearer() works with configure()", () => {
    const config = configure({
      http: bearer({ prefixUrl: "{{BASE_URL}}", token: "{{API_TOKEN}}" }),
    });
    expect(config.http).toBeDefined();
  });

  it("apiKey() works with configure()", () => {
    const config = configure({
      http: apiKey({ prefixUrl: "{{BASE_URL}}", param: "X-API-Key", value: "{{MY_KEY}}" }),
    });
    expect(config.http).toBeDefined();
  });

  it("test() + bearer() creates a runnable test definition", () => {
    configure({
      http: bearer({ prefixUrl: "{{BASE_URL}}", token: "{{TOKEN}}" }),
    });

    const myTest = glubeanTest(
      { id: "auth-test", name: "Auth integration" },
      async ({ http }) => {
        expect(http).toBeDefined();
      },
    );

    expect(myTest).toBeDefined();
  });
});
