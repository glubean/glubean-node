/**
 * @module handlers
 *
 * Built-in redaction handlers. Each handler interprets a specific payload shape.
 *
 * - `json` — recursive object/array walker (delegates to engine.redact)
 * - `raw-string` — value-pattern matching only
 * - `url-query` — parse URL, redact query param names/values, serialize back
 * - `headers` — header map with case-insensitive keys, cookie/set-cookie parsing
 */

import type { RedactionHandler, RedactionEngineInterface, RedactionResult, HandlerContext } from "./types.js";

// ── json handler ─────────────────────────────────────────────────────────────

/**
 * Default handler: delegates directly to engine.redact() which recursively
 * walks objects/arrays and applies key-level + value-level plugins.
 */
export const jsonHandler: RedactionHandler = {
  name: "json",
  process(value, ctx, engine) {
    return engine.redact(value, { id: ctx.scopeId, name: ctx.scopeName });
  },
};

// ── raw-string handler ───────────────────────────────────────────────────────

/**
 * Handles plain string values. Wraps the string in an object so the engine
 * can apply value-level pattern plugins, then extracts the result.
 */
export const rawStringHandler: RedactionHandler = {
  name: "raw-string",
  process(value, ctx, engine) {
    if (typeof value !== "string") {
      return { value, redacted: false, details: [] };
    }
    // Wrap in object so the engine walks it as a string value
    const result = engine.redact({ __raw: value }, { id: ctx.scopeId, name: ctx.scopeName });
    const redacted = result.value as Record<string, unknown>;
    return {
      value: redacted.__raw,
      redacted: result.redacted,
      details: result.details,
    };
  },
};

// ── url-query handler ────────────────────────────────────────────────────────

/**
 * Parses a URL string, redacts query parameter names/values using the engine,
 * then serializes back to a URL string.
 */
export const urlQueryHandler: RedactionHandler = {
  name: "url-query",
  process(value, ctx, engine) {
    if (typeof value !== "string") {
      return { value, redacted: false, details: [] };
    }

    let url: URL;
    try {
      url = new URL(value);
    } catch {
      // Not a valid URL — fall back to raw string redaction
      return engine.redact(value, { id: ctx.scopeId, name: ctx.scopeName });
    }

    // Collect all entries first to preserve multiplicity (e.g., ?token=a&token=b)
    const entries = [...url.searchParams.entries()];
    if (entries.length === 0) {
      return { value, redacted: false, details: [] };
    }

    let didRedact = false;
    const details: RedactionResult["details"] = [];
    const redactedEntries: [string, string][] = [];

    for (const [key, raw] of entries) {
      const result = engine.redact(
        { [key]: raw },
        { id: ctx.scopeId, name: ctx.scopeName },
      );
      if (result.redacted) {
        const redacted = result.value as Record<string, unknown>;
        redactedEntries.push([key, String(redacted[key] ?? raw)]);
        didRedact = true;
        details.push(...result.details);
      } else {
        redactedEntries.push([key, raw]);
      }
    }

    if (!didRedact) {
      return { value, redacted: false, details };
    }

    // Rebuild URL with redacted params, preserving multiplicity
    const redactedUrl = new URL(url.origin + url.pathname);
    for (const [k, v] of redactedEntries) {
      redactedUrl.searchParams.append(k, v);
    }
    // Preserve hash
    redactedUrl.hash = url.hash;

    return {
      value: redactedUrl.toString(),
      redacted: true,
      details,
    };
  },
};

// ── headers handler ──────────────────────────────────────────────────────────

/**
 * Parse a Cookie header string into key/value pairs.
 */
function parseCookieHeader(str: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of str.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    result[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return result;
}

/**
 * Serialize a cookie key/value map back to a Cookie header string.
 */
function serializeCookieHeader(obj: Record<string, unknown>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join("; ");
}

/**
 * Handles HTTP header maps with special treatment for cookie headers.
 *
 * - Normal headers: redact as key/value pairs
 * - `cookie`: parse into name/value pairs, redact, serialize back
 * - `set-cookie`: parse value portion, preserve attributes (Path, Domain, etc.)
 */
export const headersHandler: RedactionHandler = {
  name: "headers",
  process(value, ctx, engine) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { value, redacted: false, details: [] };
    }

    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    let didRedact = false;
    const details: RedactionResult["details"] = [];

    for (const [headerName, headerValue] of Object.entries(input)) {
      const lower = headerName.toLowerCase();

      // Cookie header: parse into key/value pairs
      if (lower === "cookie" && typeof headerValue === "string") {
        const parsed = parseCookieHeader(headerValue);
        const result = engine.redact(parsed, {
          id: ctx.scopeId,
          name: ctx.scopeName,
        });
        output[headerName] = serializeCookieHeader(
          result.value as Record<string, unknown>,
        );
        if (result.redacted) {
          didRedact = true;
          details.push(...result.details);
        }
        continue;
      }

      // Set-Cookie header: redact the value portion, preserve attributes
      // Supports both single string and string[] (common in HTTP client shapes)
      if (lower === "set-cookie") {
        if (typeof headerValue === "string") {
          const redacted = redactSetCookie(headerValue, ctx, engine);
          output[headerName] = redacted.value;
          if (redacted.redacted) {
            didRedact = true;
            details.push(...redacted.details);
          }
          continue;
        }
        if (Array.isArray(headerValue)) {
          const redactedCookies: string[] = [];
          for (const cookie of headerValue) {
            if (typeof cookie !== "string") {
              redactedCookies.push(cookie);
              continue;
            }
            const redacted = redactSetCookie(cookie, ctx, engine);
            redactedCookies.push(redacted.value as string);
            if (redacted.redacted) {
              didRedact = true;
              details.push(...redacted.details);
            }
          }
          output[headerName] = redactedCookies;
          continue;
        }
      }

      // Normal header: redact as { headerName: value }
      const result = engine.redact(
        { [headerName]: headerValue },
        { id: ctx.scopeId, name: ctx.scopeName },
      );
      output[headerName] = (result.value as Record<string, unknown>)[
        headerName
      ];
      if (result.redacted) {
        didRedact = true;
        details.push(...result.details);
      }
    }

    return { value: didRedact ? output : value, redacted: didRedact, details };
  },
};

/**
 * Redact a Set-Cookie header value.
 * Preserves cookie attributes (Path, Domain, HttpOnly, Secure, SameSite, Max-Age, Expires).
 */
function redactSetCookie(
  raw: string,
  ctx: HandlerContext,
  engine: RedactionEngineInterface,
): RedactionResult {
  const parts = raw.split(";").map((p) => p.trim());
  if (parts.length === 0) {
    return { value: raw, redacted: false, details: [] };
  }

  // First part is name=value
  const first = parts[0];
  const eq = first.indexOf("=");
  if (eq === -1) {
    return { value: raw, redacted: false, details: [] };
  }

  const cookieName = first.slice(0, eq).trim();
  const cookieValue = first.slice(eq + 1).trim();

  const result = engine.redact(
    { [cookieName]: cookieValue },
    { id: ctx.scopeId, name: ctx.scopeName },
  );

  if (!result.redacted) {
    return { value: raw, redacted: false, details: [] };
  }

  const redacted = result.value as Record<string, unknown>;
  const redactedValue = String(redacted[cookieName] ?? cookieValue);

  // Reconstruct: redacted name=value + original attributes
  const attributes = parts.slice(1);
  const reconstructed =
    attributes.length > 0
      ? `${cookieName}=${redactedValue}; ${attributes.join("; ")}`
      : `${cookieName}=${redactedValue}`;

  return { value: reconstructed, redacted: true, details: result.details };
}

// ── Handler registry ─────────────────────────────────────────────────────────

/** All built-in handlers indexed by name. */
export const BUILTIN_HANDLERS: Record<string, RedactionHandler> = {
  json: jsonHandler,
  "raw-string": rawStringHandler,
  "url-query": urlQueryHandler,
  headers: headersHandler,
};
