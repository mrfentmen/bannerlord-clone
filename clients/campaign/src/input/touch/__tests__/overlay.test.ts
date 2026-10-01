/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
  createTouchOverlay,
  isTouchDevice,
  stickVector,
  STICK_TRAVEL_PX,
  type TouchOverlay,
} from "../overlay.js";
import type { InputActionId } from "../../actions.js";

describe("stickVector", () => {
  it("returns zero inside the deadzone", () => {
    expect(stickVector(2, 1)).toEqual({ x: 0, y: 0 });
  });

  it("clamps to the travel circle", () => {
    const v = stickVector(STICK_TRAVEL_PX * 3, 0);
    expect(v.x).toBeCloseTo(1, 6);
    expect(v.y).toBe(0);
  });

  it("rescales the deadzone edge to zero", () => {
    // Just outside the deadzone: small but nonzero deflection.
    const v = stickVector(STICK_TRAVEL_PX * 0.2, 0);
    expect(v.x).toBeGreaterThan(0);
    expect(v.x).toBeLessThan(0.05);
  });

  it("passes through a diagonal without distortion", () => {
    const v = stickVector(30, 30);
    expect(v.x).toBeCloseTo(v.y, 9);
    expect(Math.hypot(v.x, v.y)).toBeLessThanOrEqual(1);
  });
});

describe("touch overlay (task 3)", () => {
  let dispatched: InputActionId[];
  let overlay: TouchOverlay;

  beforeEach(() => {
    document.body.innerHTML = "";
    dispatched = [];
    overlay = createTouchOverlay({ dispatch: (id) => dispatched.push(id) });
    document.body.appendChild(overlay.element);
  });

  it("builds regardless of the environment's touch capability", () => {
    expect(typeof isTouchDevice()).toBe("boolean");
    expect(overlay.element.isConnected).toBe(true);
  });

  it("drives the stick axes and recentres on release", () => {
    // jsdom has no layout; stub the base rect so the origin is known.
    const base = overlay.element.querySelector(".touch-stick") as HTMLElement;
    base.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 132, height: 132 }) as DOMRect;

    overlay.stickDown(66, 66 - STICK_TRAVEL_PX); // straight up
    const [lx, ly, rx, ry] = overlay.axes();
    expect(lx).toBeCloseTo(0, 6);
    expect(ly).toBeCloseTo(-1, 6);
    expect([rx, ry]).toEqual([0, 0]);

    overlay.stickMove(66, 66); // back to centre
    expect(overlay.axes()[0]).toBe(0);
    expect(overlay.axes()[1]).toBe(0);

    overlay.stickUp();
    expect(overlay.axes()).toEqual([0, 0, 0, 0]);
    expect(overlay.triggers()).toEqual([0, 0]);
  });

  it("dispatches ui.confirm / ui.cancel from the A/B buttons", () => {
    overlay.tap("a");
    overlay.tap("b");
    expect(dispatched).toEqual(["ui.confirm", "ui.cancel"]);
  });

  it("stays silent while input is disabled", () => {
    const quiet = createTouchOverlay({
      dispatch: (id) => dispatched.push(id),
      isEnabled: () => false,
    });
    quiet.tap("a");
    quiet.stickDown(10, 10);
    expect(dispatched).toEqual([]);
    expect(quiet.axes()).toEqual([0, 0, 0, 0]);
    quiet.dispose();
  });

  it("builds the expected DOM", () => {
    expect(overlay.element.querySelector(".touch-stick-knob")).not.toBeNull();
    expect(overlay.element.querySelector(".touch-btn-a")?.textContent).toBe("A");
    expect(overlay.element.querySelector(".touch-btn-b")?.textContent).toBe("B");
  });
});
