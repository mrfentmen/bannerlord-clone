import { describe, expect, it, vi } from "vitest";
import { createHaptics, type HapticsSource } from "../haptics.js";

function fakeSource(): HapticsSource & { calls: { d: number | undefined; s: number | undefined; w: number | undefined }[] } {
  const calls: { d: number | undefined; s: number | undefined; w: number | undefined }[] = [];
  return {
    calls,
    rumble: (durationMs, strongMagnitude, weakMagnitude) => {
      calls.push({ d: durationMs, s: strongMagnitude, w: weakMagnitude });
      return Promise.resolve();
    },
  };
}

describe("haptics (task 7)", () => {
  it("plays the named pattern for an order", () => {
    const source = fakeSource();
    const h = createHaptics({ source, isEnabled: () => true });
    h.play("order");
    expect(source.calls).toEqual([{ d: 180, s: 0.7, w: 0.4 }]);
  });

  it("stays silent when disabled or sourceless", () => {
    const source = fakeSource();
    createHaptics({ source, isEnabled: () => false }).play("hit");
    createHaptics({ source: null, isEnabled: () => true }).play("order");
    expect(source.calls).toEqual([]);
  });

  it("throttles rapid hits", () => {
    const source = fakeSource();
    let t = 1000;
    const h = createHaptics({ source, isEnabled: () => true, now: () => t });
    h.play("hit");
    h.play("hit");
    expect(source.calls).toHaveLength(1);
    t += 300;
    h.play("hit");
    expect(source.calls).toHaveLength(2);
  });

  it("does not throttle user-initiated effects", () => {
    const source = fakeSource();
    const h = createHaptics({ source, isEnabled: () => true });
    h.play("order");
    h.play("order");
    expect(source.calls).toHaveLength(2);
  });

  it("plays the error sequence as two pulses", () => {
    const source = fakeSource();
    const timers: Array<() => void> = [];
    const h = createHaptics({
      source,
      isEnabled: () => true,
      setTimeoutFn: (fn) => {
        timers.push(fn);
        return 0;
      },
    });
    h.play("error");
    expect(source.calls).toHaveLength(1);
    expect(timers).toHaveLength(1);
    timers[0]!();
    expect(source.calls).toHaveLength(2);
    expect(source.calls[1]).toEqual({ d: 70, s: 0.5, w: 0.3 });
  });

  it("never throws when rumble rejects", () => {
    const source: HapticsSource = {
      rumble: () => Promise.reject(new Error("no actuator")),
    };
    const h = createHaptics({ source, isEnabled: () => true });
    expect(() => h.play("deploy")).not.toThrow();
  });

  it("uses fake timers cleanly (no stray handles)", () => {
    vi.useFakeTimers();
    try {
      const source = fakeSource();
      const h = createHaptics({ source, isEnabled: () => true });
      h.play("error");
      vi.runAllTimers();
      expect(source.calls).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
