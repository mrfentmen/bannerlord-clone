/**
 * The campaign HUD. `UI_UX.md` section 4.
 *
 * Top bar: date, time controls, and the five resources. Left: the party summary.
 * Right: the context panel for whatever is selected. Bottom: notifications.
 *
 * Every element of it is a real control with a real name, and every panel that reads
 * data shows a skeleton shaped like its content before the request goes out
 * (CONSTITUTION.md section 3.2).
 */

import { announce, clear, h, liveRegion } from "./dom.js";
import { errorState, skeleton, statusChip, type StatusKind } from "./kit.js";
import type { ConnectionStatus, ResourceId, ResourceWarning, SimSnapshot } from "../data/types.js";

export interface HudOptions {
  onSelectPanel: (panel: HudPanel) => void;
  onTimeScale: (scale: number) => void;
  onOpenDataSource: () => void;
  onOpenUiScale: (scale: number) => void;
  onNotification: (entityId: string, field: string) => void;
}

export type HudPanel = "town" | "market" | "party" | "march" | "ledger" | "roster" | "why" | "none";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** `ECONOMY.md` section 1: four core resources plus medicine. */
const RESOURCES: { id: ResourceId; label: string }[] = [
  { id: "money", label: "Money" },
  { id: "gold", label: "Gold" },
  { id: "food", label: "Grain" },
  { id: "metal", label: "Metal" },
  { id: "medicine", label: "Medicine" },
];

export interface HudHandle {
  root: HTMLElement;
  renderState(state: HudState): void;
  setConnection(status: ConnectionStatus): void;
  announcer: HTMLElement;
}

export interface HudState {
  snapshot: SimSnapshot;
  warnings: ResourceWarning[];
  /** Panel to show in the right column. `null` while the map has nothing selected. */
  context: { panel: HudPanel; node: Node } | null;
  loading: boolean;
  loadingShape: string;
  timeScale: number;
  partyDaysOfFood: number;
  selectionName: string;
}

export function createHud(options: HudOptions): HudHandle {
  const top = h("div", { class: "hud__top" });
  const left = h("div", { class: "hud__left" });
  const right = h("div", { class: "hud__right", "data-testid": "context-panel" });
  const bottom = h("div", { class: "hud__bottom" });
  const announcer = liveRegion("");

  // A dedicated region for the visible map. It holds nothing; the canvas is behind the
  // HUD. It exists so the narrow layout can reserve map space with flex rather than
  // guessing a max-height for a sheet that would then overlap the controls.
  const mapRegion = h("div", { class: "hud__map", "aria-hidden": "true" });

  const root = h("div", { class: "hud" }, top, left, mapRegion, right, bottom, announcer);

  let lastConnection: ConnectionStatus = { state: "connecting", detail: "", attempt: 0 };
  let lastState: HudState | null = null;

  function renderTop(state: HudState): HTMLElement {
    const bar = h("div", { class: "sheet topbar", "data-testid": "top-bar" });
    const { snapshot } = state;

    bar.appendChild(
      h(
        "div",
        { class: "topbar__clock" },
        h("span", { class: "caption", "data-testid": "hud-date" }, dateLabel(snapshot.day, snapshot.year)),
        h("span", { class: "caption" }, `Era tier ${snapshot.eraTier}`),
      ),
    );

    const res = h("div", { class: "topbar__resources" });
    for (const r of RESOURCES) {
      const value = snapshot.player.resources[r.id];
      const warning = state.warnings.find((w) => w.resource === r.id);
      const trend = r.id === "food" || r.id === "money" ? trendOf(state) : "flat";
      res.appendChild(
        h(
          "div",
          {
            class: "res",
            "data-testid": `res-${r.id}`,
            "data-status": warning ? warning.severity : "normal",
            title: warning ? `${warning.headline}. ${warning.detail}` : `${r.label} in hand`,
          },
          h("span", { class: "res__key" }, r.label),
          h(
            "span",
            { class: "res__value" },
            h("span", { class: "res__trend", "aria-hidden": "true", "data-trend": trend }, trendGlyph(trend)),
            h("span", { class: "data" }, formatResource(r.id, value)),
          ),
          warning
            ? h("span", { class: "res__note", "data-testid": `res-note-${r.id}` }, `${warning.daysRemaining?.toFixed(1) ?? "0"} days`)
            : h("span", { class: "res__note" }, r.id === "food" ? `${state.partyDaysOfFood.toFixed(1)} days` : ""),
        ),
      );
    }
    bar.appendChild(res);
    bar.appendChild(dial(state.timeScale));
    return bar;
  }

  function dial(current: number): HTMLElement {
    const wrap = h("div", { class: "dial", role: "group", "aria-label": "Time controls" });
    const defs: [string, number, string][] = [
      ["‖", 0, "Pause"],
      ["▶", 1, "Normal speed"],
      ["▶▶", 3, "Fast speed"],
    ];
    for (const [label, scale, name] of defs) {
      const btn = h(
        "button",
        {
          type: "button",
          class: "dial__btn",
          "data-testid": `time-${scale}`,
          "aria-pressed": current === scale ? "true" : "false",
          "aria-label": name,
          title: name,
        },
        label,
      );
      btn.addEventListener("click", () => options.onTimeScale(scale));
      wrap.appendChild(btn);
    }
    // Detent ticks, so it reads as a dial rather than three buttons.
    wrap.appendChild(h("span", { class: "dial__ticks", "aria-hidden": "true" }, h("span", { class: "dial__tick" }), h("span", { class: "dial__tick" }), h("span", { class: "dial__tick" })));
    return wrap;
  }

  function renderLeft(state: HudState): HTMLElement {
    const { snapshot } = state;
    const headcount = snapshot.party.troops.reduce((a: number, t: { count: number }) => a + t.count, 0);
    const rail = h("div", { class: "rail" });

    const card = h("div", { class: "sheet rail__card", "data-testid": "party-rail" });
    card.appendChild(h("h3", { class: "rail__name label" }, snapshot.player.characterName));
    card.appendChild(h("p", { class: "caption", style: "margin:0 0 var(--space-2)" }, snapshot.party.name));
    card.appendChild(
      h(
        "div",
        {},
        h("div", { class: "row" }, h("span", { class: "row__label label" }, "Troops"), h("span", { class: "row__value data" }, String(headcount))),
        h("div", { class: "row" }, h("span", { class: "row__label label" }, "Grain"), h("span", { class: "row__value data", "data-testid": "rail-food" }, `${state.partyDaysOfFood.toFixed(1)} d`)),
        h("div", { class: "row" }, h("span", { class: "row__label label" }, "Morale"), h("span", { class: "row__value data" }, snapshot.party.morale.toFixed(2))),
        h("div", { class: "row" }, h("span", { class: "row__label label" }, "Ammo"), h("span", { class: "row__value data" }, String(Math.round(snapshot.party.metal)))),
      ),
    );
    rail.appendChild(card);

    const buttons = h("div", { class: "stack" });
    for (const [id, label, testId] of [
      ["party", "Party", "open-party"],
      ["march", "March", "open-march"],
      ["ledger", "Ledger", "open-ledger"],
      ["roster", "Rulers", "open-roster"],
    ] as [HudPanel, string, string][]) {
      const btn = h("button", { type: "button", class: "btn", "data-testid": testId }, label);
      btn.addEventListener("click", () => options.onSelectPanel(id));
      buttons.appendChild(btn);
    }
    rail.appendChild(buttons);

    const warnings = h("div", { class: "sheet rail__card", "data-testid": "rail-warnings" });
    warnings.appendChild(h("h4", { class: "section-header" }, "Warnings"));
    if (state.warnings.length === 0) {
      warnings.appendChild(h("p", { class: "caption", style: "margin:0" }, "Nothing short. Food, coin and metal are all holding."));
    } else {
      const list = h("ul", { class: "warnings", style: "margin-top:var(--space-2)" });
      for (const w of state.warnings.slice(0, 4)) {
        const btn = h(
          "button",
          { type: "button", class: "warning", "data-testid": `rail-warning-${w.id}`, "data-severity": w.severity, style: "width:100%;text-align:left" },
          h("span", { class: "label" }, w.headline),
        );
        btn.addEventListener("click", () => options.onNotification(w.entityId, w.field));
        list.appendChild(h("li", {}, btn));
      }
      warnings.appendChild(list);
    }
    rail.appendChild(warnings);

    const dataBtn = h("button", { type: "button", class: "btn btn--quiet", "data-testid": "open-data-source" }, "Where does this data come from?");
    dataBtn.addEventListener("click", () => options.onOpenDataSource());
    rail.appendChild(dataBtn);

    return rail;
  }

  function renderRight(state: HudState): Node {
    if (state.loading) {
      return skeleton({ shape: state.loadingShape, testId: "context-skeleton", label: "Loading." });
    }
    if (!state.context) {
      return h(
        "div",
        { class: "sheet panel", "data-testid": "no-selection" },
        h("div", { class: "panel__body" },
          h("h2", { class: "panel__title" }, "Nothing selected"),
          h("p", { class: "caption" }, "No town selected. Choose a settlement on the map, or press Tab to cycle holdings."),
        ),
      );
    }
    return state.context.node;
  }

  function renderBottom(state: HudState): HTMLElement {
    const { snapshot } = state;
    const recent = [...snapshot.notifications].sort((a, b) => b.day - a.day).slice(0, 5);
    const tray = h("div", { class: "notices", "data-testid": "notifications" });
    if (recent.length === 0) {
      tray.appendChild(h("p", { class: "sheet", style: "padding:var(--space-2) var(--space-3);margin:0", role: "status" }, "Nothing needs your attention."));
      return tray;
    }
    for (const n of recent) {
      const item = h(
        "button",
        { type: "button", class: "sheet notice", "data-testid": `notice-${n.id}`, "data-priority": n.priority },
        h("span", { class: "notice__day data-sm" }, dayLabel(n.day)),
        h("span", { class: "notice__text" }, n.text),
      );
      item.addEventListener("click", () => {
        if (n.entityId && n.field) options.onNotification(n.entityId, n.field);
      });
      tray.appendChild(item);
    }
    return tray;
  }

  /**
   * Which node is currently in each region, so an unchanged region is left alone.
   *
   * The HUD repaints on every tick, and the clock ticks several times a second. If
   * every repaint cleared and re-appended, the focused element would be removed from
   * the document on every frame and keyboard focus would be lost before a keypress
   * could ever complete. The context panel is the expensive one to rebuild, so it is
   * kept by identity, and the rest preserve focus by test id.
   */
  let inTop: Node | null = null;
  let inLeft: Node | null = null;
  let inRight: Node | null = null;
  let inBottom: Node | null = null;

  const replace = (region: HTMLElement, current: Node | null, next: Node): Node => {
    if (current === next && next.parentElement === region) return current;
    // Keep the keyboard where it was, by test id, across a repaint.
    const focused = document.activeElement;
    const focusedId =
      region.contains(focused) && focused instanceof HTMLElement ? focused.dataset.testid : undefined;
    clear(region);
    region.appendChild(next);
    if (focusedId) {
      const again = region.querySelector<HTMLElement>(`[data-testid="${focusedId}"]`);
      again?.focus();
    }
    return next;
  };

  function render(state: HudState): void {
    lastState = state;
    inTop = replace(top, inTop, renderTop(state));
    inLeft = replace(left, inLeft, renderLeft(state));
    inRight = replace(right, inRight, renderRight(state));
    inBottom = replace(bottom, inBottom, renderBottom(state));

    if (lastConnection.state === "reconnecting" || lastConnection.state === "degraded") {
      top.appendChild(
        h(
          "div",
          { class: "sheet", "data-testid": "connection-warning", role: "status", style: "padding:var(--space-1) var(--space-3);background:var(--status-warning);color:var(--paper-0);border-color:var(--status-warning)" },
          lastConnection.state === "degraded"
            ? "The simulation sent something unreadable. Showing the last good values."
            : `Reconnecting to the simulation. Attempt ${lastConnection.attempt}.`,
        ),
      );
    }
  }

  return {
    root,
    announcer,
    renderState(state) {
      render(state);
    },
    setConnection(status) {
      lastConnection = status;
      if (lastState) render(lastState);
      if (status.state === "connected") announce(announcer, "Connected to the world simulation.");
      if (status.state === "reconnecting") announce(announcer, "Lost the simulation. Reconnecting.");
    },
  };
}

/** The data-source panel, so the player can see what they are looking at. */
export function dataSourcePanel(options: {
  summary: string;
  regionName: string;
  retrieved: string;
  providerLabel: string;
  isFixture: boolean;
  connection: ConnectionStatus;
  onClose: () => void;
  onRetry: () => void;
}): HTMLElement {
  const wrap = h("div", { class: "sheet panel", "data-testid": "data-source-panel" });
  const body = h("div", { class: "panel__body" });

  body.appendChild(h("h2", { class: "panel__title", style: "margin:0 0 var(--space-2)" }, "Where this data comes from"));
  body.appendChild(h("p", { class: "caption" }, "Real geography is real. The state of the world is the simulation's."));

  body.appendChild(h("h3", { class: "section-header", style: "margin-top:var(--space-4)" }, "Map — real public data"));
  const mapList = h("div", {});
  mapList.append(
    dataRow("Region", options.regionName),
    dataRow("Retrieved", options.retrieved, "data"),
    dataRow("Detail", options.summary, "caption"),
    dataRow("Elevation", "NASA SRTM and USGS via AWS Open Data, terrarium tiles", "caption"),
    dataRow("Roads and towns", "OpenStreetMap, ODbL 1.0", "caption"),
    dataRow("Populations", "US Census Bureau, Vintage 2024 sub-county estimates", "caption"),
  );
  body.appendChild(mapList);

  body.appendChild(h("h3", { class: "section-header", style: "margin-top:var(--space-4)" }, "World state — the simulation"));
  const simList = h("div", {});
  simList.append(
    h(
      "div",
      { class: "row" },
      h("span", { class: "row__label label" }, "Source"),
      h("span", { class: "row__value data", "data-testid": "data-source-provider" }, options.providerLabel),
    ),
    h(
      "div",
      { class: "row" },
      h("span", { class: "row__label label" }, "Connection"),
      statusChip(connectionKind(options.connection.state), connectionText(options.connection.state), {
        testId: "data-source-connection",
      }),
    ),
  );
  body.appendChild(simList);

  if (options.isFixture) {
    body.appendChild(
      h(
        "p",
        { class: "danger", style: "margin-top:var(--space-3)", "data-testid": "data-source-fixture-note" },
        "This build is running against test fixtures, not the real simulation. Town fields, prices, " +
          "unrest and the cause log are made up for testing. The terrain, roads and towns are real.",
      ),
    );
  }

  body.appendChild(
    h(
      "p",
      { class: "caption", style: "margin-top:var(--space-3)" },
      "Settlement classifications come from real Census populations. Where no real figure exists the town says " +
        "\"not surveyed\" rather than guessing a number.",
    ),
  );

  wrap.appendChild(
    h(
      "header",
      { class: "panel__header" },
      h("h2", { class: "panel__title" }, "Data sources"),
      h("div", { class: "panel__actions" }),
    ),
  );
  wrap.appendChild(body);

  const retry = h("button", { type: "button", class: "btn btn--primary", "data-testid": "data-source-retry" }, "Try again");
  retry.addEventListener("click", options.onRetry);
  const close = h("button", { type: "button", class: "btn", "data-testid": "data-source-close" }, "Close");
  close.addEventListener("click", options.onClose);
  body.appendChild(h("div", { class: "field-row", style: "margin-top:var(--space-4)" }, retry, close));
  return wrap;
}

/** The full-screen failure, used when the world data cannot load at all. */
export function fatalError(message: string, detail: string, onRetry: () => void): HTMLElement {
  const root = h("div", { class: "app", "data-testid": "fatal-error" });
  const stage = h("div", { class: "app__stage", style: "display:grid;place-items:center;padding:var(--space-5)" });
  const box = h("div", { class: "sheet", style: "max-width:var(--space-8);padding:var(--space-5)" });
  box.appendChild(h("h1", { class: "title", style: "margin:0 0 var(--space-2)" }, "The map did not load"));
  box.appendChild(errorState({ message, detail, onRetry, testId: "fatal-retry" }));
  stage.appendChild(box);
  root.appendChild(stage);
  return root;
}

function dataRow(label: string, value: string, valueClass = ""): HTMLElement {
  return h(
    "div",
    { class: "row" },
    h("span", { class: "row__label label" }, label),
    h("span", { class: `row__value ${valueClass}`.trim() }, value),
  );
}

function dateLabel(day: number, year: number): string {
  return `${day} ${MONTHS[(Math.max(1, day) - 1) % 12]} ${year}`;
}
function dayLabel(day: number): string {
  return `d${day}`;
}
function formatResource(id: ResourceId, v: number): string {
  if (id === "food") return `${v.toFixed(1)}d`;
  if (id === "medicine") return String(Math.round(v));
  return `$${Math.round(v).toLocaleString("en-US")}`;
}
function trendGlyph(t: "up" | "down" | "flat"): string {
  return t === "up" ? "▲" : t === "down" ? "▼" : "—";
}
function trendOf(state: HudState): "up" | "down" | "flat" {
  const net = state.snapshot.ledger.netPerDay;
  if (net.money === undefined || net.food === undefined) return "flat";
  if (net.money < 0 && net.food < 0) return "down";
  if (net.money > 0) return "up";
  return "flat";
}
function connectionKind(s: ConnectionStatus["state"]): StatusKind {
  if (s === "connected") return "good";
  if (s === "degraded") return "warning";
  if (s === "reconnecting" || s === "connecting") return "warning";
  return "critical";
}
function connectionText(s: ConnectionStatus["state"]): string {
  if (s === "connected") return "Connected";
  if (s === "connecting") return "Connecting";
  if (s === "reconnecting") return "Reconnecting";
  if (s === "degraded") return "Connected, some updates unreadable";
  return "Offline";
}
