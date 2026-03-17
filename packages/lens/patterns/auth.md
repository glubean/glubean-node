# @glubean/auth

> **Requires:** `npm install @glubean/auth`

Pre-built auth strategies. Returns `ConfigureHttpOptions` — pass directly to `configure({ http: ... })`.

All values support `{{KEY}}` references (resolved from .env / .env.secrets) or literal strings.

For manual auth flows using builder steps, see [builder-reuse.md](builder-reuse.md).

## Bearer token

```typescript
import { configure } from "@glubean/sdk";
import { bearer } from "@glubean/auth";

export const { http: api } = configure({
  http: bearer({ prefixUrl: "{{BASE_URL}}", token: "{{API_TOKEN}}" }),
});
// Every request gets: Authorization: Bearer <resolved value>
```

## API key (header)

```typescript
import { apiKey } from "@glubean/auth";

export const { http: api } = configure({
  http: apiKey({ prefixUrl: "{{BASE_URL}}", param: "X-Api-Key", value: "{{API_KEY}}" }),
});
// Every request gets header: X-Api-Key: <value>
```

## API key (query param)

```typescript
import { apiKey } from "@glubean/auth";

export const { http: api } = configure({
  http: apiKey({ prefixUrl: "{{BASE_URL}}", param: "apiKey", value: "{{API_KEY}}", location: "query" }),
});
// Every request gets: ?apiKey=<value>
```

## Basic auth

```typescript
import { basicAuth } from "@glubean/auth";

export const { http: api } = configure({
  http: basicAuth({ prefixUrl: "{{BASE_URL}}", username: "{{USER}}", password: "{{PASS}}" }),
});
// Every request gets: Authorization: Basic base64(user:pass)
```

## OAuth2 — client credentials

```typescript
import { oauth2 } from "@glubean/auth";

export const { http: api } = configure({
  http: oauth2.clientCredentials({
    prefixUrl: "{{BASE_URL}}",
    tokenUrl: "{{OAUTH_TOKEN_URL}}",
    clientId: "{{CLIENT_ID}}",
    clientSecret: "{{CLIENT_SECRET}}",
    scope: "read write",              // Optional
  }),
});
// Auto-fetches token, caches it, refreshes before expiry
```

## OAuth2 — refresh token

```typescript
import { oauth2 } from "@glubean/auth";

export const { http: api } = configure({
  http: oauth2.refreshToken({
    prefixUrl: "{{BASE_URL}}",
    tokenUrl: "{{OAUTH_TOKEN_URL}}",
    refreshToken: "{{REFRESH_TOKEN}}",
    clientId: "{{CLIENT_ID}}",
    clientSecret: "{{CLIENT_SECRET}}",    // Optional
  }),
});
// Auto-refreshes on 401
```

## withLogin — builder transform

```typescript
import { test } from "@glubean/sdk";
import { withLogin } from "@glubean/auth";

const login = withLogin({
  endpoint: "{{BASE_URL}}/auth/login",
  credentials: { username: "{{USERNAME}}", password: "{{PASSWORD}}" },
  extractToken: (body) => body.token,
});

export const protectedTest = test("protected")
  .use(login)
  .step("access", async (ctx, { authedHttp }) => {
    const res = await authedHttp.get("https://api.example.com/me").json<{ id: string }>();
    ctx.expect(res.id).toBeDefined();
  });
```

## Combining auth strategies

When mixing `apiKey()` with custom headers, extract the base config and spread its `headers`:

```typescript
import { configure } from "@glubean/sdk";
import { apiKey } from "@glubean/auth";

const base = apiKey({ prefixUrl: "{{BASE_URL}}", param: "apiKey", value: "{{API_KEY}}", location: "query" });

export const { http } = configure({
  http: {
    ...base,
    headers: {
      ...base.headers,   // ← preserve plugin's internal headers
      Authorization: "Bearer {{TOKEN}}",
    },
  },
});
```

> **Why?** `apiKey({ location: "query" })` and `basicAuth()` use marker headers + beforeRequest hooks internally. Overwriting `headers` without spreading `base.headers` drops the marker and the hook silently does nothing.
