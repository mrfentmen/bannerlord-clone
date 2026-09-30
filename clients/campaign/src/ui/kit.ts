/**
 * UI primitives. Every one of these reads from `src/design/tokens` and introduces no
 * colour, font or spacing value of its own (CONSTITUTION.md section 3.4).
 */

import { h, clear } from "./dom.js";
import { STAMP_ROTATION_DEG } from "../design/grade.js";

// -- Panel -------------------------------------------------------------------

export interface PanelOptions {
  title: string;
  /** Rendered at the right of the title bar, typically a close button. */
  actions?: Node;
  testId?: string;
  onClose?: () => void;
}

/** A sheet of paper with a title bar. The one container every panel uses. */
export function panel(options: PanelOptions): { root: HTMLElement; body: HTMLElement } {
  const body = h("div", { class: "panel__body" });
  const close = options.onClose
    ? h("button", { type: "button", class: "btn btn--quiet panel__close", "aria-label": `Close ${options.title}` }, "✕")
    : null;
  close?.addEventListener("click", options.onClose ?? (() => {}));

  const root = h(
    "section",
    { class: "sheet panel", "data-testid": options.testId, tabindex: "-1" },
    h(
      "header",
      { class: "panel__header" },
      h("h2", { class: "panel__title" }, options.title),
      h("div", { class: "panel__actions" }, options.actions ?? null, close),
    ),
    body,
  );
  return { root, body };
}

// -- Status ------------------------------------------------------------------

export type StatusKind = "critical" | "warning" | "good" | "info" | "neutral";

const STATUS_GLYPH: Record<StatusKind, string> = {
  critical: "◆",
  warning: "▲",
  good: "●",
  info: "■",
  neutral: "○",
};

/** Marks, for glyphs and gauge fills drawn on paper. */
const STATUS_MARK: Record<StatusKind, string> = {
  critical: "var(--status-critical-mark)",
  warning: "var(--status-warning-mark)",
  good: "var(--status-good-mark)",
  info: "var(--status-info-mark)",
  neutral: "var(--ink-500)",
};

export const STATUS_TEXT: Record<StatusKind, string> = {
  critical: "Critical",
  warning: "Warning",
  good: "Healthy",
  info: "For information",
  neutral: "No change",
};

/**
 * A status chip.
 *
 * The glyph is always present and the accessible name always carries the word, so the
 * status is legible with no colour vision at all (UI_UX.md section 12). Colour is the
 * third signal, never the only one.
 */
export function statusChip(kind: StatusKind, label: string, opts: { testId?: string; title?: string } = {}): HTMLElement {
  return h(
    "span",
    {
      class: `chip chip--${kind}`,
      "data-testid": opts.testId,
      "data-status": kind,
      title: opts.title ?? `${STATUS_TEXT[kind]}: ${label}`,
      role: "img",
      "aria-label": `${STATUS_TEXT[kind]}: ${label}`,
    },
    h("span", { class: "chip__glyph", "aria-hidden": "true", style: `color:${STATUS_MARK[kind]}` }, STATUS_GLYPH[kind]),
    h("span", { class: "chip__label" }, label),
  );
}

// -- Gauge -------------------------------------------------------------------

export interface GaugeOptions {
  label: string;
  /** 0 to 1. `null` means the value is genuinely unknown, not zero. */
  value: number | null;
  /** Rendered as a 0-1 proportion. Anything else renders the raw value. */
  format?: (v: number) => string;
  /** `up`, `down` or `flat`. Drives the arrow, not the colour. */
  trend?: "up" | "down" | "flat";
  /** "12 days to a council vote". Shown under the value. */
  note?: string;
  /** Thresholds decide the status kind, so a gauge and a chip never disagree. */
  thresholds?: { criticalBelow?: number; warningBelow?: number; goodAbove?: number };
  testId?: string;
}

const TREND_ARROW = { up: "▲", down: "▼", flat: "—" } as const;

function kindFor(value: number | null, t: GaugeOptions["thresholds"]): StatusKind {
  if (value === null) return "neutral";
  if (t?.criticalBelow !== undefined && value <= t.criticalBelow) return "critical";
  if (t?.warningBelow !== undefined && value <= t.warningBelow) return "warning";
  if (t?.goodAbove !== undefined && value >= t.goodAbove) return "good";
  return "info";
}

/**
 * A gauge shows its value, a trend arrow, and how long until it becomes a problem.
 * That third element is the one `UI_UX.md` section 6 insists on and the one a bar
 * chart cannot give you.
 */
export function gauge(options: GaugeOptions): HTMLElement {
  const kind = kindFor(options.value, options.thresholds);
  const format = options.format ?? ((v: number) => v.toFixed(2));
  const pct = options.value === null ? 0 : Math.max(0, Math.min(1, options.value)) * 100;

  return h(
    "div",
    { class: "gauge", "data-testid": options.testId, "data-status": kind },
    h(
      "div",
      { class: "gauge__head" },
      h("span", { class: "gauge__label label" }, options.label),
      h(
        "span",
        { class: "gauge__value" },
        h(
          "span",
          { class: "gauge__trend", "aria-hidden": "true", "data-trend": options.trend ?? "flat" },
          TREND_ARROW[options.trend ?? "flat"],
        ),
        h("span", { class: "gauge__number data" }, options.value === null ? "not surveyed" : format(options.value)),
      ),
    ),
    h(
      "div",
      {
        class: "gauge__track",
        role: "meter",
        "aria-label": options.label,
        "aria-valuemin": "0",
        "aria-valuemax": "1",
        "aria-valuenow": options.value === null ? undefined : String(Number(options.value.toFixed(2))),
        "aria-valuetext": options.value === null ? "not surveyed" : format(options.value),
      },
      h("span", { class: "gauge__fill", style: `width:${pct}%;background:${STATUS_MARK[kind]}` }),
    ),
    options.note ? h("p", { class: "gauge__note caption" }, options.note) : null,
  );
}

// -- Stamp -------------------------------------------------------------------

/** A rubber stamp. Fixed rotation, no animation (ART_DIRECTION.md section 6). */
export function stamp(text: string, kind: "critical" | "primary" = "critical"): HTMLElement {
  return h(
    "span",
    {
      class: `stamp stamp--${kind}`,
      style: `--stamp-rotation:${STAMP_ROTATION_DEG}deg`,
      "aria-hidden": "true",
    },
    text,
  );
}

// -- Table -------------------------------------------------------------------

export interface Column<T> {
  header: string;
  /** Right-align and use tabular figures, for any numeric column. */
  numeric?: boolean;
  render: (row: T) => Node | string;
  testId?: string;
}

/**
 * A data table with a real `<caption>` and scoped headers. Numbers are mono and
 * right-aligned so a column of prices does not jitter as it updates.
 */
export function dataTable<T>(caption: string, columns: Column<T>[], rows: T[], testId?: string): HTMLElement {
  return h(
    "table",
    { class: "table data", "data-testid": testId },
    h("caption", { class: "visually-hidden" }, caption),
    h(
      "thead",
      {},
      h(
        "tr",
        {},
        columns.map((c) =>
          h("th", { scope: "col", class: c.numeric ? "table__th table__th--numeric label" : "table__th label" }, c.header),
        ),
      ),
    ),
    h(
      "tbody",
      {},
      rows.map((row, i) =>
        h(
          "tr",
          { class: i % 2 === 1 ? "table__row table__row--alt" : "table__row" },
          columns.map((c) =>
            h(
              "td",
              { class: c.numeric ? "table__td table__td--numeric data" : "table__td", "data-testid": c.testId },
              c.render(row),
            ),
          ),
        ),
      ),
    ),
  );
}

// -- Empty state -------------------------------------------------------------

/** An empty state written in the product's voice, never a placeholder (3.3). */
export function emptyState(headline: string, detail: string, action?: Node): HTMLElement {
  return h(
    "div",
    { class: "empty", "data-testid": "empty-state" },
    h("p", { class: "empty__headline label" }, headline),
    h("p", { class: "empty__detail caption" }, detail),
    action ?? null,
  );
}

// -- Error state -------------------------------------------------------------

export interface ErrorStateOptions {
  /** Plain sentence, in the voice of the finished product. */
  message: string;
  /** What to offer the player. CONSTITUTION.md 1.3 requires a way to recover. */
  onRetry?: () => void;
  retryLabel?: string;
  /** A second way out, for example "open the ledger anyway". */
  secondary?: Node;
  /** For the developer console. Never rendered to the player. */
  detail?: string;
  testId?: string;
}

/**
 * The error state every panel uses: a plain message and a way to recover. The
 * developer detail goes to the console, not to the screen.
 */
export function errorState(options: ErrorStateOptions): HTMLElement {
  if (options.detail) {
    console.error(`[campaign-client] ${options.message} :: ${options.detail}`);
  }
  const retry = options.onRetry
    ? h(
        "button",
        { type: "button", class: "btn btn--primary", "data-testid": options.testId ? `${options.testId}-retry` : "retry" },
        options.retryLabel ?? "Try again",
      )
    : null;
  retry?.addEventListener("click", () => options.onRetry?.());

  return h(
    "div",
    { class: "error", role: "alert", "data-testid": options.testId ?? "error-state" },
    h("p", { class: "error__message" }, options.message),
    h("div", { class: "error__actions" }, retry, options.secondary ?? null),
  );
}

// -- Skeleton ----------------------------------------------------------------

export interface SkeletonOptions {
  /** The shape to draw. See the registry in `skeletons.ts`. */
  shape: string;
  testId?: string;
  label?: string;
}

/**
 * A skeleton block: a shape, not a spinner.
 *
 * `CONSTITUTION.md` section 3.2 bans spinners outright. The wash moves so the panel
 * does not look frozen, but the shape never changes and nothing rotates, so it is not
 * a spinner wearing a costume. A skeleton is always drawn *before* the request, so
 * there is never a frame with neither data nor placeholder.
 */
export function skeleton(options: SkeletonOptions): HTMLElement {
  const root = h("div", {
    class: `skeleton skeleton--${options.shape}`,
    "data-testid": options.testId ?? `skeleton-${options.shape}`,
    "aria-busy": "true",
    "aria-live": "polite",
    role: "status",
  });
  if (options.label) {
    root.appendChild(h("span", { class: "visually-hidden" }, options.label));
  }
  return root;
}

/**
 * Fill a panel body with a named skeleton.
 *
 * The shape is a named one rather than a default box, because `CONSTITUTION.md`
 * section 3.2 requires a skeleton that mirrors the content that is coming, and only
 * the panel knows what its own layout looks like.
 */
export function skeletonBody(body: HTMLElement, shape: string, label: string, testId?: string): void {
  clear(body);
  body.appendChild(skeleton({ shape, label, ...(testId === undefined ? {} : { testId }) }));
}
