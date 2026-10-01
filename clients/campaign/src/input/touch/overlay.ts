/**
 * Touch-control overlay for mobile play (MASTER_PLAN task 3).
 *
 * A virtual joystick (left) plus action buttons (right: A = confirm, B =
 * cancel). The joystick implements `StickSource`, so the twin-stick camera
 * driver consumes it exactly like a gamepad stick — no separate camera path.
 * Buttons dispatch through the input registry with source `"touch"`, the same
 * action ids the keyboard and gamepad use.
 *
 * The overlay only builds itself on touch-capable devices and hides behind a
 * `(pointer: coarse)` media query, so desktop is untouched. The stick/button
 * state methods (`stickDown`/`stickMove`/`stickUp`/`tap`) are the seam the DOM
 * handlers call; tests drive them directly instead of synthesising pointer
 * events.
 */

import type { InputActionId } from "../actions.js";
import type { StickSource } from "../gamepad/camera.js";

export interface TouchOverlayOptions {
  container?: HTMLElement;
  /** Dispatch an action id through the input registry. */
  dispatch: (id: InputActionId) => void;
  /** False while input is suspended (keybinding capture, etc.). */
  isEnabled?: () => boolean;
}

export interface TouchOverlay extends StickSource {
  readonly element: HTMLElement;
  stickDown(clientX: number, clientY: number): void;
  stickMove(clientX: number, clientY: number): void;
  stickUp(): void;
  /** Simulate a button tap (A/B). */
  tap(button: "a" | "b"): void;
  dispose(): void;
}

/** Joystick travel radius in px, and the radial deadzone as a fraction. */
export const STICK_TRAVEL_PX = 48;
const STICK_DEADZONE = 0.18;

/**
 * Clamp a raw pointer offset to the stick travel circle and apply the radial
 * deadzone, returning normalised -1..1 axes. Pure, so it is unit-testable.
 */
export function stickVector(
  dx: number,
  dy: number,
  travelPx: number = STICK_TRAVEL_PX,
): { x: number; y: number } {
  const len = Math.hypot(dx, dy);
  const cl = len > travelPx ? travelPx / len : 1;
  const nx = (dx * cl) / travelPx;
  const ny = (dy * cl) / travelPx;
  const mag = Math.hypot(nx, ny);
  if (mag < STICK_DEADZONE) return { x: 0, y: 0 };
  // Rescale so the deadzone edge maps to zero deflection, like the gamepad
  // manager's axis deadzone.
  const s = (mag - STICK_DEADZONE) / (1 - STICK_DEADZONE) / mag;
  return { x: nx * s, y: ny * s };
}

export function isTouchDevice(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return navigator.maxTouchPoints > 0 || "ontouchstart" in window;
}

const BUTTON_ACTIONS = {
  a: "ui.confirm",
  b: "ui.cancel",
} as const satisfies Record<string, InputActionId>;

export function createTouchOverlay(opts: TouchOverlayOptions): TouchOverlay {
  const isEnabled = opts.isEnabled ?? (() => true);
  const container = opts.container ?? document.body;

  const root = document.createElement("div");
  root.className = "touch-overlay";
  root.setAttribute("aria-hidden", "true");

  const base = document.createElement("div");
  base.className = "touch-stick";
  const knob = document.createElement("div");
  knob.className = "touch-stick-knob";
  base.appendChild(knob);

  const buttonsEl = document.createElement("div");
  buttonsEl.className = "touch-buttons";
  const btnA = document.createElement("button");
  btnA.className = "touch-btn touch-btn-a";
  btnA.textContent = "A";
  btnA.setAttribute("aria-label", "Confirm");
  const btnB = document.createElement("button");
  btnB.className = "touch-btn touch-btn-b";
  btnB.textContent = "B";
  btnB.setAttribute("aria-label", "Cancel");
  buttonsEl.append(btnA, btnB);

  root.append(base, buttonsEl);
  container.appendChild(root);

  let stick = { x: 0, y: 0 };
  let tracking = false;
  let origin = { x: 0, y: 0 };
  let pointerId: number | null = null;

  function renderKnob(): void {
    knob.style.transform = `translate(${stick.x * STICK_TRAVEL_PX}px, ${stick.y * STICK_TRAVEL_PX}px)`;
  }

  function tap(button: "a" | "b"): void {
    if (!isEnabled()) return;
    opts.dispatch(BUTTON_ACTIONS[button]);
  }

  function stickDown(clientX: number, clientY: number): void {
    if (!isEnabled()) return;
    const r = base.getBoundingClientRect();
    origin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    tracking = true;
    stickMove(clientX, clientY);
  }

  function stickMove(clientX: number, clientY: number): void {
    if (!tracking || !isEnabled()) return;
    stick = stickVector(clientX - origin.x, clientY - origin.y);
    renderKnob();
  }

  function stickUp(): void {
    tracking = false;
    pointerId = null;
    stick = { x: 0, y: 0 };
    renderKnob();
  }

  // -- DOM wiring -----------------------------------------------------------
  base.addEventListener("pointerdown", (ev) => {
    if (pointerId !== null) return;
    pointerId = ev.pointerId;
    base.setPointerCapture(ev.pointerId);
    stickDown(ev.clientX, ev.clientY);
    ev.preventDefault();
  });
  base.addEventListener("pointermove", (ev) => {
    if (ev.pointerId !== pointerId) return;
    stickMove(ev.clientX, ev.clientY);
    ev.preventDefault();
  });
  const endStick = (ev: PointerEvent): void => {
    if (ev.pointerId !== pointerId) return;
    stickUp();
  };
  base.addEventListener("pointerup", endStick);
  base.addEventListener("pointercancel", endStick);
  base.addEventListener("contextmenu", (ev) => ev.preventDefault());

  const wireButton = (el: HTMLButtonElement, button: "a" | "b"): void => {
    el.addEventListener("pointerdown", (ev) => {
      tap(button);
      ev.preventDefault();
    });
    el.addEventListener("contextmenu", (ev) => ev.preventDefault());
  };
  wireButton(btnA, "a");
  wireButton(btnB, "b");

  return {
    element: root,
    axes: () => [stick.x, stick.y, 0, 0],
    triggers: () => [0, 0],
    stickDown,
    stickMove,
    stickUp,
    tap,
    dispose() {
      root.remove();
    },
  };
}
