/**
 * Performance overlay (MASTER_PLAN task 30).
 *
 * A small always-on-top readout of FPS, average frame time, and draw calls.
 * FPS and frame time are measured directly from rAF deltas, so they are real
 * on every platform. Draw calls come from Babylon's SceneInstrumentation when
 * the caller provides it; without a provider the row reads "n/a" instead of
 * inventing a number.
 *
 * Visibility: `?perf=1` in the URL shows it at boot; the × button hides it;
 * `setPerfOverlayVisible` toggles it programmatically.
 */
export interface PerfStatsProvider {
  /** Draw calls in the last rendered frame, or null when unknown. */
  drawCalls(): number | null;
}

export interface PerfOverlayOptions {
  /** Draw-call source; omitted until the scene exists. */
  stats?: PerfStatsProvider;
  /** Clock; defaults to performance.now. Injected for tests. */
  now?: () => number;
  /** rAF; injected for tests because jsdom has none. */
  raf?: (callback: FrameRequestCallback) => number;
  /** How often the DOM text refreshes; defaults to 500ms. */
  updateIntervalMs?: number;
}

const UPDATE_INTERVAL_MS = 500;

let root: HTMLElement | null = null;
let readout: HTMLElement | null = null;
let statsProvider: PerfStatsProvider | null = null;
let rafId = 0;
let rafFn: (callback: FrameRequestCallback) => number = (cb) => requestAnimationFrame(cb);
let nowFn: () => number = () => performance.now();
let updateInterval = UPDATE_INTERVAL_MS;
let lastFrame = 0;
let lastUpdate = 0;
let deltas: number[] = [];

function render(): void {
  if (deltas.length === 0) return;
  const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const fps = avg > 0 ? 1000 / avg : 0;
  const draws = statsProvider?.drawCalls();
  if (readout) {
    readout.textContent =
      `${fps.toFixed(0)} fps · ${avg.toFixed(1)} ms` +
      (draws == null ? " · draws n/a" : ` · ${draws} draws`);
  }
}

function frame(): void {
  const now = nowFn();
  if (lastFrame > 0) {
    deltas.push(now - lastFrame);
    if (deltas.length > 120) deltas.shift();
  }
  lastFrame = now;
  if (now - lastUpdate >= updateInterval) {
    lastUpdate = now;
    render();
  }
  rafId = rafFn(frame);
}

/** Attaches a draw-call source after the scene exists. */
export function setPerfStatsProvider(provider: PerfStatsProvider | null): void {
  statsProvider = provider;
}

/** Shows or hides the overlay. */
export function setPerfOverlayVisible(visible: boolean): void {
  if (visible && !root) {
    root = document.createElement("div");
    root.className = "perf-overlay";
    root.setAttribute("role", "status");
    root.setAttribute("aria-label", "Performance overlay");
    readout = document.createElement("span");
    readout.className = "perf-overlay__readout";
    readout.textContent = "— fps";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "perf-overlay__close";
    close.textContent = "✕";
    close.setAttribute("aria-label", "Hide performance overlay");
    close.addEventListener("click", () => setPerfOverlayVisible(false));
    root.appendChild(readout);
    root.appendChild(close);
    document.body.appendChild(root);

    lastFrame = 0;
    lastUpdate = 0;
    deltas = [];
    rafId = rafFn(frame);
  } else if (!visible && root) {
    cancelAnimationFrame(rafId);
    root.remove();
    root = null;
    readout = null;
    deltas = [];
  }
}

/** Whether the overlay is currently shown. */
export function isPerfOverlayVisible(): boolean {
  return root !== null;
}

/**
 * Creates the overlay if `?perf=1` is present. Call once at boot.
 * Test hooks are exposed through the options.
 */
export function installPerfOverlay(options: PerfOverlayOptions = {}): void {
  statsProvider = options.stats ?? null;
  if (options.now) nowFn = options.now;
  if (options.raf) rafFn = options.raf;
  if (options.updateIntervalMs) updateInterval = options.updateIntervalMs;
  const params = new URLSearchParams(window.location.search);
  if (params.has("perf")) setPerfOverlayVisible(true);
}

/** Test-only: resets module state. */
export function resetPerfOverlayForTests(): void {
  setPerfOverlayVisible(false);
  statsProvider = null;
  rafFn = (cb) => requestAnimationFrame(cb);
  nowFn = () => performance.now();
  updateInterval = UPDATE_INTERVAL_MS;
}
