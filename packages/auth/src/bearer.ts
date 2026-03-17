import type { ConfigureHttpOptions } from "@glubean/sdk";

export interface BearerOptions {
  /** Base URL — literal or `{{VAR}}` reference */
  prefixUrl: string;
  /** Bearer token — literal or `{{SECRET}}` reference */
  token: string;
}

/**
 * Bearer token authentication.
 *
 * @example
 * ```ts
 * // Reference from .env.secrets
 * bearer({ prefixUrl: "{{BASE_URL}}", token: "{{API_TOKEN}}" })
 *
 * // Hardcoded (quick prototyping)
 * bearer({ prefixUrl: "https://api.example.com", token: "sk-xxx" })
 * ```
 */
export function bearer(opts: BearerOptions): ConfigureHttpOptions {
  return {
    prefixUrl: opts.prefixUrl,
    headers: {
      Authorization: `Bearer ${opts.token}`,
    },
  };
}
