/**
 * Offline indicator (MASTER_PLAN task 27).
 *
 * Shows a persistent banner within five seconds of losing connectivity and a
 * brief "back online" notice on recovery. Detection is two-layered: the
 * browser's `online`/`offline` events fire immediately in the common case,
 * and a 2-second `navigator.onLine` poll covers the cases where they don't
 * (some captive portals, VPN drops), so the worst case stays under 5s.
 *
 * Copy is honest about what offline means here: the campaign runs on local
 * saves, so progress is safe — only the remote simulation provider (Pax's
 * lane) is unreachable until the connection returns.
 */
export interface OfflineIndicatorOptions {
  /** Poll interval in ms; defaults to 2000. Injected for tests. */
  pollIntervalMs?: number;
}

const POLL_INTERVAL_MS = 2000;

let banner: HTMLElement | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let wasOnline = true;
let backOnlineTimer: ReturnType<typeof setTimeout> | null = null;

function showBanner(): void {
  if (banner) return;
  banner = document.createElement("div");
  banner.className = "offline-banner";
  banner.setAttribute("role", "status");
  const dot = document.createElement("span");
  dot.className = "offline-banner__dot";
  dot.setAttribute("aria-hidden", "true");
  const text = document.createElement("span");
  text.textContent = "You're offline. Progress keeps saving locally; the remote world will reconnect when you are.";
  banner.appendChild(dot);
  banner.appendChild(text);
  document.body.appendChild(banner);
}

function hideBanner(): void {
  banner?.remove();
  banner = null;
}

function showBackOnline(): void {
  if (backOnlineTimer) clearTimeout(backOnlineTimer);
  const note = document.createElement("div");
  note.className = "offline-banner offline-banner--back";
  note.setAttribute("role", "status");
  note.textContent = "Back online.";
  document.body.appendChild(note);
  backOnlineTimer = setTimeout(() => {
    note.remove();
    backOnlineTimer = null;
  }, 4000);
}

function check(): void {
  const online = navigator.onLine;
  if (online === wasOnline) return;
  wasOnline = online;
  if (online) {
    hideBanner();
    showBackOnline();
  } else {
    showBanner();
  }
}

/**
 * Installs the offline indicator. Idempotent. Call once at boot.
 */
export function installOfflineIndicator(options: OfflineIndicatorOptions = {}): void {
  if (pollTimer) return;
  wasOnline = navigator.onLine;
  if (!wasOnline) showBanner();
  window.addEventListener("offline", check);
  window.addEventListener("online", check);
  pollTimer = setInterval(check, options.pollIntervalMs ?? POLL_INTERVAL_MS);
}

/** Test-only: tears down listeners and timers. */
export function resetOfflineIndicatorForTests(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  if (backOnlineTimer) clearTimeout(backOnlineTimer);
  backOnlineTimer = null;
  window.removeEventListener("offline", check);
  window.removeEventListener("online", check);
  hideBanner();
  document.querySelectorAll(".offline-banner--back").forEach((n) => n.remove());
  wasOnline = true;
}
