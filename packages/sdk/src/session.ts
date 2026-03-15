import type { SessionDefinition } from "./types.js";

/**
 * Define a session setup/teardown lifecycle for cross-file state sharing.
 *
 * Place in `session.ts` at your test root. The runner auto-discovers it.
 *
 * @example
 * ```ts
 * import { defineSession } from "@glubean/sdk";
 *
 * export default defineSession({
 *   async setup(ctx) {
 *     const { access_token } = await ctx.http
 *       .post("/auth/login", {
 *         json: { user: ctx.vars.require("USER"), pass: ctx.secrets.require("PASS") },
 *       })
 *       .json();
 *     ctx.session.set("token", access_token);
 *   },
 *   async teardown(ctx) {
 *     await ctx.http.post("/auth/logout", {
 *       headers: { Authorization: `Bearer ${ctx.session.get("token")}` },
 *     });
 *   },
 * });
 * ```
 */
export function defineSession(def: SessionDefinition): SessionDefinition {
  return def;
}
