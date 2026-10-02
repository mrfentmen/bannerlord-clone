/**
 * The battle commander: click/drag selection, control groups, and the hold-to-open
 * command radial, wired to the input registry and a CommandSurface.
 *
 * Gesture summary:
 * - click a unit: select it (Shift+click toggles into the selection)
 * - drag a box: select every live unit inside
 * - right-click the field: move the selected units there (task 51)
 * - Shift+click empty ground: queue a waypoint for the selected units
 * - Alt+click: drop a ping marker (visible 5 s, edge arrow when off-screen)
 * - hold the command-menu key (Space): radial opens at the pointer; flick toward
 *   an order and release to issue it to the selected units (or, with the
 *   holdToggles accessibility setting, press once to open and press again to
 *   confirm — no holding required)
 * - 1-9: recall control group; Ctrl+1-9: assign the current selection
 * - F1-F4 (or f/g/h/r): attack/follow/hold/retreat the selected units at the pointer
 * - A: attack-move — the next click on the field advances the selection there
 * - C: charge — run at the pointer and engage
 * - S: spread out — loosen the selection's front
 * - Shift+G: form up — close ranks on the spot
 * - T: rally-point mode — next click plants the flag for reinforcements
 * - X: retreat horn — every live unit routs to the map edge
 * - the select-all action grabs every live unit
 */

import { h } from "../ui/dom.js";
import { input, type InputRegistry } from "../input/index.js";
import { settings } from "../settings/index.js";
import { createSelection, type SelectionModel } from "./selection.js";
import { createRadialMenu, type RadialMenu } from "./radial.js";
import { createMarkers, type Markers } from "./markers.js";
import { showOrderDelay, type OrderDelayHandle } from "./orderDelay.js";
import { createSelectionPanel, type SelectionPanel } from "./selectionPanel.js";
import { createOrderPanel, type OrderPanel } from "./orderPanel.js";
import type { CommandSurface, Order, OrderKind } from "./types.js";

export interface Commander {
  selection: SelectionModel;
  destroy(): void;
}

/**
 * Haptic/UI hooks for battle events (MASTER_PLAN task 7). The commander stays
 * sim-agnostic: whoever builds the battle view wires these to the haptics
 * layer (`createHaptics`), so orders thump and casualties sting the controller.
 */
export interface CommanderEvents {
  /** An order was issued through the radial menu. */
  onOrder?: (kind: OrderKind, unitIds: string[]) => void;
  /** Selection changed (select-all, control group recalled, radial opened). */
  onSelect?: () => void;
  /** Total unit count dropped — units took losses. */
  onHit?: () => void;
}

const RADIAL_ORDERS: OrderKind[] = ["attack", "follow", "hold", "retreat"];
const DRAG_THRESHOLD_PX = 6;
const CLICK_RADIUS_PX = 24;

const registeredControlGroups = new WeakSet<InputRegistry>();
const registeredBattleOrders = new WeakSet<InputRegistry>();

/**
 * Task 52: attack-move is a mode, not an instant order — press A, then click
 * the field. Task 54: charge is an instant order aimed at the pointer. Both
 * actions are registered here (as the control groups are) rather than in the
 * catalog, because the catalog owns what exists at boot.
 */
function ensureAttackMoveAction(registry: InputRegistry): void {
  if (registeredBattleOrders.has(registry)) return;
  registeredBattleOrders.add(registry);
  if (!registry.actions().some((a) => a.id === "battle.orderFormUp")) {
    registry.registerAction({
      id: "battle.orderFormUp",
      label: "Order: form up",
      description: "Selected units close ranks on the spot they hold.",
      category: "battle-command",
      // Shift+G: plain "g" is battle.orderFollow (task 56), and one letter cannot
      // mean two orders. The order panel (task 59) shows this chord, so the
      // doubling-up is discoverable rather than a hidden key.
      defaultKeys: [{ key: "g", shift: true }],
      preventDefault: true,
    });
  }
  if (!registry.actions().some((a) => a.id === "battle.orderSpread")) {
    registry.registerAction({
      id: "battle.orderSpread",
      label: "Order: spread out",
      description: "Selected units loosen up and hold a wider front.",
      category: "battle-command",
      // Plain "s": the map's pan-south chord is the same letter, but that handler
      // is guarded by "a settlement is selected", so the two never both fire.
      defaultKeys: [{ key: "s" }],
      preventDefault: true,
    });
  }
  if (!registry.actions().some((a) => a.id === "battle.orderCharge")) {
    registry.registerAction({
      id: "battle.orderCharge",
      label: "Order: charge",
      description: "Selected units run at the target and engage at a charge.",
      category: "battle-command",
      defaultKeys: [{ key: "c" }],
      preventDefault: true,
    });
  }
  if (registry.actions().some((a) => a.id === "battle.orderAttackMove")) return;
  registry.registerAction({
    id: "battle.orderAttackMove",
    label: "Order: attack-move",
    description: "Advance to the clicked spot, engaging anything on the way.",
    category: "battle-command",
    // Plain "a"; select-all keeps Ctrl+A, so the two never meet.
    defaultKeys: [{ key: "a" }],
    preventDefault: true,
  });
}

function ensureControlGroupActions(registry: InputRegistry): void {
  if (registeredControlGroups.has(registry)) return;
  registeredControlGroups.add(registry);
  for (let n = 1; n <= 9; n++) {
    const id = `battle.controlGroup${n}`;
    if (registry.actions().some((a) => a.id === id)) continue;
    registry.registerAction({
      id,
      label: `Control group ${n}`,
      description: `Recall control group ${n}. Hold Ctrl while pressing to assign the current selection.`,
      category: "battle-command",
      // Both chords: the plain press recalls, Ctrl+press assigns (told apart in
      // the handler via the event's modifiers).
      defaultKeys: [{ key: String(n) }, { key: String(n), ctrl: true }],
      // Ctrl+digit switches browser tabs without this.
      preventDefault: true,
    });
  }
}

export function createCommander(
  surface: CommandSurface,
  registry: InputRegistry = input,
  events: CommanderEvents = {},
): Commander {
  ensureControlGroupActions(registry);
  ensureAttackMoveAction(registry);
  const selection = createSelection();
  const offs: Array<() => void> = [];
  let radial: RadialMenu | null = null;
  let lastPointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  let marquee: HTMLElement | null = null;
  let dragStart: { x: number; y: number } | null = null;

  const overlay = surface.overlay();
  const markers: Markers = createMarkers(overlay);
  const panel: SelectionPanel = createSelectionPanel();
  overlay.appendChild(panel.root);
  // Task 59: the order row lives in the same overlay, under the selection panel.
  const orderPanel: OrderPanel = createOrderPanel({ registry });
  overlay.appendChild(orderPanel.root);
  const delays: OrderDelayHandle[] = [];
  /** Task 47: the last order issued to each unit — the panel's "stance". */
  const lastOrder = new Map<string, OrderKind>();
  /** Task 43: queued waypoints for the current selection, in field coords. */
  let waypointQueue: { x: number; z: number }[] = [];
  /** Task 45: the next field click plants the rally flag. */
  let placingRally = false;
  /** Task 52: the next field click issues an attack-move to that spot. */
  let placingAttackMove = false;
  const modeHint = h("div", { class: "cmd-modehint", "data-testid": "cmd-modehint" });
  modeHint.hidden = true;
  overlay.appendChild(modeHint);

  function setModeHint(text: string | null): void {
    modeHint.hidden = text == null;
    if (text != null) modeHint.textContent = text;
  }

  function liveUnits() {
    const byId = new Map(surface.units().map((u) => [u.id, u]));
    return { byId, units: surface.units().filter((u) => u.count > 0) };
  }

  function updatePanel(): void {
    const { byId } = liveUnits();
    panel.update(
      selection.selected().flatMap((id) => {
        const u = byId.get(id);
        if (!u) return [];
        const lo = lastOrder.get(id);
        return [{ id: u.id, label: u.label, kind: u.kind, count: u.count, ...(lo ? { lastOrder: lo } : {}) }];
      }),
    );
  }

  /** Every order goes through here: sim gets it, the panel learns the stance,
   *  and the courier runs the delay visualization. */
  function issue(order: Order): void {
    surface.issueOrder(order);
    for (const id of order.unitIds) lastOrder.set(id, order.kind);
    const { byId } = liveUnits();
    let dest: { x: number; y: number };
    if (order.target) {
      dest = surface.fieldToScreen(order.target.x, order.target.z);
    } else if (order.waypoints && order.waypoints.length > 0) {
      const last = order.waypoints[order.waypoints.length - 1]!;
      dest = surface.fieldToScreen(last.x, last.z);
    } else {
      const pts = order.unitIds.flatMap((id) => {
        const u = byId.get(id);
        return u ? [surface.fieldToScreen(u.x, u.z)] : [];
      });
      dest =
        pts.length > 0
          ? {
              x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
              y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
            }
          : { x: lastPointer.x, y: lastPointer.y };
    }
    delays.push(showOrderDelay(overlay, order, dest));
    updatePanel();
    events.onOrder?.(order.kind, order.unitIds);
  }

  function clearWaypoints(): void {
    waypointQueue = [];
    markers.clearWaypoints();
  }

  /**
   * Leave whichever click-to-place mode is armed (rally, attack-move). One
   * function for both, so Esc, a second press of the mode key, and a
   * right-click all end the mode the same way.
   */
  function cancelOrderMode(): void {
    placingRally = false;
    placingAttackMove = false;
    setModeHint(null);
  }

  function closeRadial(): void {
    radial?.destroy();
    radial = null;
  }

  function openRadial(): void {
    if (radial || selection.selected().length === 0) return;
    events.onSelect?.();
    radial = createRadialMenu({
      items: RADIAL_ORDERS.map((kind) => ({ kind })),
      x: lastPointer.x,
      y: lastPointer.y,
      onPick: (kind) => {
        const unitIds = selection.selected();
        radial = null;
        if (unitIds.length > 0) {
          clearWaypoints();
          issue({ kind, unitIds, at: Date.now() });
        }
      },
      onCancel: () => {
        radial = null;
      },
    });
    surface.overlay().appendChild(radial.root);
  }

  // -- pointer tracking --------------------------------------------------------
  const onPointerMove = (ev: PointerEvent): void => {
    lastPointer = { x: ev.clientX, y: ev.clientY };
    if (dragStart && marquee) {
      const x = Math.min(dragStart.x, ev.clientX);
      const y = Math.min(dragStart.y, ev.clientY);
      marquee.style.left = `${x}px`;
      marquee.style.top = `${y}px`;
      marquee.style.width = `${Math.abs(ev.clientX - dragStart.x)}px`;
      marquee.style.height = `${Math.abs(ev.clientY - dragStart.y)}px`;
    }
  };

  // -- selection gestures ------------------------------------------------------
  const onPointerDown = (ev: PointerEvent): void => {
    if (radial) return; // the radial owns the pointer while open
    if (ev.button !== 0) return;
    dragStart = { x: ev.clientX, y: ev.clientY };
  };

  /**
   * Task 51: right-click on the field moves the selected units there. Right-click
   * on one of your own units is ignored — the drag gesture owns the left button,
   * so nothing else is listening for it.
   */
  const onContextMenu = (ev: MouseEvent): void => {
    ev.preventDefault();
    if (radial || placingRally) return;
    const unitIds = selection.selected();
    if (unitIds.length === 0) return;
    const field = surface.screenToField(ev.clientX, ev.clientY);
    cancelOrderMode(); // a right-click is an order, so it ends any pending mode
    clearWaypoints();
    issue({ kind: "move", unitIds, target: field, at: Date.now() });
  };

  const onPointerUp = (ev: PointerEvent): void => {
    if (ev.button !== 0) return;
    // Right-click orders a move; it never ends a selection drag.
    if (!dragStart) return;
    const start = dragStart;
    dragStart = null;

    // Task 45: rally mode — the click plants the flag, whatever it hits.
    if (placingRally) {
      const field = surface.screenToField(ev.clientX, ev.clientY);
      markers.setRallyPoint(ev.clientX, ev.clientY);
      const unitIds = selection.selected();
      cancelOrderMode();
      if (unitIds.length > 0) issue({ kind: "rally", unitIds, target: field, at: Date.now() });
      return;
    }

    // Task 44: Alt+click pings without touching the selection.
    if (ev.altKey) {
      markers.ping(ev.clientX, ev.clientY);
      return;
    }

    // Task 52: attack-move mode — the next click on the field engages towards it.
    if (placingAttackMove) {
      const field = surface.screenToField(ev.clientX, ev.clientY);
      const unitIds = selection.selected();
      cancelOrderMode();
      if (unitIds.length > 0) {
        clearWaypoints();
        issue({ kind: "attack-move", unitIds, target: field, at: Date.now() });
      }
      return;
    }

    if (marquee) {
      marquee.remove();
      marquee = null;
      const a = surface.screenToField(start.x, start.y);
      const b = surface.screenToField(ev.clientX, ev.clientY);
      selection.boxSelect(surface.units(), a.x, a.z, b.x, b.z);
      return;
    }
    // A click: nearest live unit inside the grab radius.
    let best: string | null = null;
    let bestDist = CLICK_RADIUS_PX;
    for (const u of surface.units()) {
      if (u.count <= 0) continue;
      const p = surface.fieldToScreen(u.x, u.z);
      const d = Math.hypot(p.x - ev.clientX, p.y - ev.clientY);
      if (d < bestDist) {
        bestDist = d;
        best = u.id;
      }
    }
    if (!best) {
      if (ev.shiftKey) {
        // Task 43: Shift+click on empty ground queues a waypoint leg.
        const unitIds = selection.selected();
        if (unitIds.length > 0) {
          const field = surface.screenToField(ev.clientX, ev.clientY);
          waypointQueue.push(field);
          markers.setWaypoints(waypointQueue.map((w) => surface.fieldToScreen(w.x, w.z)));
          issue({ kind: "move", unitIds, waypoints: [...waypointQueue], at: Date.now() });
        }
        return;
      }
      selection.clear();
      return;
    }
    if (ev.shiftKey) selection.toggle(best);
    else selection.select([best]);
  };

  const beginMarquee = (ev: PointerEvent): void => {
    if (!dragStart || marquee || radial) return;
    if (Math.hypot(ev.clientX - dragStart.x, ev.clientY - dragStart.y) < DRAG_THRESHOLD_PX) return;
    marquee = h("div", { class: "marquee", "data-testid": "selection-marquee", "aria-hidden": "true" });
    const overlay = surface.overlay();
    // The overlay may not be positioned; the marquee uses client coords, so it
    // needs a viewport-anchored home when the overlay is static.
    if (getComputedStyle(overlay).position === "static") {
      marquee.style.position = "fixed";
    }
    overlay.appendChild(marquee);
  };

  // -- input actions ------------------------------------------------------------
  // Task 23: with `holdToggles` the command menu is a toggle — press once to
  // open, press again (or click / Enter) to confirm — instead of hold-to-open.
  offs.push(
    registry.on(
      "battle.commandMenu",
      (ev) => {
        if (ev.keyEvent?.repeat) return;
        if (settings.get().holdToggles) {
          if (radial) {
            const menu = radial;
            radial = null;
            menu.confirm();
          } else {
            openRadial();
          }
        } else {
          openRadial();
        }
      },
      { when: () => radial === null || settings.get().holdToggles },
    ),
  );
  offs.push(
    registry.onRelease("battle.commandMenu", () => {
      if (settings.get().holdToggles) return; // release does nothing in toggle mode
      if (!radial) return;
      const menu = radial;
      radial = null;
      menu.confirm();
    }),
  );
  offs.push(
    registry.on("battle.selectAll", () => {
      selection.select(surface.units().filter((u) => u.count > 0).map((u) => u.id));
      events.onSelect?.();
    }),
  );
  // -- task 42: double-tap a control group to jump the camera to it --------
  const lastRecallAt = new Map<number, number>();
  const DOUBLE_TAP_MS = 400;
  function maybeFocusGroup(n: number): void {
    const now = Date.now();
    const last = lastRecallAt.get(n);
    if (last !== undefined && now - last <= DOUBLE_TAP_MS) {
      lastRecallAt.delete(n); // a third tap starts a new pair
      const ids = new Set(selection.selected());
      const units = surface.units().filter((u) => ids.has(u.id));
      if (units.length === 0) return;
      const cx = units.reduce((s, u) => s + u.x, 0) / units.length;
      const cz = units.reduce((s, u) => s + u.z, 0) / units.length;
      surface.focusCamera?.(cx, cz);
    } else {
      lastRecallAt.set(n, now);
    }
  }
  for (let n = 1; n <= 9; n++) {
    offs.push(
      registry.on(`battle.controlGroup${n}`, (ev) => {
        if (ev.keyEvent?.ctrlKey || ev.keyEvent?.metaKey) selection.assignGroup(n);
        else {
          selection.recallGroup(n);
          events.onSelect?.();
          maybeFocusGroup(n);
        }
      }),
    );
  }

  // -- quick order hotkeys (task 40: F1-F4, aliased to f/g/h/r in the catalog) ---
  // attack/follow aim at the pointer; hold/retreat are pointerless.
  function orderSelection(kind: OrderKind, targeted: boolean): void {
    const unitIds = selection.selected();
    if (unitIds.length === 0) return;
    clearWaypoints();
    const order: Order = { kind, unitIds, at: Date.now() };
    if (targeted) order.target = surface.screenToField(lastPointer.x, lastPointer.y);
    issue(order);
  }
  offs.push(registry.on("battle.orderAttack", () => orderSelection("attack", true)));
  offs.push(registry.on("battle.orderFollow", () => orderSelection("follow", true)));
  offs.push(registry.on("battle.orderHold", () => orderSelection("hold", false)));
  offs.push(registry.on("battle.orderRetreat", () => orderSelection("retreat", false)));
  // Task 54: charge aims at the pointer, like attack — a charge with no enemy in
  // front of it is still a charge, so no extra mode and no click.
  offs.push(registry.on("battle.orderCharge", () => orderSelection("charge", true)));
  // Tasks 57-58: spread out and form up are pointerless orders about the shape
  // of the selection, wherever it happens to be standing.
  offs.push(registry.on("battle.orderSpread", () => orderSelection("spread", false)));
  offs.push(registry.on("battle.orderFormUp", () => orderSelection("form-up", false)));

  // -- attack-move (task 52): A arms the mode, the next field click issues it --
  offs.push(
    registry.on("battle.orderAttackMove", () => {
      if (placingAttackMove) {
        cancelOrderMode();
        return;
      }
      if (selection.selected().length === 0) return;
      placingAttackMove = true;
      setModeHint("Attack-move: click the field to advance and engage. Esc cancels.");
    }),
  );

  // -- ping (task 44): the Alt+q chord drops one at the pointer ------------------
  offs.push(
    registry.on("battle.ping", () => {
      markers.ping(lastPointer.x, lastPointer.y);
    }),
  );

  // -- rally point (task 45) -------------------------------------------------------
  offs.push(
    registry.on("battle.setRallyPoint", () => {
      if (placingRally) {
        cancelOrderMode();
        return;
      }
      if (selection.selected().length === 0) return;
      placingRally = true;
      setModeHint("Rally: click the field to plant the flag. Esc cancels.");
    }),
  );

  // -- retreat horn (task 48): one order, the whole force, map edge ----------------
  offs.push(
    registry.on("battle.retreatHorn", () => {
      const ids = liveUnits().units.map((u) => u.id);
      if (ids.length === 0) return;
      clearWaypoints();
      const order: Order = { kind: "retreat", unitIds: ids, at: Date.now() };
      const bounds = surface.fieldBounds?.();
      if (bounds) {
        // The friendly edge is south: reinforcements arrive there, routs leave there.
        order.target = { x: (bounds.minX + bounds.maxX) / 2, z: bounds.minZ };
      }
      issue(order);
    }),
  );

  // Esc cancels rally mode and drops queued waypoints.
  const onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.key !== "Escape") return;
    if (placingRally || placingAttackMove) {
      cancelOrderMode();
      ev.stopPropagation();
    } else if (waypointQueue.length > 0) {
      clearWaypoints();
    }
  };
  window.addEventListener("keydown", onKeyDown, true);

  // -- surface events ------------------------------------------------------------
  overlay.addEventListener("pointerdown", onPointerDown);
  overlay.addEventListener("contextmenu", onContextMenu);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointermove", beginMarquee);
  window.addEventListener("pointerup", onPointerUp);
  let lastTotal = surface.units().reduce((s, u) => s + Math.max(0, u.count), 0);
  offs.push(surface.onUnitsChanged(() => {
    const units = surface.units();
    const total = units.reduce((s, u) => s + Math.max(0, u.count), 0);
    if (total < lastTotal) events.onHit?.(); // casualties
    lastTotal = total;
    const live = new Set(units.filter((u) => u.count > 0).map((u) => u.id));
    const kept = selection.selected().filter((id) => live.has(id));
    selection.select(kept);
    updatePanel();
  }));
  // Waypoints belong to the selection that queued them; a new selection
  // starts with a clean slate, and the panel follows every change.
  offs.push(
    selection.onChanged(() => {
      clearWaypoints();
      // Task 59: with nothing selected there is nothing to order, so the row
      // is hidden and its buttons disabled.
      orderPanel.setEnabled(selection.selected().length > 0);
      updatePanel();
    }),
  );
  updatePanel();

  return {
    selection,
    destroy() {
      for (const off of offs) off();
      overlay.removeEventListener("pointerdown", onPointerDown);
      overlay.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointermove", beginMarquee);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("keydown", onKeyDown, true);
      marquee?.remove();
      closeRadial();
      for (const d of delays) d.destroy();
      markers.destroy();
      panel.destroy();
      orderPanel.destroy();
      modeHint.remove();
    },
  };
}
