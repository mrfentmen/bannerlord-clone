/**
 * Task 46: hit marker. A damage tick projects to a screen point and drops an
 * `✕` there; crits are marked; each marker retires after its lifetime; the
 * concurrent count is capped; reduced motion keeps the marker and skips the
 * fade-in.
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
import { HIT_MARKER_MS, MAX_HIT_MARKERS, createHitMarker } from "../hitMarker.js";

type Fn<T> = (e: T) => void;

function fakeSource(): FeedbackSource & { emitDamage(d: DamageTick): void } {
  const damage = new Set<Fn<DamageTick>>();
  const noop = <T>(fn: Fn<T>): Unsubscribe => {
    void fn;
    return () => {};
  };
  return {
    onHeroKill: noop<HeroKill>,
    onDamage: (fn) => {
      damage.add(fn);
      return () => {
        damage.delete(fn);
      };
    },
    onThreat: noop<ThreatHit>,
    onMoment: noop<BattleMoment>,
    onPlayerHealth: () => () => {},
    objectives: (): ObjectiveMarker[] => [],
    onObjectivesChanged: noop,
    units: (): TrackedUnit[] => [],
    onUnitsChanged: noop,
    emitDamage: (d) => damage.forEach((fn) => fn(d)),
  };
}

/** Field (x, z) maps to pixels at 10x, so assertions are exact. */
const projection: FeedbackProjection = {
  fieldToScreen: (x, z) => ({ x: x * 10, y: z * 10 }),
  viewport: () => ({ w: 800, h: 600 }),
};

const hit = (over: Partial<DamageTick> = {}): DamageTick => ({
  unitId: "u1",
  amount: 12,
  x: 30,
  z: 45,
  at: Date.now(),
  ...over,
});

/** Queued rAF callbacks, run on demand. */
let rafQueue: FrameRequestCallback[] = [];
function runRaf(): void {
  const q = rafQueue;
  rafQueue = [];
  for (const cb of q) cb(0);
}

function markers(host: HTMLElement): HTMLElement[] {
  return Array.from(host.querySelectorAll<HTMLElement>('[data-testid="fb-hitmarker"]'));
}

beforeEach(() => {
  document.body.replaceChildren();
  document.documentElement.removeAttribute("data-reduce-motion");
  rafQueue = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    rafQueue.push(cb);
    return rafQueue.length;
  });
  // Only the timers are faked: faking rAF would replace the queue above.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.documentElement.removeAttribute("data-reduce-motion");
});

describe("hit marker", () => {
  it("marks a hit at the projected screen point and fades in on the next frame", () => {
    const src = fakeSource();
    const hm = createHitMarker(src, projection);
    document.body.append(hm.root);

    src.emitDamage(hit({ x: 30, z: 45 }));
    const [node] = markers(hm.root);
    expect(markers(hm.root)).toHaveLength(1);
    expect(node?.textContent).toBe("✕");
    expect(node?.style.left).toBe("300px");
    expect(node?.style.top).toBe("450px");
    expect(node?.classList.contains("is-visible")).toBe(false);

    runRaf();
    expect(node?.classList.contains("is-visible")).toBe(true);

    hm.destroy();
  });

  it("flags crits", () => {
    const src = fakeSource();
    const hm = createHitMarker(src, projection);
    document.body.append(hm.root);

    src.emitDamage(hit());
    src.emitDamage(hit({ crit: true }));
    const [plain, crit] = markers(hm.root);
    expect(plain?.getAttribute("data-crit")).toBeNull();
    expect(crit?.getAttribute("data-crit")).toBe("true");

    hm.destroy();
  });

  it("retires each marker after its lifetime", () => {
    const src = fakeSource();
    const hm = createHitMarker(src, projection);
    document.body.append(hm.root);

    src.emitDamage(hit());
    vi.advanceTimersByTime(HIT_MARKER_MS - 1);
    expect(markers(hm.root)).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(markers(hm.root)).toHaveLength(0);

    hm.destroy();
  });

  it("caps simultaneous markers, retiring the oldest first", () => {
    const src = fakeSource();
    const hm = createHitMarker(src, projection);
    document.body.append(hm.root);

    for (let i = 0; i < MAX_HIT_MARKERS + 6; i++) src.emitDamage(hit({ x: i, z: i }));
    const live = markers(hm.root);
    expect(live).toHaveLength(MAX_HIT_MARKERS);
    // The newest survive; the six oldest are gone.
    expect(live[0]?.style.left).toBe("60px");
    expect(live.at(-1)?.style.left).toBe(`${MAX_HIT_MARKERS + 5}0px`);

    hm.destroy();
  });

  it("keeps the mark but skips the fade-in under reduced motion", () => {
    document.documentElement.setAttribute("data-reduce-motion", "");
    const src = fakeSource();
    const hm = createHitMarker(src, projection);
    document.body.append(hm.root);

    src.emitDamage(hit());
    expect(markers(hm.root)).toHaveLength(1);
    expect(rafQueue).toHaveLength(0);

    hm.destroy();
  });

  it("destroy unsubscribes and clears every marker and timer", () => {
    const src = fakeSource();
    const hm = createHitMarker(src, projection);
    document.body.append(hm.root);
    src.emitDamage(hit());
    hm.destroy();

    expect(hm.root.isConnected).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    src.emitDamage(hit()); // no listener: nothing to draw, nothing to throw
    expect(document.querySelectorAll('[data-testid="fb-hitmarker"]')).toHaveLength(0);
  });
});
