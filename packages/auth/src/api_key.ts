import type { ConfigureHttpOptions } from "@glubean/sdk";

/**
 * API Key authentication — header or query param.
 *
 * @param prefixUrlVar - Var key for the base URL
 * @param headerOrParam - Header name or query param name
 * @param secretKey - Secret key for the API key value
 * @param location - "header" (default) or "query"
 */
export function apiKey(
  prefixUrlVar: string,
  headerOrParam: string,
  secretKey: string,
  location: "header" | "query" = "header",
): ConfigureHttpOptions {
  if (location === "query") {
    const MARKER = "X-Glubean-ApiKey-Query";
    return {
      prefixUrl: prefixUrlVar,
      headers: { [MARKER]: `{{${secretKey}}}` },
      hooks: {
        beforeRequest: [
          (request: Request): Request => {
            const keyValue = request.headers.get(MARKER);
            if (!keyValue) return request;

            const url = new URL(request.url);
            url.searchParams.set(headerOrParam, keyValue);
            const headers = new Headers(request.headers);
            headers.delete(MARKER);
            return new Request(url.toString(), {
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

  return {
    prefixUrl: prefixUrlVar,
    headers: { [headerOrParam]: `{{${secretKey}}}` },
  };
}
