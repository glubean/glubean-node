# Plugins

Glubean plugins extend `configure()` with additional capabilities. Each plugin is a separate npm package that must be installed.

## Available plugins

| Package | Purpose | Install |
|---------|---------|---------|
| `@glubean/auth` | Pre-built auth strategies (bearer, basic, apiKey, OAuth2, withLogin) | `npm install @glubean/auth` |
| `@glubean/browser` | Browser testing (Puppeteer-based, auto-tracing, screenshots) | `npm install @glubean/browser` |
| `@glubean/graphql` | GraphQL query/mutation helpers | `npm install @glubean/graphql` |
| `@glubean/grpc` | gRPC client with proto loading | `npm install @glubean/grpc` |

---

## @glubean/auth

Shortcuts for common auth patterns. Returns `ConfigureHttpOptions` — pass directly to `configure({ http: ... })`.

### Bearer token

```typescript
import { configure } from "@glubean/sdk";
import { bearer } from "@glubean/auth";

// .env.secrets: API_TOKEN=sk_xxx
export const { http: api } = configure({
  secrets: { token: "API_TOKEN" },
  http: bearer("BASE_URL", "API_TOKEN"),
});
// Every request gets: Authorization: Bearer sk_xxx
```

### API key (header)

```typescript
import { apiKey } from "@glubean/auth";

export const { http: api } = configure({
  secrets: { key: "API_KEY" },
  http: apiKey("BASE_URL", "X-Api-Key", "API_KEY"),
});
// Every request gets header: X-Api-Key: <value>
```

### API key (query param)

```typescript
import { apiKey } from "@glubean/auth";

export const { http: api } = configure({
  secrets: { key: "API_KEY" },
  http: apiKey("BASE_URL", "apiKey", "API_KEY", "query"),
});
// Every request gets: ?apiKey=<value>
```

### Basic auth

```typescript
import { basicAuth } from "@glubean/auth";

export const { http: api } = configure({
  secrets: { user: "USERNAME", pass: "PASSWORD" },
  http: basicAuth("BASE_URL", "USERNAME", "PASSWORD"),
});
// Every request gets: Authorization: Basic base64(user:pass)
```

### OAuth2 — client credentials

```typescript
import { oauth2 } from "@glubean/auth";

export const { http: api } = configure({
  secrets: { id: "CLIENT_ID", secret: "CLIENT_SECRET" },
  http: oauth2.clientCredentials({
    prefixUrl: "BASE_URL",
    tokenUrl: "OAUTH_TOKEN_URL",      // Secret key for token endpoint
    clientId: "CLIENT_ID",
    clientSecret: "CLIENT_SECRET",
    scope: "read write",              // Optional
  }),
});
// Auto-fetches token, caches it, refreshes before expiry
```

### OAuth2 — refresh token

```typescript
import { oauth2 } from "@glubean/auth";

export const { http: api } = configure({
  secrets: { refresh: "REFRESH_TOKEN", id: "CLIENT_ID" },
  http: oauth2.refreshToken({
    prefixUrl: "BASE_URL",
    tokenUrl: "OAUTH_TOKEN_URL",
    refreshToken: "REFRESH_TOKEN",
    clientId: "CLIENT_ID",
    clientSecret: "CLIENT_SECRET",    // Optional
  }),
});
// Auto-refreshes on 401
```

### withLogin — builder transform

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

---

## @glubean/browser

Browser testing with Puppeteer. See [browser.md](browser.md) for full API.

```bash
npm install @glubean/browser
```

```typescript
import { configure, test } from "@glubean/sdk";
import { browser } from "@glubean/browser";
import type { InstrumentedPage } from "@glubean/browser";

export const { chrome } = configure({
  plugins: {
    chrome: browser({ launch: true, launchOptions: { headless: true } }),
  },
});
```

---

## @glubean/graphql

```bash
npm install @glubean/graphql
```

---

## @glubean/grpc

```bash
npm install @glubean/grpc
```
