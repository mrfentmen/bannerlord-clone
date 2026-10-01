/**
 * Spatial focus navigation for gamepad menu control (MASTER_PLAN task 1).
 *
 * When the d-pad or left stick moves, focus jumps to the nearest focusable
 * element in that direction — the same feel as console UI navigation. Works
 * on plain DOM, so every panel, dialog, and menu is navigable with no mouse.
 */

import type { GamepadDirection } from "./manager.js";

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function isVisible(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return true;
  if (el.hidden || el.getAttribute("aria-hidden") === "true") return false;
  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  if (style && (style.display === "none" || style.visibility === "hidden")) return false;
  return true;
}

export function focusableElements(root: ParentNode = document): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const el of root.querySelectorAll(FOCUSABLE_SELECTOR)) {
    if (!(el instanceof HTMLElement)) continue;
    if (el instanceof HTMLButtonElement && el.disabled) continue;
    if (el instanceof HTMLInputElement && el.disabled) continue;
    if (el instanceof HTMLSelectElement && el.disabled) continue;
    if (el instanceof HTMLTextAreaElement && el.disabled) continue;
    if (!isVisible(el)) continue;
    out.push(el);
  }
  return out;
}

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  cx: number;
  cy: number;
}

function rectOf(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  return {
    left: r.left,
    top: r.top,
    right: r.right,
    bottom: r.bottom,
    cx: r.left + r.width / 2,
    cy: r.top + r.height / 2,
  };
}

function score(from: Rect, to: Rect, dir: GamepadDirection): number | null {
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  let primary: number;
  let secondary: number;
  switch (dir) {
    case "up":
      primary = from.top - to.bottom;
      secondary = Math.abs(dx);
      break;
    case "down":
      primary = to.top - from.bottom;
      secondary = Math.abs(dx);
      break;
    case "left":
      primary = from.left - to.right;
      secondary = Math.abs(dy);
      break;
    case "right":
      primary = to.left - from.right;
      secondary = Math.abs(dy);
      break;
  }
  if (primary <= 0) return null;
  return primary + secondary * 2.5;
}

/**
 * Move DOM focus one step in `direction`. Returns the element focused, or null
 * when nothing was focusable. When nothing is focused yet, focuses the
 * topmost focusable so d-pad input always lands somewhere sensible.
 */
export function moveFocus(
  direction: GamepadDirection,
  root: ParentNode = document,
): HTMLElement | null {
  const candidates = focusableElements(root);
  if (candidates.length === 0) return null;
  const active =
    root instanceof Document
      ? root.activeElement
      : root.ownerDocument?.activeElement ?? null;
  const activeEl = active instanceof HTMLElement && candidates.includes(active) ? active : null;
  if (!activeEl) {
    const first = [...candidates].sort(
      (a, b) => rectOf(a).top - rectOf(b).top || rectOf(a).left - rectOf(b).left,
    )[0]!;
    first.focus();
    return first;
  }
  const from = rectOf(activeEl);
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of candidates) {
    if (el === activeEl) continue;
    const s = score(from, rectOf(el), direction);
    if (s !== null && s < bestScore) {
      bestScore = s;
      best = el;
    }
  }
  if (best) best.focus();
  return best;
}

/** Focus the first focusable element (used when a panel opens under gamepad). */
export function focusFirst(root: ParentNode = document): HTMLElement | null {
  const candidates = focusableElements(root);
  if (candidates.length === 0) return null;
  const first = [...candidates].sort(
    (a, b) => rectOf(a).top - rectOf(b).top || rectOf(a).left - rectOf(b).left,
  )[0]!;
  first.focus();
  return first;
}
