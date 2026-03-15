/**
 * @module plugins
 *
 * Re-exports all built-in plugins and provides factories
 * for assembling plugin pipelines.
 */

import type { RedactionPlugin } from "../types.js";
import { sensitiveKeysPlugin } from "./sensitive-keys.js";
import { jwtPlugin } from "./jwt.js";
import { bearerPlugin } from "./bearer.js";
import { awsKeysPlugin } from "./aws-keys.js";
import { githubTokensPlugin } from "./github-tokens.js";
import { emailPlugin } from "./email.js";
import { ipAddressPlugin } from "./ip-address.js";
import { creditCardPlugin } from "./credit-card.js";
import { hexKeysPlugin } from "./hex-keys.js";

export {
  awsKeysPlugin,
  bearerPlugin,
  creditCardPlugin,
  emailPlugin,
  githubTokensPlugin,
  hexKeysPlugin,
  ipAddressPlugin,
  jwtPlugin,
  sensitiveKeysPlugin,
};

/** Map of pattern name → plugin for built-in patterns. */
const PATTERN_PLUGINS: Record<string, RedactionPlugin> = {
  jwt: jwtPlugin,
  bearer: bearerPlugin,
  awsKeys: awsKeysPlugin,
  githubTokens: githubTokensPlugin,
  email: emailPlugin,
  ipAddress: ipAddressPlugin,
  creditCard: creditCardPlugin,
  hexKeys: hexKeysPlugin,
};

/**
 * Create pattern plugins for a set of enabled pattern names.
 */
export function createPatternPlugins(
  enabledPatterns: Set<string>,
): RedactionPlugin[] {
  const plugins: RedactionPlugin[] = [];
  for (const [name, plugin] of Object.entries(PATTERN_PLUGINS)) {
    if (enabledPatterns.has(name)) {
      plugins.push(plugin);
    }
  }
  return plugins;
}
