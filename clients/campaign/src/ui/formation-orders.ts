/**
 * Formation order UI. MASTER_PLAN.md section 2C (tasks 61-68).
 *
 * The order palette, formation shape selector, target picker, order queue,
 * drag-box / ctrl-click group selection, stance toggles, and order toasts.
 *
 * This module owns no sim connection and no 3D scene. The caller injects:
 *   - postOrders: ships OrderPayload[] to POST /v1/battle/orders (the caller
 *     wraps them with battle_id / campaign_session_id; see the wire shape in
 *     services/simulation/internal/battleapi/server.go).
 *   - formationScreenPos: maps a formation id to screen pixels for drag-box
 *     selection (the battle scene provides it).
 *   - onFaceArrow / onSelectBox: render callbacks for the drag-to-aim arrow
 *     and the selection rectangle on the terrain.
 *
 * Orders are validated client-side against the fourteen wire names so a typo
 * can never reach the API as an unknown order.
 */

import { h } from "./dom.js";

/** The fourteen formation orders the sim API accepts. */
export const ORDER_NAMES = [
  "hold-position",
  "move",
  "advance",
  "charge",
  "follow",
  "fall-back",
  "face-direction",
  "change-formation",
  "change-spacing",
  "volley-fire",
  "fire-at-will",
  "take-cover",
  "flank",
  "retreat",
] as const;

export type OrderName = (typeof ORDER_NAMES)[number];

export function isOrderName(name: string): name is OrderName {
  return (ORDER_NAMES as readonly string[]).includes(name);
}

const ORDER_LABELS: Record<OrderName, string> = {
  "hold-position": "Hold",
  move: "Move",
  advance: "Advance",
  charge: "Charge",
  follow: "Follow",
  "fall-back": "Fall back",
  "face-direction": "Face direction",
  "change-formation": "Change formation",
  "change-spacing": "Change spacing",
  "volley-fire": "Volley fire",
  "fire-at-will": "Fire at will",
  "take-cover": "Take cover",
  flank: "Flank",
  retreat: "Retreat",
};

/** The four palette orders with their hotkeys (task 61). */
export const PALETTE_ORDERS: { name: OrderName; hotkey: string }[] = [
  { name: "hold-position", hotkey: "1" },
  { name: "advance", hotkey: "2" },
  { name: "charge", hotkey: "3" },
  { name: "fall-back", hotkey: "4" },
];

export const FORMATION_SHAPES = ["line", "column", "wedge", "square", "skirmish"] as const;
export type FormationShape = (typeof FORMATION_SHAPES)[number];

export type Stance = "engage" | "hold-fire" | "brace";

export interface FormationInfo {
  id: string;
  name: string;
}

export interface OrderPayload {
  name: OrderName;
  params?: Record<string, unknown>;
}

interface Point {
  x: number;
  y: number;
}

export interface FormationOrdersOptions {
  formations: FormationInfo[];
  enemyFormations: FormationInfo[];
  postOrders: (orders: OrderPayload[]) => void | Promise<void>;
  /** Maps a formation id to screen pixels; needed for drag-box selection. */
  formationScreenPos?: (id: string) => Point | null;
  /** Renders the face-direction drag arrow on the terrain. */
  onFaceArrow?: (from: Point, to: Point | null) => void;
  /** Renders the drag-select rectangle on the terrain. */
  onSelectBox?: (rect: { x0: number; y0: number; x1: number; y1: number } | null) => void;
}

export interface FormationOrdersHandle {
  root: HTMLElement;
  getSelected: () => string[];
  setSelected: (ids: string[], additive?: boolean) => void;
  getTarget: () => string | null;
  getStance: (formationId: string) => Stance | null;
  getQueue: (formationId: string) => OrderPayload[];
  issue: (name: OrderName, params?: Record<string, unknown>, queue?: boolean) => void;
  flushQueue: (formationId: string) => void;
  attachSurface: (el: HTMLElement) => void;
  destroy: () => void;
}

const TOAST_MS = 2500;

export function createFormationOrdersPanel(opts: FormationOrdersOptions): FormationOrdersHandle {
  const root = h("div", { class: "orders-panel" });

  const selected = new Set<string>();
  const queues = new Map<string, OrderPayload[]>();
  const stances = new Map<string, Stance>();
  let targetId: string | null = null;
  let facingMode = false;

  const selectedList = h("div", { class: "orders-selected" });
  const queueStrip = h("div", { class: "orders-queues" });
  const toastBox = h("div", { class: "orders-toasts" });
  const announce = h("div", { class: "visually-hidden", role: "status", "aria-live": "polite" });

  const nameOf = (id: string): string =>
    opts.formations.find((f) => f.id === id)?.name ?? id;

  function showToast(text: string): void {
    const toast = h("div", { class: "orders-toast" }, text);
    toastBox.append(toast);
    announce.textContent = text;
    setTimeout(() => {
      toast.classList.add("fade");
      setTimeout(() => toast.remove(), 400);
    }, TOAST_MS);
  }

  function renderSelection(): void {
    selectedList.innerHTML = "";
    if (selected.size === 0) {
      selectedList.append(h("span", { class: "orders-none" }, "No formation selected"));
      return;
    }
    for (const id of selected) {
      selectedList.append(h("span", { class: "orders-chip sel" }, nameOf(id)));
    }
  }

  function renderQueues(): void {
    queueStrip.innerHTML = "";
    for (const [fid, q] of queues) {
      if (q.length === 0) continue;
      const strip = h("div", { class: "orders-queue" });
      strip.append(h("span", { class: "orders-queue-name" }, `${nameOf(fid)}:`));
      q.forEach((order, i) => {
        const chip = h("button", {
          class: "orders-chip queue",
          type: "button",
          title: "Right-click to cancel",
          "data-formation": fid,
          "data-index": String(i),
        }, `${i + 1}. ${ORDER_LABELS[order.name]}`);
        chip.addEventListener("contextmenu", (ev) => {
          ev.preventDefault();
          cancelQueued(fid, i);
        });
        strip.append(chip);
      });
      const send = h("button", { class: "orders-send", type: "button" }, "Issue");
      send.addEventListener("click", () => flushQueue(fid));
      strip.append(send);
      queueStrip.append(strip);
    }
  }

  function cancelQueued(fid: string, index: number): void {
    const q = queues.get(fid);
    if (!q) return;
    q.splice(index, 1);
    renderQueues();
  }

  function orderParams(base?: Record<string, unknown>): Record<string, unknown> {
    const params: Record<string, unknown> = { ...(base ?? {}) };
    if (targetId) params.target_formation_id = targetId;
    return params;
  }

  function issue(name: OrderName, params?: Record<string, unknown>, queue = false): void {
    if (!isOrderName(name)) return;
    if (selected.size === 0) {
      showToast("Select a formation first");
      return;
    }
    const stance = stances.get(firstSelected());
    for (const fid of selected) {
      const payload: OrderPayload = { name, params: { formation_id: fid, ...orderParams(params) } };
      if (queue) {
        const q = queues.get(fid) ?? [];
        q.push(payload);
        queues.set(fid, q);
      } else {
        // A direct order flushes anything queued first, in order.
        const pending = queues.get(fid) ?? [];
        queues.set(fid, []);
        void opts.postOrders([...pending, payload]);
      }
      showToast(`${nameOf(fid)}: ${ORDER_LABELS[name]}${queue ? " (queued)" : ""}${stance ? ` [${stance}]` : ""}`);
    }
    renderQueues();
  }

  const firstSelected = (): string => [...selected][0] ?? "";

  function flushQueue(fid: string): void {
    const q = queues.get(fid) ?? [];
    if (q.length === 0) return;
    queues.set(fid, []);
    void opts.postOrders(q);
    showToast(`${nameOf(fid)}: ${q.length} queued order${q.length === 1 ? "" : "s"} issued`);
    renderQueues();
  }

  // --- Palette: the four primary orders + hotkeys 1-4 (task 61). ---
  const palette = h("div", { class: "orders-palette" });
  for (const { name, hotkey } of PALETTE_ORDERS) {
    const btn = h("button", {
      class: "orders-btn",
      type: "button",
      "data-order": name,
      "data-hotkey": hotkey,
      title: `${ORDER_LABELS[name]} (hotkey ${hotkey}, shift-click queues)`,
    }, `${ORDER_LABELS[name]} [${hotkey}]`);
    btn.addEventListener("click", (ev) => issue(name, undefined, (ev as MouseEvent).shiftKey));
    palette.append(btn);
  }

  // --- Full order grid (the rest of the fourteen). ---
  const rest = h("div", { class: "orders-grid" });
  for (const name of ORDER_NAMES) {
    if (PALETTE_ORDERS.some((p) => p.name === name)) continue;
    if (name === "face-direction") continue; // handled by the drag tool below
    const btn = h("button", {
      class: "orders-btn small",
      type: "button",
      "data-order": name,
      title: `${ORDER_LABELS[name]} (shift-click queues)`,
    }, ORDER_LABELS[name]);
    btn.addEventListener("click", (ev) => issue(name, undefined, (ev as MouseEvent).shiftKey));
    rest.append(btn);
  }

  // --- Face-direction drag tool (task 62). ---
  const faceBtn = h("button", {
    class: "orders-btn small",
    type: "button",
    "aria-pressed": "false",
    title: "Drag on the battlefield to set facing",
  }, "Face direction");
  faceBtn.addEventListener("click", () => {
    facingMode = !facingMode;
    faceBtn.classList.toggle("active", facingMode);
    faceBtn.setAttribute("aria-pressed", String(facingMode));
  });

  // --- Formation shapes (task 63). ---
  const shapes = h("div", { class: "orders-shapes" });
  for (const shape of FORMATION_SHAPES) {
    const btn = h("button", {
      class: "orders-btn small",
      type: "button",
      "data-shape": shape,
      title: `Change formation: ${shape} (shift-click queues)`,
    });
    btn.append(shapeGlyph(shape));
    btn.append(h("span", {}, shape));
    btn.addEventListener("click", (ev) =>
      issue("change-formation", { shape }, (ev as MouseEvent).shiftKey));
    shapes.append(btn);
  }

  // --- Target selection (task 64). ---
  const targets = h("div", { class: "orders-targets" });
  targets.append(h("span", { class: "orders-label" }, "Target:"));
  const targetButtons = new Map<string, HTMLElement>();
  for (const enemy of opts.enemyFormations) {
    const btn = h("button", {
      class: "orders-btn small enemy",
      type: "button",
      "data-target": enemy.id,
      "aria-pressed": "false",
    }, enemy.name);
    btn.addEventListener("click", () => {
      targetId = targetId === enemy.id ? null : enemy.id;
      for (const [id, el] of targetButtons) {
        const active = id === targetId;
        el.classList.toggle("active", active);
        el.setAttribute("aria-pressed", String(active));
      }
    });
    targetButtons.set(enemy.id, btn);
    targets.append(btn);
  }

  // --- Stance toggles (task 67). ---
  const stanceDefs: { stance: Stance; label: string; order: OrderName | null }[] = [
    { stance: "engage", label: "Engage at will", order: "fire-at-will" },
    { stance: "hold-fire", label: "Hold fire", order: null },
    { stance: "brace", label: "Brace", order: "take-cover" },
  ];
  const stanceBar = h("div", { class: "orders-stances" });
  const stanceButtons = new Map<Stance, HTMLElement>();
  for (const def of stanceDefs) {
    const btn = h("button", {
      class: "orders-btn small stance",
      type: "button",
      "data-stance": def.stance,
      "aria-pressed": "false",
    }, def.label);
    btn.addEventListener("click", () => {
      const fid = firstSelected();
      if (!fid) {
        showToast("Select a formation first");
        return;
      }
      const current = stances.get(fid);
      const next = current === def.stance ? null : def.stance;
      if (next) stances.set(fid, next);
      else stances.delete(fid);
      for (const [s, el] of stanceButtons) {
        const active = s === next;
        el.classList.toggle("active", active);
        el.setAttribute("aria-pressed", String(active));
      }
      // Engage and brace map onto real orders; hold-fire is a local toggle
      // the sim reads from later fire-order params.
      if (next && def.order) issue(def.order);
      else showToast(`${nameOf(fid)}: stance ${next ?? "cleared"}`);
    });
    stanceButtons.set(def.stance, btn);
    stanceBar.append(btn);
  }

  root.append(
    h("div", { class: "orders-section" }, h("span", { class: "orders-label" }, "Orders"), palette),
    h("div", { class: "orders-section" }, faceBtn, rest),
    h("div", { class: "orders-section" }, h("span", { class: "orders-label" }, "Shape"), shapes),
    h("div", { class: "orders-section" }, targets),
    h("div", { class: "orders-section" }, h("span", { class: "orders-label" }, "Stance"), stanceBar),
    h("div", { class: "orders-section" }, h("span", { class: "orders-label" }, "Selected"), selectedList),
    queueStrip,
    toastBox,
    announce,
  );
  renderSelection();

  // --- Hotkeys 1-4 (task 61). ---
  function onKeyDown(ev: KeyboardEvent): void {
    const entry = PALETTE_ORDERS.find((p) => p.hotkey === ev.key);
    if (!entry) return;
    if ((ev.target as HTMLElement | null)?.closest?.("input, textarea")) return;
    const started = performance.now();
    issue(entry.name, undefined, ev.shiftKey);
    const elapsed = performance.now() - started;
    if (elapsed > 200) {
      // The 200ms budget is an acceptance criterion; log loudly if missed.
      console.warn(`[orders] hotkey ${ev.key} took ${elapsed.toFixed(1)}ms (budget 200ms)`);
    }
    ev.preventDefault();
  }
  window.addEventListener("keydown", onKeyDown);

  // --- Drag-box selection + face-direction drag (tasks 62, 66). ---
  let surface: HTMLElement | null = null;
  let dragStart: Point | null = null;
  let draggingFace = false;
  let surfaceHandlers: { el: HTMLElement; type: string; fn: EventListener }[] = [];

  function onSurfaceDown(ev: Event): void {
    const mev = ev as MouseEvent;
    if (mev.button !== 0) return;
    const rect = surface!.getBoundingClientRect();
    dragStart = { x: mev.clientX - rect.left, y: mev.clientY - rect.top };
    if (facingMode) {
      draggingFace = true;
      opts.onFaceArrow?.(dragStart, dragStart);
    }
  }
  function onSurfaceMove(ev: Event): void {
    if (!dragStart) return;
    const mev = ev as MouseEvent;
    const rect = surface!.getBoundingClientRect();
    const cur = { x: mev.clientX - rect.left, y: mev.clientY - rect.top };
    if (draggingFace) {
      opts.onFaceArrow?.(dragStart, cur);
    } else {
      opts.onSelectBox?.({
        x0: Math.min(dragStart.x, cur.x),
        y0: Math.min(dragStart.y, cur.y),
        x1: Math.max(dragStart.x, cur.x),
        y1: Math.max(dragStart.y, cur.y),
      });
    }
  }
  function onSurfaceUp(ev: Event): void {
    if (!dragStart) return;
    const mev = ev as MouseEvent;
    const rect = surface!.getBoundingClientRect();
    const cur = { x: mev.clientX - rect.left, y: mev.clientY - rect.top };
    if (draggingFace) {
      const dx = cur.x - dragStart.x;
      const dy = cur.y - dragStart.y;
      opts.onFaceArrow?.(dragStart, null);
      if (Math.hypot(dx, dy) > 4) {
        const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
        issue("face-direction", { angle_deg: Math.round(angleDeg * 10) / 10 });
      }
      draggingFace = false;
    } else if (opts.formationScreenPos) {
      const box = {
        x0: Math.min(dragStart.x, cur.x),
        y0: Math.min(dragStart.y, cur.y),
        x1: Math.max(dragStart.x, cur.x),
        y1: Math.max(dragStart.y, cur.y),
      };
      opts.onSelectBox?.(null);
      const additive = mev.ctrlKey || mev.metaKey;
      const inside = opts.formations
        .map((f) => f.id)
        .filter((id) => {
          const p = opts.formationScreenPos!(id);
          return p !== null && p.x >= box.x0 && p.x <= box.x1 && p.y >= box.y0 && p.y <= box.y1;
        });
      setSelected(inside, additive);
    }
    dragStart = null;
  }

  function attachSurface(el: HTMLElement): void {
    detachSurface();
    surface = el;
    const defs: [string, EventListener][] = [
      ["mousedown", onSurfaceDown],
      ["mousemove", onSurfaceMove],
      ["mouseup", onSurfaceUp],
    ];
    for (const [type, fn] of defs) {
      el.addEventListener(type, fn);
      surfaceHandlers.push({ el, type, fn });
    }
  }
  function detachSurface(): void {
    for (const { el, type, fn } of surfaceHandlers) el.removeEventListener(type, fn);
    surfaceHandlers = [];
    surface = null;
  }

  function setSelected(ids: string[], additive = false): void {
    if (!additive) selected.clear();
    for (const id of ids) {
      if (selected.has(id) && additive) selected.delete(id);
      else selected.add(id);
    }
    renderSelection();
  }

  function destroy(): void {
    window.removeEventListener("keydown", onKeyDown);
    detachSurface();
    root.remove();
  }

  return {
    root,
    getSelected: () => [...selected],
    setSelected,
    getTarget: () => targetId,
    getStance: (fid) => stances.get(fid) ?? null,
    getQueue: (fid) => [...(queues.get(fid) ?? [])],
    issue,
    flushQueue,
    attachSurface,
    destroy,
  };
}

/** Tiny SVG preview of a formation shape (task 63). */
function shapeGlyph(shape: FormationShape): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 20 20");
  svg.setAttribute("class", "orders-glyph");
  const dots: [number, number][] =
    shape === "line"
      ? [[2, 10], [6, 10], [10, 10], [14, 10], [18, 10]]
      : shape === "column"
        ? [[10, 2], [10, 6], [10, 10], [10, 14], [10, 18]]
        : shape === "wedge"
          ? [[10, 2], [7, 8], [13, 8], [4, 14], [16, 14]]
          : shape === "square"
            ? [[4, 4], [16, 4], [4, 16], [16, 16], [10, 10]]
            : [[3, 5], [9, 3], [15, 6], [6, 13], [13, 15]]; // skirmish: scattered
  for (const [cx, cy] of dots) {
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("cx", String(cx));
    c.setAttribute("cy", String(cy));
    c.setAttribute("r", "2");
    c.setAttribute("class", "orders-glyph-dot");
    svg.appendChild(c);
  }
  return svg;
}

/**
 * POST /v1/battle/orders client. The caller supplies battle and session ids;
 * this posts the wire shape the Go server decodes (see orderRequest).
 */
export function createBattleOrdersClient(
  baseUrl: string,
  battleId: string,
  sessionId: string,
  fetchFn: typeof fetch = fetch,
): (orders: OrderPayload[]) => Promise<void> {
  return async (orders: OrderPayload[]) => {
    const res = await fetchFn(`${baseUrl}/v1/battle/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        battle_id: battleId,
        campaign_session_id: sessionId,
        orders: orders.map((o) => ({ name: o.name, params: o.params ?? {} })),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`orders rejected (${res.status}): ${body.slice(0, 200)}`);
    }
  };
}
