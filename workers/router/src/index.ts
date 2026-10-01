/**
 * Bannerlord-clone one-domain router.
 *
 * One page, one domain, no subdomains. This Worker serves:
 *   - `/` and all non-API paths  -> the Vite-built client (static assets)
 *   - `/api/*`                   -> the Go API server (Cloudflare Container)
 *   - WebSocket upgrades         -> the Go API server (same Container)
 *
 * The simulation runs in the Container (one process, one campaign, in-memory
 * world, no database). The Worker is stateless routing only.
 */

interface Env {
  // Static assets binding (the Vite build output)
  ASSETS: Fetcher;
  // Container running the Go API server
  APISERVER: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrades go to the API server (tick/event stream,
    // battle invitations). The Container handles the upgrade.
    const upgrade = request.headers.get("Upgrade");
    if (upgrade && upgrade.toLowerCase() === "websocket") {
      return proxyToApi(request, env, url);
    }

    // API routes go to the Container.
    if (url.pathname.startsWith("/api/")) {
      return proxyToApi(request, env, url);
    }

    // Everything else is the client. Serve static assets; fall back to
    // index.html for SPA routing (the client handles /town/:id etc).
    try {
      let response = await env.ASSETS.fetch(request);
      if (response.status === 404) {
        const indexUrl = new URL("/index.html", url.origin);
        response = await env.ASSETS.fetch(
          new Request(indexUrl.toString(), request)
        );
      }
      return response;
    } catch (e) {
      return new Response("Static assets unavailable", { status: 503 });
    }
  },
};

/**
 * Proxy a request to the Go API server Container.
 *
 * Uses a Durable Object as the Container's stable address: one DO instance
 * per deployment, which starts (or reuses) the Container and forwards.
 */
async function proxyToApi(
  request: Request,
  env: Env,
  url: URL
): Promise<Response> {
  // Strip the /api prefix before forwarding: the Go server expects
  // /v1/snapshot, not /api/v1/snapshot.
  const apiPath = url.pathname.replace(/^\/api/, "") || "/";
  const target = new URL(apiPath + url.search, "http://apiserver.internal");

  // Each deployment gets one Container via a fixed DO id.
  const doId = env.APISERVER.idFromName("campaign-apiserver");
  const stub = env.APISERVER.get(doId);

  const proxyRequest = new Request(target.toString(), {
    method: request.method,
    headers: request.headers,
    body: request.body,
    // @ts-ignore - duplex is required for streaming bodies in Workers
    duplex: "half",
  });

  return stub.fetch(proxyRequest);
}
