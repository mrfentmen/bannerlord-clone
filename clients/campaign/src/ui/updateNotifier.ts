/**
 * Build-hash update notifier (MASTER_PLAN task 29).
 *
 * The build script bakes BUILD_HASH into the bundle and serves the same hash
 * at /build.json. This module polls that endpoint; when the served hash stops
 * matching the running build, a deployment happened and the player is offered
 * a reload. Until they accept, nothing changes — the running build keeps
 * working, because the notifier never reloads on its own.
 *
 * Polling is skipped in dev (import.meta.env.DEV), where rebuilds are constant
 * and /build.json does not exist.
 */
import { BUILD_HASH } from "../buildHash.js";

export interface UpdateNotifierOptions {
  /** Poll interval in ms; defaults to 5 minutes. Injected for tests. */
  pollIntervalMs?: number;
  /** Fetch hook; defaults to window.fetch. Injected for tests. */
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
  /** Reload hook; defaults to location.reload. Injected for tests. */
  reload?: () => void;
  /** Current build hash; defaults to the baked-in BUILD_HASH. Injected for tests. */
  currentHash?: string;
  /**
   * Skip polling in dev; defaults to import.meta.env.DEV. Set false in tests
   * to exercise the poller.
   */
  skipInDev?: boolean;
}

const POLL_INTERVAL_MS = 5 * 60 * 1000;
const BUILD_JSON_URL = "/build.json";

let banner: HTMLElement | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

/** Pure comparison, exported for tests. */
export function isNewerBuild(currentHash: string, servedHash: unknown): boolean {
  return typeof servedHash === "string" && servedHash.length > 0 && servedHash !== currentHash;
}

function showBanner(reload: () => void): void {
  if (banner) return;
  banner = document.createElement("div");
  banner.className = "update-banner";
  banner.setAttribute("role", "status");

  const text = document.createElement("span");
  text.textContent = "A new version of the campaign is available.";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "update-banner__button";
  button.textContent = "Reload to update";
  button.addEventListener("click", reload);
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "update-banner__button update-banner__button--quiet";
  dismiss.textContent = "Later";
  dismiss.setAttribute("aria-label", "Dismiss the update notice");
  dismiss.addEventListener("click", () => {
    banner?.remove();
    banner = null;
  });

  banner.appendChild(text);
  banner.appendChild(button);
  banner.appendChild(dismiss);
  document.body.appendChild(banner);
}

async function check(options: UpdateNotifierOptions): Promise<void> {
  const currentHash = options.currentHash ?? BUILD_HASH;
  const doFetch = options.fetch ?? ((url: string, init?: RequestInit) => fetch(url, init));
  const doReload = options.reload ?? (() => window.location.reload());
  let served: unknown;
  try {
    const res = await doFetch(BUILD_JSON_URL, { cache: "no-store" });
    if (!res.ok) return;
    const body = (await res.json()) as { hash?: unknown };
    served = body.hash;
  } catch {
    return; // Offline or unreachable: stay silent, try again next poll.
  }
  if (isNewerBuild(currentHash, served)) showBanner(doReload);
}

/**
 * Starts polling for newer builds. Idempotent. Safe to call in any
 * environment; in dev it returns immediately without polling.
 */
export function installUpdateNotifier(options: UpdateNotifierOptions = {}): void {
  if (timer) return;
  const skipInDev =
    options.skipInDev ??
    (typeof import.meta !== "undefined" &&
      (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true);
  if (skipInDev) return;
  timer = setInterval(() => void check(options), options.pollIntervalMs ?? POLL_INTERVAL_MS);
}

/** Runs one check immediately. Exported for tests and for manual "check now". */
export function checkForUpdatesNow(options: UpdateNotifierOptions = {}): Promise<void> {
  return check(options);
}

/** Test-only: tears down the poller and banner. */
export function resetUpdateNotifierForTests(): void {
  if (timer) clearInterval(timer);
  timer = null;
  banner?.remove();
  banner = null;
}
