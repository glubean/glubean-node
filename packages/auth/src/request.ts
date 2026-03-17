/**
 * Rebuild a Request with modified URL/headers, safely handling body.
 *
 * Node.js 18+ requires `duplex: "half"` when body is present.
 * ky has a known issue where `request.body` stream can be consumed,
 * so we clone and read to ArrayBuffer first.
 */
export async function rebuildRequest(
  request: Request,
  headers: Headers,
  url?: string | URL,
): Promise<Request> {
  const bodyBuffer = request.body
    ? await request.clone().arrayBuffer()
    : null;

  return new Request(url ?? request.url, {
    method: request.method,
    headers,
    body: bodyBuffer,
    redirect: request.redirect,
    signal: request.signal,
    ...(bodyBuffer ? { duplex: "half" as const } : {}),
  } as RequestInit);
}
