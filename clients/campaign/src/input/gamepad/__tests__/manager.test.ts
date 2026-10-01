import { describe, expect, it, vi } from "vitest";
import {
  createGamepadManager,
  GAMEPAD_BUTTON,
  type PadSnapshot,
} from "../manager.js";

function makePad(overrides: Partial<PadSnapshot> = {}): PadSnapshot {
  return {
    index: 0,
    id: "Test Controller (Vendor: 1234)",
    connected: true,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    axes: [0, 0, 0, 0],
    ...overrides,
  };
}

function press(pad: PadSnapshot, button: number): PadSnapshot {
  const buttons = pad.buttons.map((b, i) =>
    i === button ? { pressed: true, value: 1 } : b,
  );
  return { ...pad, buttons };
}

describe("gamepad manager (task 1)", () => {
  it("reports status changes on connect/disconnect", () => {
    let current: PadSnapshot | null = null;
    const statuses: string[] = [];
    const mgr = createGamepadManager({
      getPads: () => (current ? [current] : []),
      onStatusChange: (s) => statuses.push(`${s.connected}:${s.label}`),
    });
    mgr.poll();
    expect(mgr.status().connected).toBe(false);
    current = makePad();
    mgr.poll();
    expect(mgr.status().connected).toBe(true);
    expect(mgr.status().label).toBe("Test Controller");
    current = null;
    mgr.poll();
    expect(mgr.status().connected).toBe(false);
    expect(statuses).toEqual([
      "false:null",
      "true:Test Controller",
      "false:null",
    ]);
  });

  it("edge-detects buttons: press fires once, release fires once", () => {
    let current: PadSnapshot = makePad();
    const events: string[] = [];
    const mgr = createGamepadManager({
      getPads: () => [current],
      onButton: (i, pressed) => events.push(`${i}:${pressed}`),
    });
    mgr.poll();
    current = press(current, GAMEPAD_BUTTON.A);
    mgr.poll();
    mgr.poll(); // held: no repeat
    current = makePad();
    mgr.poll();
    expect(events).toEqual(["0:true", "0:false"]);
  });

  it("routes dpad to navigation, not to button events", () => {
    let current: PadSnapshot = makePad();
    const navs: string[] = [];
    const buttons: number[] = [];
    const mgr = createGamepadManager({
      getPads: () => [current],
      onNavigate: (dir) => navs.push(dir),
      onButton: (i, pressed) => {
        if (pressed) buttons.push(i);
      },
    });
    current = press(current, GAMEPAD_BUTTON.DPAD_DOWN);
    mgr.poll(0);
    expect(navs).toEqual(["down"]);
    expect(buttons).toEqual([]);
  });

  it("repeats held dpad after the delay, then on the interval", () => {
    let current = press(makePad(), GAMEPAD_BUTTON.DPAD_RIGHT);
    let navCount = 0;
    const mgr = createGamepadManager({
      getPads: () => [current],
      onNavigate: () => navCount++,
      repeatDelayMs: 400,
      repeatIntervalMs: 180,
    });
    mgr.poll(0); // initial
    mgr.poll(399);
    expect(navCount).toBe(1);
    mgr.poll(400); // delay elapsed -> repeat
    expect(navCount).toBe(2);
    mgr.poll(500);
    expect(navCount).toBe(2);
    mgr.poll(580); // interval elapsed -> repeat
    expect(navCount).toBe(3);
    // release clears the repeat state
    current = makePad();
    mgr.poll(1000);
    current = press(current, GAMEPAD_BUTTON.DPAD_RIGHT);
    mgr.poll(1100);
    expect(navCount).toBe(4);
  });

  it("treats a left-stick flick as navigation", () => {
    let current = makePad({ axes: [0.8, 0, 0, 0] });
    const navs: string[] = [];
    const mgr = createGamepadManager({
      getPads: () => [current],
      onNavigate: (d) => navs.push(d),
    });
    mgr.poll(0);
    expect(navs).toEqual(["right"]);
    // small deflection stays inside the stick gate
    current = makePad({ axes: [0.3, 0, 0, 0] });
    mgr.poll(1000);
    expect(navs).toEqual(["right"]);
  });

  it("does nothing while disabled", () => {
    const current = press(makePad(), GAMEPAD_BUTTON.A);
    const onButton = vi.fn();
    const onNavigate = vi.fn();
    const mgr = createGamepadManager({
      getPads: () => [current],
      isEnabled: () => false,
      onButton,
      onNavigate,
    });
    mgr.poll();
    expect(onButton).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("applies the deadzone to axes", () => {
    const mgr = createGamepadManager({
      getPads: () => [makePad({ axes: [0.1, -0.1, 0.5, -0.6] })],
      deadzone: 0.15,
    });
    const [lx, ly, rx, ry] = mgr.axes();
    expect(lx).toBe(0);
    expect(ly).toBe(0);
    expect(rx).toBeGreaterThan(0);
    expect(ry).toBeLessThan(0);
    expect(rx).toBeCloseTo((0.5 - 0.15) / 0.85, 5);
  });

  it("rumble no-ops without an actuator and calls playEffect with one", async () => {
    const plain = createGamepadManager({ getPads: () => [makePad()] });
    await expect(plain.rumble()).resolves.toBeUndefined();

    const playEffect = vi.fn().mockResolvedValue(undefined);
    const withActuator = createGamepadManager({
      getPads: () => [makePad({ vibrationActuator: { playEffect } })],
    });
    await withActuator.rumble(200, 1, 0.5);
    expect(playEffect).toHaveBeenCalledWith("dual-rumble", {
      duration: 200,
      strongMagnitude: 1,
      weakMagnitude: 0.5,
    });
  });

  it("rumble swallows actuator rejections", async () => {
    const mgr = createGamepadManager({
      getPads: () => [
        makePad({
          vibrationActuator: { playEffect: () => Promise.reject(new Error("nope")) },
        }),
      ],
    });
    await expect(mgr.rumble()).resolves.toBeUndefined();
  });

  it("cleans up edge state for disconnected pads", () => {
    let pads: PadSnapshot[] = [press(makePad(), GAMEPAD_BUTTON.A)];
    const events: string[] = [];
    const mgr = createGamepadManager({
      getPads: () => pads,
      onButton: (i, pressed) => events.push(`${i}:${pressed}`),
    });
    mgr.poll();
    pads = [];
    mgr.poll();
    // reconnect: the button reads as newly pressed, not a stale release
    pads = [press(makePad(), GAMEPAD_BUTTON.A)];
    mgr.poll();
    expect(events).toEqual(["0:true", "0:true"]);
  });
});
