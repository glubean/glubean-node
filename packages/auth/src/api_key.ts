import type { ConfigureHttpOptions } from "@glubean/sdk";

export interface ApiKeyOptions {
  /** Base URL — literal or `{{VAR}}` reference */
  prefixUrl: string;
  /** Header name or query param name */
  param: string;
  /** API key value — literal or `{{SECRET}}` reference */
  value: string;
  /** Where to send the key: "header" (default) or "query" */
  location?: "header" | "query";
}

/**
 * API Key authentication — header or query param.
 *
 * @example
 * ```ts
 * // Header mode (default)
 * apiKey({ prefixUrl: "{{BASE_URL}}", param: "X-API-Key", value: "{{API_KEY}}" })
 *
 * // Query param mode
 * apiKey({ prefixUrl: "{{BASE_URL}}", param: "apiKey", value: "{{API_KEY}}", location: "query" })
 *
 * // Hardcoded
 * apiKey({ prefixUrl: "https://api.example.com", param: "apiKey", value: "sk-xxx", location: "query" })
 * ```
 */
export function apiKey(opts: ApiKeyOptions): ConfigureHttpOptions {
  const { prefixUrl, param, value, location = "header" } = opts;

  if (location === "query") {
    const MARKER = "X-Glubean-ApiKey-Query";
    return {
      prefixUrl,
      headers: { [MARKER]: value },
      hooks: {
        beforeRequest: [
          (request: Request): Request => {
            const keyValue = request.headers.get(MARKER);
            if (!keyValue) return request;

            const url = new URL(request.url);
            url.searchParams.set(param, keyValue);
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
    prefixUrl,
    headers: { [param]: value },
  };
}
