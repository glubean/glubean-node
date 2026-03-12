import { test, expect } from "vitest";
import { collectNavigationMetrics } from "./metrics.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeMockPage(timing: {
  navigationStart: number;
  domContentLoadedEventEnd: number;
  loadEventEnd: number;
}) {
  return {
    evaluate: (_fn: unknown) => Promise.resolve(timing),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function makeBrokenPage() {
  return {
    evaluate: () =>
      Promise.reject(new Error("Execution context was destroyed")),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

test("collectNavigationMetrics: emits page_load_ms and dom_content_loaded_ms", async () => {
  const emitted: Array<
    { name: string; value: number; tags?: Record<string, string> }
  > = [];

  const page = makeMockPage({
    navigationStart: 1000,
    domContentLoadedEventEnd: 1300,
    loadEventEnd: 1500,
  });

  await collectNavigationMetrics(
    page,
    (name, value, options) => {
      emitted.push({ name, value, tags: options?.tags });
    },
    "https://example.com/dashboard",
  );

  expect(emitted).toHaveLength(2);
  expect(emitted[0].name).toBe("page_load_ms");
  expect(emitted[0].value).toBe(500);
  expect(emitted[0].tags?.url).toBe("/dashboard");
  expect(emitted[1].name).toBe("dom_content_loaded_ms");
  expect(emitted[1].value).toBe(300);
});

test("collectNavigationMetrics: skips page_load_ms when loadEventEnd is 0", async () => {
  const emitted: Array<{ name: string; value: number }> = [];

  const page = makeMockPage({
    navigationStart: 1000,
    domContentLoadedEventEnd: 1200,
    loadEventEnd: 0,
  });

  await collectNavigationMetrics(
    page,
    (name, value) => { emitted.push({ name, value }); },
    "https://example.com/",
  );

  expect(emitted).toHaveLength(1);
  expect(emitted[0].name).toBe("dom_content_loaded_ms");
  expect(emitted[0].value).toBe(200);
});

test("collectNavigationMetrics: skips all when navigationStart is 0", async () => {
  const emitted: Array<{ name: string }> = [];

  const page = makeMockPage({
    navigationStart: 0,
    domContentLoadedEventEnd: 1200,
    loadEventEnd: 1500,
  });

  await collectNavigationMetrics(
    page,
    (name) => { emitted.push({ name }); },
    "https://example.com/",
  );

  expect(emitted).toHaveLength(0);
});

test("collectNavigationMetrics: silently handles evaluate failure", async () => {
  const emitted: Array<{ name: string }> = [];

  await collectNavigationMetrics(
    makeBrokenPage(),
    (name) => { emitted.push({ name }); },
    "https://example.com/",
  );

  expect(emitted).toHaveLength(0);
});

test("collectNavigationMetrics: shortens URL to pathname + search in tags", async () => {
  const emitted: Array<{ tags?: Record<string, string> }> = [];

  const page = makeMockPage({
    navigationStart: 1000,
    domContentLoadedEventEnd: 1200,
    loadEventEnd: 1500,
  });

  await collectNavigationMetrics(
    page,
    (_name, _value, options) => { emitted.push({ tags: options?.tags }); },
    "https://example.com/search?q=glubean&page=1",
  );

  expect(emitted[0].tags?.url).toBe("/search?q=glubean&page=1");
});
