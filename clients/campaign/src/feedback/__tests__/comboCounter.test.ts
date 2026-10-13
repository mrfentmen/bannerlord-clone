/**
 * Task 48: combo counter. Kills in a 10 s window stack into one `×N` badge;
 * a kill older than the window stops counting; enemy kills never count; the
 * badge clears itself; the counter never polls (one timer, and none left
 * running once the window is dry).
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BattleMoment,
  DamageTick,
  FeedbackSource,
  HeroKill,
  ObjectiveMarker,
  ThreatHit,
  TrackedUnit,
  Unsubscribe,
} from "../types.js";
import { COMBO_WINDOW_MS, createComboCounter } from "../comboCounter.js";

type Fn<T> = (e: T) => void;

function fakeSource(): FeedbackSource & { emitKill(k: HeroKill): void } {
  const kills = new Set<Fn<HeroKill>>();
  const noop = <T>(fn: Fn<T>): Unsubscribe => {
    void fn;
    return () => {};
  };
  return {
    onHeroKill: (fn) => {
      kills.add(fn);
      return () => {
        kills.delete(fn);
      };
    },
    onDamage: noop<DamageTick>,
    onThreat: noop<ThreatHit>,
    onMoment: noop<BattleMoment>,
    onPlayerHealth: () => () => {},
    objectives: (): ObjectiveMarker[] => [],
    onObjectivesChanged: noop,
    units: (): TrackedUnit[] => [],
    onUnitsChanged: noop,
    emitKill: (k) => kills.forEach((fn) => fn(k)),
  };
}

const kill = (side: "ally" | "enemy" = "ally"): HeroKill => ({
  killerName: "Ari",
  killerSide: side,
  victimName: "Boss",
  victimSide: side === "ally" ? "enemy" : "ally",
  at: Date.now(),
});

/** The clock: `Date` too, so `Date.now()` and the timers agree. */
function useFakeClock(): void {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
}

function badge(host: HTMLElement): HTMLElement {
  const el = host.querySelector('[data-testid="fb-combo"]');
  if (!(el instanceof HTMLElement)) throw new Error("combo badge missing");
  return el;
}

beforeEach(() => {
  document.body.replaceChildren();
  document.documentElement.removeAttribute("data-reduce-motion");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("combo counter", () => {
  it("stays hidden on one kill, shows ×2 on the second, and counts up", () => {
    useFakeClock();
    const src = fakeSource();
    const combo = createComboCounter(src);
    document.body.append(combo.root);

    src.emitKill(kill());
    expect(badge(combo.root).hidden).toBe(true);

    src.emitKill(kill());
    expect(badge(combo.root).hidden).toBe(false);
    expect(badge(combo.root).textContent).toBe("×2");

    src.emitKill(kill());
    expect(badge(combo.root).textContent).toBe("×3");

    combo.destroy();
  });

  it("drops kills that age out of the 10 s window", () => {
    useFakeClock();
    const src = fakeSource();
    const combo = createComboCounter(src);
    document.body.append(combo.root);

    src.emitKill(kill());
    vi.advanceTimersByTime(6_000);
    src.emitKill(kill());
    expect(badge(combo.root).textContent).toBe("×2");

    // 6 s in, the first kill still counts. 4 s later it is 10 s old: out.
    vi.advanceTimersByTime(3_999);
    expect(badge(combo.root).textContent).toBe("×2");
    vi.advanceTimersByTime(1);
    expect(badge(combo.root).hidden).toBe(true);
    expect(badge(combo.root).textContent).toBe("");

    combo.destroy();
  });

  it("ignores enemy kills", () => {
    useFakeClock();
    const src = fakeSource();
    const combo = createComboCounter(src);
    document.body.append(combo.root);

    src.emitKill(kill("enemy"));
    src.emitKill(kill("enemy"));
    expect(badge(combo.root).hidden).toBe(true);

    combo.destroy();
  });

  it("runs one timer at a time and leaves none behind once the window is dry", () => {
    useFakeClock();
    const src = fakeSource();
    const combo = createComboCounter(src);
    document.body.append(combo.root);

    src.emitKill(kill());
    expect(vi.getTimerCount()).toBe(1);
    src.emitKill(kill());
    expect(vi.getTimerCount()).toBe(1); // re-armed, never stacked

    vi.advanceTimersByTime(COMBO_WINDOW_MS);
    expect(vi.getTimerCount()).toBe(0); // nothing to poll for

    combo.destroy();
  });

  it("destroy unsubscribes and removes the layer", () => {
    useFakeClock();
    const src = fakeSource();
    const combo = createComboCounter(src);
    document.body.append(combo.root);
    combo.destroy();

    expect(combo.root.isConnected).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    src.emitKill(kill()); // no listener: nothing to count, nothing to throw
    expect(document.querySelector('[data-testid="fb-combo"]')).toBeNull();
  });
});
