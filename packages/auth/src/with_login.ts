import type { HttpClient, TestBuilder, TestContext } from "@glubean/sdk";

export interface WithLoginOptions {
  endpoint: string;
  credentials: Record<string, string>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extractToken: (body: any) => string;
  headerName?: string;
  headerPrefix?: string;
}

function resolveTemplate(template: string, ctx: TestContext): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    return ctx.secrets.get(key) ?? ctx.vars.get(key) ?? `{{${key}}}`;
  });
}

/**
 * Builder transform that adds a login step.
 *
 * POSTs credentials → extracts token → creates `authedHttp` client.
 */
export function withLogin<S>(
  options: WithLoginOptions,
): (builder: TestBuilder<S>) => TestBuilder<S & { authedHttp: HttpClient }> {
  const {
    endpoint,
    credentials,
    extractToken,
    headerName = "Authorization",
    headerPrefix = "Bearer ",
  } = options;

  return (builder: TestBuilder<S>) => {
    return builder.step(
      "login",
      async (ctx: TestContext, state: S): Promise<S & { authedHttp: HttpClient }> => {
        const resolved: Record<string, string> = {};
        for (const [k, v] of Object.entries(credentials)) {
          resolved[k] = resolveTemplate(v, ctx);
        }

        const response = await ctx.http
          .post(resolveTemplate(endpoint, ctx), {
            json: resolved,
            throwHttpErrors: false,
          })
          .json();

        const token = extractToken(response);
        if (!token || typeof token !== "string") {
          throw new Error("withLogin: extractToken() did not return a valid string token");
        }

        const authedHttp = ctx.http.extend({
          headers: { [headerName]: `${headerPrefix}${token}` },
        });

        return { ...state, authedHttp };
      },
    );
  };
}
