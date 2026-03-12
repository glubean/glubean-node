import { test, expect, beforeEach, afterEach } from "vitest";
import { detectCiContext } from "./ci.js";

const CI_ENV_KEYS = [
  "CI",
  "GITHUB_ACTIONS",
  "GITHUB_REF_NAME",
  "GITHUB_REF",
  "GITHUB_SHA",
  "GITHUB_SERVER_URL",
  "GITHUB_REPOSITORY",
  "GITHUB_RUN_ID",
  "GITLAB_CI",
  "CI_COMMIT_REF_NAME",
  "CI_COMMIT_SHA",
  "CI_PIPELINE_URL",
  "CIRCLECI",
  "CIRCLE_BRANCH",
  "CIRCLE_TAG",
  "CIRCLE_SHA1",
  "CIRCLE_BUILD_URL",
  "BUILDKITE",
  "BUILDKITE_BRANCH",
  "BUILDKITE_COMMIT",
  "BUILDKITE_BUILD_URL",
  "JENKINS_URL",
];

let savedEnv: Map<string, string | undefined>;

beforeEach(() => {
  savedEnv = new Map();
  for (const key of CI_ENV_KEYS) {
    savedEnv.set(key, process.env[key]);
  }
  // Clear all CI env
  for (const key of CI_ENV_KEYS) {
    delete process.env[key];
  }
});

afterEach(() => {
  for (const [key, value] of savedEnv) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

test("detectCiContext: returns source=cli when no CI env vars", () => {
  const ctx = detectCiContext();
  expect(ctx.isCI).toBe(false);
  expect(ctx.source).toBe("cli");
  expect(ctx.gitRef).toBeUndefined();
  expect(ctx.commitSha).toBeUndefined();
  expect(ctx.runUrl).toBeUndefined();
});

test("detectCiContext: detects GitHub Actions", () => {
  process.env["CI"] = "true";
  process.env["GITHUB_ACTIONS"] = "true";
  process.env["GITHUB_REF_NAME"] = "main";
  process.env["GITHUB_SHA"] = "abc123def";
  process.env["GITHUB_SERVER_URL"] = "https://github.com";
  process.env["GITHUB_REPOSITORY"] = "org/repo";
  process.env["GITHUB_RUN_ID"] = "42";

  const ctx = detectCiContext();
  expect(ctx.isCI).toBe(true);
  expect(ctx.source).toBe("ci");
  expect(ctx.gitRef).toBe("main");
  expect(ctx.commitSha).toBe("abc123def");
  expect(ctx.runUrl).toBe("https://github.com/org/repo/actions/runs/42");
});

test("detectCiContext: detects GitLab CI", () => {
  process.env["CI"] = "true";
  process.env["GITLAB_CI"] = "true";
  process.env["CI_COMMIT_REF_NAME"] = "develop";
  process.env["CI_COMMIT_SHA"] = "deadbeef";
  process.env["CI_PIPELINE_URL"] = "https://gitlab.com/org/repo/-/pipelines/99";

  const ctx = detectCiContext();
  expect(ctx.isCI).toBe(true);
  expect(ctx.source).toBe("ci");
  expect(ctx.gitRef).toBe("develop");
  expect(ctx.commitSha).toBe("deadbeef");
  expect(ctx.runUrl).toBe("https://gitlab.com/org/repo/-/pipelines/99");
});

test("detectCiContext: detects CircleCI", () => {
  process.env["CI"] = "true";
  process.env["CIRCLECI"] = "true";
  process.env["CIRCLE_BRANCH"] = "feature/x";
  process.env["CIRCLE_SHA1"] = "cafebabe";
  process.env["CIRCLE_BUILD_URL"] = "https://circleci.com/gh/org/repo/123";

  const ctx = detectCiContext();
  expect(ctx.isCI).toBe(true);
  expect(ctx.source).toBe("ci");
  expect(ctx.gitRef).toBe("feature/x");
  expect(ctx.commitSha).toBe("cafebabe");
  expect(ctx.runUrl).toBe("https://circleci.com/gh/org/repo/123");
});

test("detectCiContext: detects Buildkite", () => {
  process.env["BUILDKITE"] = "true";
  process.env["BUILDKITE_BRANCH"] = "release/v1";
  process.env["BUILDKITE_COMMIT"] = "12345678";
  process.env["BUILDKITE_BUILD_URL"] = "https://buildkite.com/org/pipeline/builds/55";

  const ctx = detectCiContext();
  expect(ctx.isCI).toBe(true);
  expect(ctx.source).toBe("ci");
  expect(ctx.gitRef).toBe("release/v1");
  expect(ctx.commitSha).toBe("12345678");
  expect(ctx.runUrl).toBe("https://buildkite.com/org/pipeline/builds/55");
});

test("detectCiContext: generic CI=true without provider-specific vars", () => {
  process.env["CI"] = "true";

  const ctx = detectCiContext();
  expect(ctx.isCI).toBe(true);
  expect(ctx.source).toBe("ci");
  expect(ctx.gitRef).toBeUndefined();
  expect(ctx.commitSha).toBeUndefined();
  expect(ctx.runUrl).toBeUndefined();
});
