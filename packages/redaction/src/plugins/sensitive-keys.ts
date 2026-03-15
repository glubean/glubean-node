/**
 * Sensitive-keys plugin — key-level redaction.
 *
 * Checks if a JSON key or header name matches one of the configured
 * sensitive keys (case-insensitive substring match).
 */

import type { RedactionPlugin } from "../types.js";

/** Config for the sensitive keys plugin. */
export interface SensitiveKeysConfig {
  /** Whether to include the built-in sensitive keys list. */
  useBuiltIn: boolean;
  /** Additional keys to treat as sensitive. */
  additional: string[];
  /** Keys to exclude from the built-in list. */
  excluded: string[];
}

/**
 * Built-in sensitive keys.
 * v2: these are only used when `useBuiltIn: true` (for backwards compat).
 * In the new model, sensitive keys live in scope declarations.
 */
const BUILT_IN_SENSITIVE_KEYS: readonly string[] = [
  "password",
  "passwd",
  "secret",
  "token",
  "api_key",
  "apikey",
  "api-key",
  "access_token",
  "refresh_token",
  "authorization",
  "auth",
  "credential",
  "credentials",
  "private_key",
  "privatekey",
  "private-key",
  "ssh_key",
  "client_secret",
  "client-secret",
  "bearer",
];

/**
 * Build the sensitive key set from config.
 */
function buildKeySet(config: SensitiveKeysConfig): Set<string> {
  const keys = new Set<string>();

  if (config.useBuiltIn) {
    for (const k of BUILT_IN_SENSITIVE_KEYS) {
      keys.add(k);
    }
  }

  for (const k of config.additional ?? []) {
    keys.add(k.toLowerCase());
  }

  for (const k of config.excluded ?? []) {
    keys.delete(k.toLowerCase());
  }

  return keys;
}

/**
 * Create a sensitive-keys plugin from config.
 *
 * Key matching uses case-insensitive substring — "x-authorization-token"
 * matches "authorization".
 */
export function sensitiveKeysPlugin(
  config: SensitiveKeysConfig,
): RedactionPlugin {
  const keys = buildKeySet(config);

  return {
    name: "sensitive-keys",
    isKeySensitive: (key: string): boolean | undefined => {
      const lower = key.toLowerCase();
      if (keys.has(lower)) return true;
      for (const sensitive of keys) {
        if (lower.includes(sensitive)) return true;
      }
      return undefined;
    },
  };
}
