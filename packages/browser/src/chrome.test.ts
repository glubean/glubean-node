import { test, expect, vi, afterEach } from "vitest";
import { resolveEndpoint } from "./chrome.js";

afterEach(() => {
  vi.restoreAllMocks();
});

test("resolveEndpoint: ws:// passthrough", async () => {
  const ws = "ws://localhost:9222/devtools/browser/abc123";
  expect(await resolveEndpoint(ws)).toBe(ws);
});

test("resolveEndpoint: wss:// passthrough", async () => {
  const wss = "wss://chrome.example.com/devtools/browser/abc123";
  expect(await resolveEndpoint(wss)).toBe(wss);
});

test("resolveEndpoint: http:// auto-discovers WS URL", async () => {
  const expectedWs = "ws://127.0.0.1:9222/devtools/browser/fake-id";

  vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : (input as Request).url;
    expect(url).toBe("http://localhost:9222/json/version");
    return Promise.resolve(
      new Response(JSON.stringify({ webSocketDebuggerUrl: expectedWs }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  });

  const result = await resolveEndpoint("http://localhost:9222");
  expect(result).toBe(expectedWs);
});

test("resolveEndpoint: http:// strips trailing slash", async () => {
  let fetchedUrl = "";

  vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    fetchedUrl = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : (input as Request).url;
    return Promise.resolve(
      new Response(JSON.stringify({ webSocketDebuggerUrl: "ws://x" }), {
        status: 200,
      }),
    );
  });

  await resolveEndpoint("http://localhost:9222/");
  expect(fetchedUrl).toBe("http://localhost:9222/json/version");
});

test("resolveEndpoint: http:// fetch failure gives clear error", async () => {
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Connection refused"));

  await expect(resolveEndpoint("http://localhost:9222")).rejects.toThrow(
    "Failed to connect to Chrome",
  );
});

test("resolveEndpoint: http:// non-200 response", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("not found", { status: 404 }),
  );

  await expect(resolveEndpoint("http://localhost:9222")).rejects.toThrow("HTTP 404");
});

test("resolveEndpoint: http:// missing webSocketDebuggerUrl field", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ Browser: "Chrome/131" }), { status: 200 }),
  );

  await expect(resolveEndpoint("http://localhost:9222")).rejects.toThrow(
    "did not return a webSocketDebuggerUrl",
  );
});

test("resolveEndpoint: invalid protocol throws", async () => {
  await expect(resolveEndpoint("ftp://chrome.local")).rejects.toThrow(
    "Invalid Chrome endpoint",
  );
});
