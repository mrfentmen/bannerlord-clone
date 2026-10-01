/**
 * Campaign API Durable Object — owns the Go API server Container.
 *
 * One DO instance per deployment (idFromName "campaign-apiserver").
 * The DO starts the Container on first request and proxies all
 * subsequent requests to it. The Container runs the Go simulation
 * (one process, one campaign, in-memory world).
 *
 * The Container is defined in wrangler.toml under [containers].
 */

import { Container } from "@cloudflare/containers";

export class CampaignApi extends Container<Env> {
  // Container image built from services/simulation/Dockerfile
  defaultPort = 8080;

  // Time before the Container sleeps when idle (ms). The simulation
  // keeps ticking while players are connected; sleep when idle to
  // save resources. 5 minutes of no requests -> sleep.
  sleepAfter = "5m";

  // Health check: the Go server's /v1/health endpoint (if present),
  // else fall back to TCP connect on 8080.
  async fetch(request: Request): Promise<Response> {
    // Ensure the Container is running, then proxy.
    const container = await this.getContainer();
    return container.fetch(request);
  }
}

interface Env {
  // Bound in wrangler.toml
}
