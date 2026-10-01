/**
 * The command radial: hold the menu key, flick toward an order, release to issue.
 *
 * Pointer flow: opening captures the pointer position; moving into a wedge
 * highlights it; `confirm()` (called by the commander on key release, or by a
 * pointer-up) issues the highlighted order. Keyboard flow: arrows move focus
 * between the wedges, Enter issues, Escape cancels. `confirm()` is idempotent —
 * the first of pointer-up / key-release / Enter wins and the rest no-op.
 */

import { h } from "../ui/dom.js";
import { ORDER_LABEL, type OrderKind } from "./types.js";

export interface RadialItem {
  kind: OrderKind;
  hint?: string;
}

export interface RadialOptions {
  items: RadialItem[];
  /** Client coords where the menu opens. */
  x: number;
  y: number;
  onPick: (kind: OrderKind) => void;
  onCancel: () => void;
}

export interface RadialMenu {
  root: HTMLElement;
  highlighted(): OrderKind | null;
  /** Issue the highlighted order (or cancel when nothing is highlighted). */
  confirm(): void;
  cancel(): void;
  destroy(): void;
}

const RADIUS = 104;
const DEAD_ZONE = 26;

function angleOf(dx: number, dy: number): number {
  return ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
}

/** Wedge-center angle for item i of n, starting at the top, clockwise. */
function wedgeAngle(i: number, n: number): number {
  return (((-90 + i * (360 / n)) % 360) + 360) % 360;
}

export function createRadialMenu(options: RadialOptions): RadialMenu {
  const { items, onPick, onCancel } = options;
  const n = items.length;
  let done = false;
  let highlight = -1;

  const root = h("div", {
    class: "radial",
    role: "menu",
    "aria-label": "Issue order",
    "data-testid": "command-radial",
  });
  root.style.left = `${options.x}px`;
  root.style.top = `${options.y}px`;

  const buttons: HTMLButtonElement[] = [];
  for (let i = 0; i < n; i++) {
    const item = items[i]!;
    const a = (wedgeAngle(i, n) * Math.PI) / 180;
    const btn = h(
      "button",
      {
        type: "button",
        class: "radial__item",
        role: "menuitem",
        "data-testid": `radial-${item.kind}`,
        "aria-label": `${ORDER_LABEL[item.kind]}${item.hint ? ` (${item.hint})` : ""}`,
        style: `transform: translate(${Math.cos(a) * RADIUS}px, ${Math.sin(a) * RADIUS}px) translate(-50%, -50%)`,
      },
      ORDER_LABEL[item.kind],
    ) as HTMLButtonElement;
    if (item.hint) btn.appendChild(h("span", { class: "radial__hint" }, item.hint));
    btn.addEventListener("click", () => finish(item.kind));
    root.appendChild(btn);
    buttons.push(btn);
  }
  root.appendChild(h("div", { class: "radial__hub", "aria-hidden": "true" }));

  function setHighlight(i: number): void {
    if (i === highlight) return;
    highlight = i;
    buttons.forEach((b, j) => b.classList.toggle("radial__item--active", j === i));
  }

  function pickAt(clientX: number, clientY: number): void {
    const dx = clientX - options.x;
    const dy = clientY - options.y;
    if (Math.hypot(dx, dy) < DEAD_ZONE) {
      setHighlight(-1);
      return;
    }
    const a = angleOf(dx, dy);
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < n; i++) {
      const w = wedgeAngle(i, n);
      const d = Math.abs(((a - w + 540) % 360) - 180);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    setHighlight(best);
  }

  function finish(kind: OrderKind | null): void {
    if (done) return;
    done = true;
    teardown();
    if (kind) onPick(kind);
    else onCancel();
  }

  const onPointerMove = (ev: PointerEvent): void => pickAt(ev.clientX, ev.clientY);
  const onPointerUp = (ev: PointerEvent): void => {
    pickAt(ev.clientX, ev.clientY);
    finish(highlight >= 0 ? items[highlight]!.kind : null);
  };
  const onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.key === "Escape") {
      ev.stopPropagation();
      finish(null);
      return;
    }
    if (ev.key === "ArrowRight" || ev.key === "ArrowDown") {
      ev.preventDefault();
      ev.stopPropagation();
      const next = (highlight + 1 + n) % n;
      setHighlight(next);
      buttons[next]!.focus();
      return;
    }
    if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") {
      ev.preventDefault();
      ev.stopPropagation();
      const prev = (highlight - 1 + n) % n;
      setHighlight(prev);
      buttons[prev]!.focus();
    }
    // Enter/Space on a focused wedge fire its click handler, which finishes.
  };

  function teardown(): void {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("keydown", onKeyDown, true);
    root.remove();
  }

  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("keydown", onKeyDown, true);

  return {
    root,
    highlighted: () => (highlight >= 0 ? items[highlight]!.kind : null),
    confirm: () => finish(highlight >= 0 ? items[highlight]!.kind : null),
    cancel: () => finish(null),
    destroy: () => {
      if (done) return;
      done = true;
      teardown();
    },
  };
}
