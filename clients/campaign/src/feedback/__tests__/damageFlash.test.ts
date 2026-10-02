/**
 * MASTER_PLAN task 150: damage vignette + low-health effects, toggleable.
 * Damage flash fires on player damage; the `damageVignetteEnabled` toggle
 * gates it and the low-health vignette together; both respect reduced motion.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BattleMoment,
  DamageTick,
  FeedbackProjection,
  FeedbackSource,
  HeroKill,
  ObjectiveMarker,
  ThreatHit,
  TrackedUnit,
  Unsubscribe,
} from "../types.js";
import { createDamageFlash } from "../damageFlash.js";
import { createBattleFeedback } from "../index.js";
import { createFlashGate, listFlashSources } from "../photosensitive.js";

type Fn<T> = (e: T) => void;

function fakeSource(): FeedbackSource & {
  emitHealth(hp: number, max: number): void;
} {
  const healths = new Set<(hp: number, max: number) => void>();
  const noop = <T>(fn: Fn<T>): Unsubscribe => {
    void fn;
    return () => {};
  };
  const noObjectives = (): ObjectiveMarker[] => [];
  const noUnits = (): TrackedUnit[] => [];
  return {
    onHeroKill: noop<HeroKill>,
    onDamage: noop<DamageTick>,
    onThreat: noop<ThreatHit>,
    onMoment: noop<BattleMoment>,
    onPlayerHealth: (fn) => {
      healths.add(fn);
      return () => {
        healths.delete(fn);
      };
    },
    objectives: noObjectives,
    onObjectivesChanged: noop,
    units: noUnits,
    onUnitsChanged: noop,
    emitHealth: (hp, max) => healths.forEach((fn) => fn(hp, max)),
  };
}

const projection: FeedbackProjection = {
  fieldToScreen: (x, z) => ({ x, y: z }),
  viewport: () => ({ w: 800, h: 600 }),
};

/** Manual-clock gate so flash timing is deterministic in tests. */
function manualGate() {
  let t = 0;
  const gate = createFlashGate({ now: () => t });
  return { gate, advance: (ms: number) => (t += ms) };
}

const flashes = (root: HTMLElement) => root.querySelectorAll(".fb-damage-flash").length;

/** Queued rAF callbacks: the battle feedback hub runs a frame loop, so the
 *  stub must queue (not invoke) to avoid infinite synchronous recursion. */
let rafQueue: FrameRequestCallback[] = [];
function runRaf(): void {
  const q = rafQueue;
  rafQueue = [];
  for (const cb of q) cb(0);
}

beforeEach(() => {
  document.body.replaceChildren();
  document.documentElement.removeAttribute("data-reduce-motion");
  rafQueue = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    rafQueue.push(cb);
    return rafQueue.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.documentElement.removeAttribute("data-reduce-motion");
});

describe("damage flash", () => {
  it("fires once per damaging hit, brightness scaling with the hit", () => {
    const { gate } = manualGate();
    const source = fakeSource();
    const df = createDamageFlash(source, { gate });
    document.body.append(df.root);

    source.emitHealth(100, 100); // baseline report: no flash
    expect(flashes(df.root)).toBe(0);

    source.emitHealth(70, 100); // 30% of max lost
    expect(flashes(df.root)).toBe(1);
    const flash = df.root.querySelector(".fb-damage-flash") as HTMLElement;
    expect(flash.style.getPropertyValue("--flash-strength")).toBe((0.3 + 0.7 * 0.3).toFixed(2));
    df.destroy();
  });

  it("ignores the first report and heals", () => {
    const { gate } = manualGate();
    const source = fakeSource();
    const df = createDamageFlash(source, { gate });
    document.body.append(df.root);

    source.emitHealth(50, 100); // first report: establishes the baseline
    expect(flashes(df.root)).toBe(0);
    source.emitHealth(80, 100); // heal: no flash
    expect(flashes(df.root)).toBe(0);
    source.emitHealth(80, 100); // unchanged: no flash
    expect(flashes(df.root)).toBe(0);
    df.destroy();
  });

  it("coalesces burst damage through the flash gate (never strobes)", () => {
    const { gate, advance } = manualGate();
    const source = fakeSource();
    const df = createDamageFlash(source, { gate });
    document.body.append(df.root);

    source.emitHealth(100, 100);
    source.emitHealth(90, 100);
    expect(flashes(df.root)).toBe(1);
    advance(100); // inside the 1/3 s gate window
    source.emitHealth(80, 100);
    expect(flashes(df.root)).toBe(1);
    advance(400); // gate window passed
    source.emitHealth(70, 100);
    expect(flashes(df.root)).toBe(2);
    df.destroy();
  });

  it("never flashes under reduced motion (task 150 accept)", () => {
    const { gate } = manualGate();
    const source = fakeSource();
    const df = createDamageFlash(source, { gate });
    document.body.append(df.root);

    document.documentElement.setAttribute("data-reduce-motion", "");
    source.emitHealth(100, 100);
    source.emitHealth(10, 100); // massive hit: still no flash
    expect(flashes(df.root)).toBe(0);
    df.destroy();
  });

  it("enabled:false subscribes to nothing and never flashes", () => {
    const { gate } = manualGate();
    const source = fakeSource();
    const df = createDamageFlash(source, { enabled: false, gate });
    document.body.append(df.root);

    source.emitHealth(100, 100);
    source.emitHealth(5, 100);
    expect(flashes(df.root)).toBe(0);
    expect(df.root.isConnected).toBe(true);
    df.destroy();
    expect(df.root.isConnected).toBe(false);
  });

  it("removes the flash node after the fade", () => {
    vi.useFakeTimers();
    // useFakeTimers installs its own rAF fake; restore the queueing stub.
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    const { gate } = manualGate();
    const source = fakeSource();
    const df = createDamageFlash(source, { gate });
    document.body.append(df.root);

    source.emitHealth(100, 100);
    source.emitHealth(70, 100);
    expect(flashes(df.root)).toBe(1);
    runRaf(); // the flash's rAF applies .is-visible
    expect(df.root.querySelector(".fb-damage-flash.is-visible")).not.toBeNull();
    vi.advanceTimersByTime(400);
    expect(flashes(df.root)).toBe(0);
    df.destroy();
  });

  it("registers a flash profile capped under the 3 Hz limit", () => {
    const source = fakeSource();
    const df = createDamageFlash(source);
    const profile = listFlashSources().find((p) => p.id === "fb-damage-flash");
    expect(profile).toBeDefined();
    expect(profile!.maxRateHz).toBeLessThanOrEqual(3);
    df.destroy();
    expect(listFlashSources().some((p) => p.id === "fb-damage-flash")).toBe(false);
  });
});

describe("damageVignette toggle on the battle feedback hub", () => {
  it("damageVignette:false disables both the flash and the low-health vignette", () => {
    let now = 1_000_000;
    const spy = vi.spyOn(performance, "now").mockImplementation(() => now);
    try {
      const source = fakeSource();
      const fb = createBattleFeedback(source, projection, { damageVignette: false });
      document.body.append(fb.root);

      source.emitHealth(100, 100);
      now += 1000;
      source.emitHealth(60, 100); // damage: no flash
      expect(document.querySelectorAll(".fb-damage-flash").length).toBe(0);
      now += 1000;
      source.emitHealth(20, 100); // near death: vignette stays hidden
      const veil = document.querySelector('[data-testid="fb-vignette"]') as HTMLElement;
      expect(veil.hidden).toBe(true);
      fb.destroy();
    } finally {
      spy.mockRestore();
    }
  });

  it("default keeps both the flash and the low-health vignette", () => {
    let now = 2_000_000;
    const spy = vi.spyOn(performance, "now").mockImplementation(() => now);
    try {
      const source = fakeSource();
      const fb = createBattleFeedback(source, projection);
      document.body.append(fb.root);

      source.emitHealth(100, 100);
      now += 1000;
      source.emitHealth(60, 100); // damage: flash fires
      expect(document.querySelectorAll(".fb-damage-flash").length).toBe(1);
      now += 1000;
      source.emitHealth(20, 100); // near death: vignette shows
      const veil = document.querySelector('[data-testid="fb-vignette"]') as HTMLElement;
      expect(veil.hidden).toBe(false);
      fb.destroy();
    } finally {
      spy.mockRestore();
    }
  });
});
