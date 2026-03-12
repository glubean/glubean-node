import type { ConfigureHttpOptions } from "@glubean/sdk";

/**
 * Bearer token authentication.
 *
 * @param prefixUrlVar - Var key for the base URL
 * @param tokenSecret - Secret key for the bearer token
 */
export function bearer(
  prefixUrlVar: string,
  tokenSecret: string,
): ConfigureHttpOptions {
  return {
    prefixUrl: prefixUrlVar,
    headers: {
      Authorization: `Bearer {{${tokenSecret}}}`,
    },
  };
}
