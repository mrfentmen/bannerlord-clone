/**
 * The battle commander: click/drag selection, control groups, and the hold-to-open
 * command radial, wired to the input registry and a CommandSurface.
 *
 * Gesture summary:
 * - click a unit: select it (Shift+click toggles into the selection)
 * - drag a box: select every live unit inside
 * - hold the command-menu key (Space): radial opens at the pointer; flick toward
 *   an order and release to issue it to the selected units (or, with the
 *   holdToggles accessibility setting, press once to open and press again to
 *   confirm — no holding required)
 * - 1-4: recall control group; Ctrl+1-4: assign the current selection
 * - the select-all action grabs every live unit
 */

import { h } from "../ui/dom.js";
import { input, type InputRegistry } from "../input/index.js";
import { settings } from "../settings/index.js";
import { createSelection, type SelectionModel } from "./selection.js";
import { createRadialMenu, type RadialMenu } from "./radial.js";
import type { CommandSurface, OrderKind } from "./types.js";

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

function ensureControlGroupActions(registry: InputRegistry): void {
  if (registeredControlGroups.has(registry)) return;
  registeredControlGroups.add(registry);
  for (let n = 1; n <= 4; n++) {
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
  const selection = createSelection();
  const offs: Array<() => void> = [];
  let radial: RadialMenu | null = null;
  let lastPointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  let marquee: HTMLElement | null = null;
  let dragStart: { x: number; y: number } | null = null;

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
          surface.issueOrder({ kind, unitIds, at: Date.now() });
          events.onOrder?.(kind, unitIds);
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

  const onPointerUp = (ev: PointerEvent): void => {
    if (!dragStart || ev.button !== 0) return;
    const start = dragStart;
    dragStart = null;
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
      if (!ev.shiftKey) selection.clear();
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
  for (let n = 1; n <= 4; n++) {
    offs.push(
      registry.on(`battle.controlGroup${n}`, (ev) => {
        if (ev.keyEvent?.ctrlKey || ev.keyEvent?.metaKey) selection.assignGroup(n);
        else {
          selection.recallGroup(n);
          events.onSelect?.();
        }
      }),
    );
  }

  // -- surface events ------------------------------------------------------------
  const overlay = surface.overlay();
  overlay.addEventListener("pointerdown", onPointerDown);
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
  }));

  return {
    selection,
    destroy() {
      for (const off of offs) off();
      overlay.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointermove", beginMarquee);
      window.removeEventListener("pointerup", onPointerUp);
      marquee?.remove();
      closeRadial();
    },
  };
}
