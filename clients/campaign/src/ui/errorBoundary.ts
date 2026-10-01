/**
 * Global error boundary (MASTER_PLAN task 25).
 *
 * Catches otherwise-fatal failures — synchronous throws during boot, `error`
 * events, and unhandled promise rejections — and turns them into a recovery
 * overlay instead of a blank canvas. The overlay offers:
 *   - Reload (the fix that works for transient failures)
 *   - Report a bug (wired to the bug reporter from task 26 via `onReport`)
 *   - A collapsed details section with the error text for power users
 *
 * Nothing here invents styling: the overlay is paper/ink/status tokens only.
 */
export interface ErrorReport {
  /** Human-readable summary, e.g. "Uncaught TypeError: x is not a function". */
  message: string;
  /** Stack trace when the error carried one. */
  stack?: string;
  /** Where it came from: script URL, or "promise" for rejections. */
  source?: string;
  /** Epoch millis, so a report can be correlated with logs. */
  timestamp: number;
}

export interface ErrorBoundaryOptions {
  /** Called with the report when the user clicks "Report a bug". */
  onReport?: (report: ErrorReport) => void;
  /** Reload hook; defaults to `window.location.reload()`. Injected for tests. */
  reload?: () => void;
  /**
   * Extra context the reporter can attach (console tail, settings snapshot).
   * Kept as a callback so the boundary never imports the reporter and the
   * reporter never imports the boundary.
   */
  context?: () => Record<string, unknown>;
}

let installed = false;
let currentOverlay: HTMLElement | null = null;
let currentReport: ErrorReport | null = null;

/** The report backing the currently shown overlay, if any. */
export function activeReport(): ErrorReport | null {
  return currentReport;
}

function describeError(input: unknown, source?: string): ErrorReport {
  const report: ErrorReport = {
    message: "Something went wrong.",
    timestamp: Date.now(),
  };
  if (source) report.source = source;
  if (input instanceof Error) {
    report.message = `${input.name}: ${input.message}`;
    if (input.stack) report.stack = input.stack;
  } else if (typeof input === "string") {
    report.message = input;
  } else if (input != null) {
    report.message = String(input);
  }
  return report;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Renders the recovery overlay for `report`. Idempotent: if an overlay is
 * already showing, the newer report replaces the older one's details.
 */
export function showFatalError(report: ErrorReport, options: ErrorBoundaryOptions = {}): HTMLElement {
  currentReport = report;
  if (currentOverlay) {
    const details = currentOverlay.querySelector(".fatal-error__details pre");
    if (details) details.textContent = report.stack ?? report.message;
    return currentOverlay;
  }

  const overlay = el("div", "fatal-error");
  overlay.setAttribute("role", "alertdialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "fatal-error-title");

  const card = el("div", "fatal-error__card");
  const title = el("h2", "fatal-error__title", "Something went wrong");
  title.id = "fatal-error-title";
  const body = el(
    "p",
    "fatal-error__body",
    "The campaign hit an unexpected error. Your saves are stored locally and " +
      "should be intact — reloading usually clears it.",
  );

  const actions = el("div", "fatal-error__actions");
  const reloadBtn = el("button", "fatal-error__button fatal-error__button--primary", "Reload the game");
  reloadBtn.type = "button";
  reloadBtn.addEventListener("click", () => {
    (options.reload ?? (() => window.location.reload()))();
  });
  actions.appendChild(reloadBtn);

  const reportBtn = el("button", "fatal-error__button", "Report a bug");
  reportBtn.type = "button";
  reportBtn.addEventListener("click", () => {
    options.onReport?.(report);
  });
  actions.appendChild(reportBtn);

  const dismissBtn = el("button", "fatal-error__button", "Dismiss");
  dismissBtn.type = "button";
  dismissBtn.addEventListener("click", () => {
    dismissFatalError();
  });
  actions.appendChild(dismissBtn);

  const detailsWrap = el("details", "fatal-error__details");
  const summary = el("summary", "", "Error details");
  const pre = document.createElement("pre");
  pre.textContent = report.stack ?? report.message;
  detailsWrap.appendChild(summary);
  detailsWrap.appendChild(pre);

  card.appendChild(title);
  card.appendChild(body);
  card.appendChild(actions);
  card.appendChild(detailsWrap);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  currentOverlay = overlay;
  reloadBtn.focus();
  return overlay;
}

/** Removes the recovery overlay if one is showing. */
export function dismissFatalError(): void {
  currentOverlay?.remove();
  currentOverlay = null;
  currentReport = null;
}

/**
 * Installs the global handlers. Safe to call more than once; the second call
 * is a no-op unless `resetForTests` ran first.
 */
export function installErrorBoundary(options: ErrorBoundaryOptions = {}): void {
  if (installed) return;
  installed = true;

  window.addEventListener("error", (event) => {
    const source =
      typeof event.filename === "string" && event.filename.length > 0 ? event.filename : undefined;
    showFatalError(describeError(event.error ?? event.message, source), options);
  });

  window.addEventListener("unhandledrejection", (event) => {
    showFatalError(describeError(event.reason, "promise"), options);
  });
}

/** Test-only: resets module state so handlers can be re-installed. */
export function resetForTests(): void {
  installed = false;
  dismissFatalError();
}
