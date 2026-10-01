/**
 * Trade routes panel + map overlay (MASTER_PLAN tasks 102/103).
 *
 * The floating card lists the player's caravans (route, cargo, weekly and
 * total profit/loss, retire) and the form that founds new ones. The animated
 * route layer is a pointer-transparent canvas pinned over the map canvas,
 * re-projected every frame while open — the same overlay pattern as the
 * battle heatmap panel.
 */

import { h } from "../ui/dom.js";
import { emptyState, panel } from "../ui/kit.js";
import type { GoodId } from "../data/types.js";
import {
  totalProfit,
  type FoundInput,
  type CaravanStop,
  type TradeCaravan,
  type WeekLedger,
} from "./routeRegistry.js";
import {
  buildRouteModels,
  drawRoutes,
  type RouteModel,
  type ScreenProjector,
} from "./routeVisualizer.js";
import "./routes.css";

export interface SettlementChoice {
  id: string;
  name: string;
}

export interface GoodChoice {
  id: GoodId;
  name: string;
}

export interface RoutePanelOptions {
  caravans: () => TradeCaravan[];
  onFound: (input: FoundInput) => void;
  onRetire: (id: string) => void;
  settlements: () => SettlementChoice[];
  goods: () => GoodChoice[];
  /** Live accessor: the overlay re-reads it every frame. */
  models: () => RouteModel[];
  /** World metres -> render pixels. Null = off-camera. */
  toScreen: ScreenProjector;
  /** Element the overlay canvas is pinned inside (the map stage). */
  overlayHost: HTMLElement;
  /** Render-buffer size for the overlay canvas, in pixels. */
  renderSize: () => { width: number; height: number };
  onClose: () => void;
}

export interface RoutePanelHandle {
  root: HTMLElement;
  refresh(): void;
  dispose(): void;
}

function money(n: number): string {
  const sign = n < 0 ? "−" : n > 0 ? "+" : "";
  return `${sign}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
}

function profitClass(n: number): string {
  return n > 0 ? "routes__profit--good" : n < 0 ? "routes__profit--bad" : "";
}

function lastWeek(caravan: TradeCaravan): WeekLedger | null {
  return caravan.weeks.length > 0 ? caravan.weeks[caravan.weeks.length - 1]! : null;
}

export function routePanel(options: RoutePanelOptions): RoutePanelHandle {
  const { root, body } = panel({
    title: "Trade routes",
    testId: "routes-panel",
    onClose: options.onClose,
  });

  const listSection = h("section", { class: "routes__list", "aria-label": "Your caravans" });
  const formSection = h("section", { class: "routes__found", "aria-label": "Found a caravan" });
  body.append(listSection, formSection);

  // -- Caravan list ----------------------------------------------------------
  function renderList(): void {
    listSection.replaceChildren();
    const caravans = options.caravans();
    if (caravans.length === 0) {
      listSection.appendChild(
        emptyState(
          "No caravans yet",
          "Found a caravan below and its route appears on the campaign map, animated with its cargo and volume.",
        ),
      );
      return;
    }
    for (const caravan of caravans) {
      listSection.appendChild(caravanCard(caravan));
    }
  }

  function caravanCard(caravan: TradeCaravan): HTMLElement {
    const week = lastWeek(caravan);
    const route = caravan.stops.map((s) => s.name).join(" → ") + ` → ${caravan.stops[0]!.name}`;
    const card = h("article", { class: "routes__card", "data-testid": `routes-card-${caravan.id}` });
    const header = h("div", { class: "routes__card-head" },
      h("h3", { class: "routes__name", text: caravan.name }),
      h("p", { class: "routes__route", text: route }),
    );
    const facts = h("dl", { class: "routes__facts" },
      h("div", {}, h("dt", { text: "Cargo" }), h("dd", { text: `${caravan.goodName} · ${caravan.units}u` })),
      h("div", {}, h("dt", { text: "Guards" }), h("dd", { text: String(caravan.guards) })),
      h("div", {},
        h("dt", { text: "Last week" }),
        h("dd", { class: `routes__profit ${week ? profitClass(week.profit) : ""}`, text: week ? money(week.profit) : "no books yet" }),
      ),
      h("div", {},
        h("dt", { text: "Total" }),
        h("dd", {
          class: `routes__profit ${profitClass(totalProfit(caravan))}`,
          text: money(totalProfit(caravan)),
          title: `${caravan.weeks.length} weeks settled`,
        }),
      ),
    );
    const retireBtn = h("button", {
      type: "button",
      class: "btn btn--quiet",
      "data-testid": `routes-retire-${caravan.id}`,
      text: "Retire",
    });
    const confirmRow = h("div", { class: "routes__confirm", hidden: true },
      h("p", { class: "label", text: `Retire ${caravan.name}? Its books are kept, but the route stops.` }),
      h("button", {
        type: "button",
        class: "btn btn--danger",
        "data-testid": `routes-retire-confirm-${caravan.id}`,
        text: "Retire caravan",
        onclick: () => {
          options.onRetire(caravan.id);
          renderList();
        },
      }),
    );
    retireBtn.addEventListener("click", () => {
      confirmRow.hidden = false;
      retireBtn.hidden = true;
    });
    const foot = h("div", { class: "routes__card-foot" }, retireBtn, confirmRow);
    if (week?.dataMissing) {
      foot.appendChild(
        h("p", {
          class: "routes__missing",
          text: "Last week's books are partial — a market price was missing.",
          title: (week.notes ?? []).join(" "),
        }),
      );
    }
    card.append(header, facts, foot);
    return card;
  }

  // -- Found form ------------------------------------------------------------
  const pendingStops: CaravanStop[] = [];
  const errorLine = h("p", { class: "routes__error", role: "alert", hidden: true });

  interface FormDraft {
    name: string;
    goodId: string;
    units: string;
    guards: string;
  }

  function readDraft(): FormDraft {
    const root = formSection;
    const val = (sel: string): string => {
      const el = root.querySelector(sel) as HTMLInputElement | HTMLSelectElement | null;
      return el ? el.value : "";
    };
    return {
      name: val('[data-testid="routes-name"]'),
      goodId: val('[data-testid="routes-good"]'),
      units: val('[data-testid="routes-units"]'),
      guards: val('[data-testid="routes-guards"]'),
    };
  }

  function renderForm(draft?: FormDraft): void {
    formSection.replaceChildren();
    const settlements = options.settlements();
    const goods = options.goods();

    const nameInput = h("input", {
      type: "text",
      class: "input",
      maxlength: "40",
      placeholder: "Caravan name",
      "aria-label": "Caravan name",
      "data-testid": "routes-name",
      value: draft?.name ?? "",
    }) as HTMLInputElement;
    const goodSelect = h("select", { class: "input", "aria-label": "Cargo good", "data-testid": "routes-good" }) as HTMLSelectElement;
    for (const g of goods) {
      goodSelect.appendChild(
        h("option", { value: g.id, text: g.name, selected: draft?.goodId === g.id || undefined }),
      );
    }
    const unitsInput = h("input", {
      type: "number", class: "input", min: "1", step: "1", value: draft?.units || "20",
      "aria-label": "Cargo units", "data-testid": "routes-units",
    }) as HTMLInputElement;
    const guardsInput = h("input", {
      type: "number", class: "input", min: "0", step: "1", value: draft?.guards || "4",
      "aria-label": "Guards", "data-testid": "routes-guards",
    }) as HTMLInputElement;

    const stopSelect = h("select", { class: "input", "aria-label": "Add a stop", "data-testid": "routes-stop-select" }) as HTMLSelectElement;
    stopSelect.appendChild(h("option", { value: "", text: "Add a stop…" }));
    for (const s of settlements) {
      if (pendingStops.some((p) => p.settlementId === s.id)) continue;
      stopSelect.appendChild(h("option", { value: s.id, text: s.name }));
    }
    const stopsList = h("ul", { class: "routes__stops", "data-testid": "routes-stops" });
    for (const stop of pendingStops) {
      const remove = h("button", {
        type: "button", class: "btn btn--quiet", text: "Remove",
        "aria-label": `Remove ${stop.name} from the route`,
      });
      remove.addEventListener("click", () => {
        const draftNow = readDraft();
        const i = pendingStops.findIndex((p) => p.settlementId === stop.settlementId);
        if (i >= 0) pendingStops.splice(i, 1);
        renderForm(draftNow);
      });
      stopsList.appendChild(h("li", {}, h("span", { text: stop.name }), remove));
    }
    const addStop = h("button", { type: "button", class: "btn", text: "Add stop", "data-testid": "routes-add-stop" });
    addStop.addEventListener("click", () => {
      const draftNow = readDraft();
      const chosen = settlements.find((s) => s.id === stopSelect.value);
      if (!chosen) return;
      pendingStops.push({ settlementId: chosen.id, name: chosen.name });
      renderForm(draftNow);
    });

    const foundBtn = h("button", {
      type: "button", class: "btn btn--primary", text: "Found caravan", "data-testid": "routes-found",
    });
    foundBtn.addEventListener("click", () => {
      errorLine.hidden = true;
      const good = goods.find((g) => g.id === goodSelect.value) ?? goods[0];
      if (!good) {
        errorLine.textContent = "No trade goods on the market right now.";
        errorLine.hidden = false;
        return;
      }
      try {
        options.onFound({
          name: nameInput.value,
          stops: [...pendingStops],
          goodId: good.id,
          goodName: good.name,
          units: Number(unitsInput.value),
          guards: Number(guardsInput.value),
        });
        pendingStops.length = 0;
        renderForm();
        renderList();
      } catch (err) {
        errorLine.textContent = err instanceof Error ? err.message : "Could not found the caravan.";
        errorLine.hidden = false;
      }
    });

    formSection.append(
      h("h3", { class: "routes__found-title", text: "Found a caravan" }),
      h("div", { class: "routes__field" }, h("label", { text: "Name" }, nameInput)),
      h("div", { class: "routes__row" },
        h("div", { class: "routes__field" }, h("label", { text: "Cargo" }, goodSelect)),
        h("div", { class: "routes__field" }, h("label", { text: "Units" }, unitsInput)),
        h("div", { class: "routes__field" }, h("label", { text: "Guards" }, guardsInput)),
      ),
      h("div", { class: "routes__field" },
        h("label", { text: "Route stops (the caravan loops back to the first)" }),
        h("div", { class: "routes__row" }, stopSelect, addStop),
        stopsList,
      ),
      errorLine,
      foundBtn,
    );
  }

  renderList();
  renderForm();

  // -- Overlay canvas ----------------------------------------------------------
  const overlay = document.createElement("canvas");
  overlay.className = "routes__overlay";
  overlay.setAttribute("aria-hidden", "true");
  options.overlayHost.appendChild(overlay);

  let disposed = false;
  let raf = 0;

  function draw(): void {
    if (disposed) return;
    const { width, height } = options.renderSize();
    if (width > 0 && height > 0 && (overlay.width !== width || overlay.height !== height)) {
      overlay.width = width;
      overlay.height = height;
    }
    if (overlay.width === 0 || overlay.height === 0) return;
    const reduced =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    drawRoutes(
      overlay,
      options.models(),
      options.toScreen,
      performance.now(),
      { reducedMotion: reduced },
    );
  }

  function frame(): void {
    if (disposed) return;
    draw();
    raf = requestAnimationFrame(frame);
  }

  if (typeof requestAnimationFrame === "function") {
    raf = requestAnimationFrame(frame);
  } else {
    draw();
  }

  return {
    root,
    refresh() {
      renderList();
      draw();
    },
    dispose() {
      disposed = true;
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf);
      overlay.remove();
    },
  };
}

export { buildRouteModels };
export type { RouteModel };
