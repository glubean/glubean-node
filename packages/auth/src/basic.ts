import type { ConfigureHttpOptions } from "@glubean/sdk";

const MARKER = "X-Glubean-Basic-Auth";

/**
 * HTTP Basic authentication.
 *
 * Uses a beforeRequest hook to compute `Authorization: Basic base64(user:pass)`
 * from resolved secret values.
 *
 * @param prefixUrlVar - Var key for the base URL
 * @param usernameSecret - Secret key for the username
 * @param passwordSecret - Secret key for the password
 */
export function basicAuth(
  prefixUrlVar: string,
  usernameSecret: string,
  passwordSecret: string,
): ConfigureHttpOptions {
  return {
    prefixUrl: prefixUrlVar,
    headers: {
      [MARKER]: `{{${usernameSecret}}}:{{${passwordSecret}}}`,
    },
    hooks: {
      beforeRequest: [
        (request: Request): Request => {
          const credentials = request.headers.get(MARKER);
          if (!credentials) return request;

          const encoded = Buffer.from(credentials).toString("base64");
          const headers = new Headers(request.headers);
          headers.delete(MARKER);
          headers.set("Authorization", `Basic ${encoded}`);
          return new Request(request.url, {
            method: request.method,
            headers,
            body: request.body,
            redirect: request.redirect,
            signal: request.signal,
          });
        },
      ],
    },
  };
}
