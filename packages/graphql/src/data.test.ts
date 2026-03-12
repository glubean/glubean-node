/**
 * Tests for the fromGql data loader.
 */

import { test, expect } from "vitest";
import { resolve } from "node:path";
import { fromGql } from "./data.js";

test("fromGql - loads .gql file and returns trimmed content", async () => {
  const testdataPath = resolve(import.meta.dirname!, "../testdata/getUser.gql");
  const query = await fromGql(testdataPath);
  expect(query.includes("query GetUser($id: ID!)")).toBe(true);
  expect(query.includes("user(id: $id)")).toBe(true);
  expect(query.includes("name")).toBe(true);
  expect(query.includes("email")).toBe(true);
  expect(query).toBe(query.trim());
});

test("fromGql - nonexistent file throws", async () => {
  await expect(
    () => fromGql("./nonexistent.gql"),
  ).rejects.toThrow();
});
