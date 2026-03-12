import { test, expect } from "vitest";
import { shouldInclude, shouldSkipPath, shouldSkipProtocol } from "./network.js";

const DEFAULT_INCLUDE = ["application/json", "text/html"];
const DEFAULT_EXCLUDE = ["/favicon.ico", "/favicon.png", "/apple-touch-icon.png", "/apple-touch-icon-precomposed.png"];

// Protocol filtering
test("shouldSkipProtocol: data: URLs", () => {
  expect(shouldSkipProtocol("data:text/html,<h1>Hi</h1>")).toBe(true);
  expect(shouldSkipProtocol("data:image/png;base64,abc")).toBe(true);
});

test("shouldSkipProtocol: chrome-extension: URLs", () => {
  expect(shouldSkipProtocol("chrome-extension://abc/popup.html")).toBe(true);
});

test("shouldSkipProtocol: devtools: URLs", () => {
  expect(shouldSkipProtocol("devtools://devtools/bundled/inspector.html")).toBe(true);
});

test("shouldSkipProtocol: blob: URLs", () => {
  expect(shouldSkipProtocol("blob:http://localhost:3000/abc-123")).toBe(true);
});

test("shouldSkipProtocol: http/https pass through", () => {
  expect(shouldSkipProtocol("http://localhost:3000/api")).toBe(false);
  expect(shouldSkipProtocol("https://example.com/api")).toBe(false);
});

// Content-type include filtering
test("shouldInclude: JSON content-type", () => {
  expect(shouldInclude("application/json", DEFAULT_INCLUDE)).toBe(true);
  expect(shouldInclude("application/json; charset=utf-8", DEFAULT_INCLUDE)).toBe(true);
});

test("shouldInclude: HTML content-type", () => {
  expect(shouldInclude("text/html", DEFAULT_INCLUDE)).toBe(true);
  expect(shouldInclude("text/html; charset=utf-8", DEFAULT_INCLUDE)).toBe(true);
});

test("shouldInclude: static assets excluded by default", () => {
  expect(shouldInclude("text/javascript", DEFAULT_INCLUDE)).toBe(false);
  expect(shouldInclude("text/css", DEFAULT_INCLUDE)).toBe(false);
  expect(shouldInclude("image/png", DEFAULT_INCLUDE)).toBe(false);
  expect(shouldInclude("image/svg+xml", DEFAULT_INCLUDE)).toBe(false);
  expect(shouldInclude("font/woff2", DEFAULT_INCLUDE)).toBe(false);
  expect(shouldInclude("application/javascript", DEFAULT_INCLUDE)).toBe(false);
});

test("shouldInclude: custom include list", () => {
  const custom = ["application/json", "text/xml", "application/graphql"];
  expect(shouldInclude("text/xml", custom)).toBe(true);
  expect(shouldInclude("application/graphql-response+json", custom)).toBe(true);
  expect(shouldInclude("text/html", custom)).toBe(false);
});

test("shouldInclude: case insensitive", () => {
  expect(shouldInclude("Application/JSON", DEFAULT_INCLUDE)).toBe(true);
  expect(shouldInclude("TEXT/HTML", DEFAULT_INCLUDE)).toBe(true);
});

test("shouldInclude: empty content-type excluded", () => {
  expect(shouldInclude("", DEFAULT_INCLUDE)).toBe(false);
});

// Path exclusion
test("shouldSkipPath: default excluded paths", () => {
  expect(shouldSkipPath("https://example.com/favicon.ico", DEFAULT_EXCLUDE)).toBe(true);
  expect(shouldSkipPath("https://example.com/favicon.png", DEFAULT_EXCLUDE)).toBe(true);
  expect(shouldSkipPath("https://example.com/apple-touch-icon.png", DEFAULT_EXCLUDE)).toBe(true);
});

test("shouldSkipPath: normal paths pass through", () => {
  expect(shouldSkipPath("https://example.com/api/users", DEFAULT_EXCLUDE)).toBe(false);
  expect(shouldSkipPath("https://example.com/login", DEFAULT_EXCLUDE)).toBe(false);
});

test("shouldSkipPath: empty exclude list keeps everything", () => {
  expect(shouldSkipPath("https://example.com/favicon.ico", [])).toBe(false);
});
