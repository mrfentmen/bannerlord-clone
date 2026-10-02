/**
 * Task 47: kill confirm. Ally-side hero kills pop a skull; enemy-side kills
 * do not; one element is re-triggered rather than stacked; it clears itself
 * after the window; reduced motion keeps the skull and drops the pop.
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
import { KILL_CONFIRM_MS, createKillConfirm } from "../killConfirm.js";

type Fn<T> = (e: T) => void;

function fakeSource(): FeedbackSource & { emitKill(k: HeroKill): void } {
  const kills = new Set<Fn<HeroKill>>();
  const noop = <T>(fn: Fn<T>): Unsubscribe => {
    void fn;
    return () => {};
  };
  const noObjectives = (): ObjectiveMarker[] => [];
  const noUnits = (): TrackedUnit[] => [];
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
    onPlayerHealth: (fn) => {
      void fn;
      return () => {};
    },
    objectives: noObjectives,
    onObjectivesChanged: noop,
    units: noUnits,
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

/** Queued rAF callbacks so the pop class is applied only when the test runs them. */
let rafQueue: FrameRequestCallback[] = [];
function runRaf(): void {
  const q = rafQueue;
  rafQueue = [];
  for (const cb of q) cb(0);
}

/**
 * Fake clock for the confirm window. Only the timers are faked: sinon's
 * default set includes `requestAnimationFrame`, and faking it would replace
 * the queued stub above, so the component's pop would never be observable.
 */
function useFakeClock(): void {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
}

beforeEach(() => {
  document.body.replaceChildren();
  document.documentElement.removeAttribute("data-reduce-motion");
  rafQueue = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    rafQueue.push(cb);
    return rafQueue.length;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.documentElement.removeAttribute("data-reduce-motion");
});

describe("kill confirm", () => {
  it("pops a skull on an ally kill and clears itself after the window", () => {
    useFakeClock();
    const src = fakeSource();
    const kc = createKillConfirm(src);
    document.body.append(kc.root);

    src.emitKill(kill("ally"));
    const node = kc.root.querySelector(".fb-killconfirm") as HTMLElement;
    expect(node).not.toBeNull();
    expect(node.textContent).toBe("☠");

    runRaf();
    expect(node.classList.contains("is-pop")).toBe(true);

    vi.advanceTimersByTime(KILL_CONFIRM_MS);
    expect(kc.root.querySelector(".fb-killconfirm")).toBeNull();
    kc.destroy();
  });

  it("ignores enemy-side kills", () => {
    const src = fakeSource();
    const kc = createKillConfirm(src);
    document.body.append(kc.root);

    src.emitKill(kill("enemy"));
    expect(kc.root.querySelector(".fb-killconfirm")).toBeNull();
    kc.destroy();
  });

  it("re-triggers a single element instead of stacking, and extends the window", () => {
    useFakeClock();
    const src = fakeSource();
    const kc = createKillConfirm(src);
    document.body.append(kc.root);

    src.emitKill(kill("ally"));
    vi.advanceTimersByTime(500);
    src.emitKill(kill("ally"));
    expect(kc.root.querySelectorAll(".fb-killconfirm")).toHaveLength(1);

    // 500 ms after the second kill the skull is still up (its own window restarted).
    vi.advanceTimersByTime(500);
    expect(kc.root.querySelectorAll(".fb-killconfirm")).toHaveLength(1);

    vi.advanceTimersByTime(200);
    expect(kc.root.querySelector(".fb-killconfirm")).toBeNull();
    kc.destroy();
  });

  it("keeps the skull but skips the pop under reduced motion", () => {
    useFakeClock();
    document.documentElement.setAttribute("data-reduce-motion", "");
    const src = fakeSource();
    const kc = createKillConfirm(src);
    document.body.append(kc.root);

    src.emitKill(kill("ally"));
    const node = kc.root.querySelector(".fb-killconfirm") as HTMLElement;
    expect(node).not.toBeNull();
    expect(rafQueue).toHaveLength(0);
    expect(node.classList.contains("is-pop")).toBe(false);
    kc.destroy();
  });

  it("destroy unsubscribes and removes the layer", () => {
    const src = fakeSource();
    const kc = createKillConfirm(src);
    document.body.append(kc.root);
    kc.destroy();

    expect(kc.root.isConnected).toBe(false);
    src.emitKill(kill("ally")); // no listener: nothing to pop, nothing to throw
    expect(document.querySelector(".fb-killconfirm")).toBeNull();
  });
});
