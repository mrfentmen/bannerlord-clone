/**
 * Task 36: HUD unit health bars. A bar per living, health-tracked unit, filled
 * to its fraction; dead units and units without health draw nothing; the
 * layer toggles; refresh tracks the camera; destroy cleans up.
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
import { MAX_BARS, createUnitHealthBars } from "../unitHealthBars.js";

type Fn<T> = (e: T) => void;

function fakeSource(initial: TrackedUnit[]): FeedbackSource & { emitUnits(u: TrackedUnit[]): void } {
  let units = initial;
  const watchers = new Set<() => void>();
  const noop = <T>(fn: Fn<T>): Unsubscribe => {
    void fn;
    return () => {};
  };
  return {
    onHeroKill: noop<HeroKill>,
    onDamage: noop<DamageTick>,
    onThreat: noop<ThreatHit>,
    onMoment: noop<BattleMoment>,
    onPlayerHealth: () => () => {},
    objectives: (): ObjectiveMarker[] => [],
    onObjectivesChanged: noop,
    units: () => units,
    onUnitsChanged: (fn) => {
      watchers.add(fn);
      return () => {
        watchers.delete(fn);
      };
    },
    emitUnits: (next) => {
      units = next;
      watchers.forEach((fn) => fn());
    },
  };
}

const projection: FeedbackProjection = {
  fieldToScreen: (x, z) => ({ x: x * 10, y: z * 10 }),
  viewport: () => ({ w: 800, h: 600 }),
};

const unit = (over: Partial<TrackedUnit> & { id: string }): TrackedUnit => ({
  side: "ally",
  x: 1,
  z: 1,
  alive: true,
  hp: 100,
  maxHp: 100,
  ...over,
});

function bars(host: HTMLElement): HTMLElement[] {
  return Array.from(host.querySelectorAll<HTMLElement>('[data-testid="fb-unit-health"]'));
}

function fill(bar: HTMLElement): HTMLElement | null {
  return bar.querySelector<HTMLElement>(".fb-health__fill");
}

beforeEach(() => {
  document.body.replaceChildren();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("unit health bars", () => {
  it("draws one bar per unit, filled to its health fraction, above the unit", () => {
    const src = fakeSource([
      unit({ id: "a", x: 30, z: 45, hp: 25, maxHp: 100 }),
      unit({ id: "b", side: "enemy", x: 10, z: 10, hp: 100, maxHp: 100 }),
    ]);
    const hb = createUnitHealthBars(src, projection);
    document.body.append(hb.root);

    const ally = hb.root.querySelector<HTMLElement>('[data-side="ally"]');
    const enemy = hb.root.querySelector<HTMLElement>('[data-side="enemy"]');
    expect(bars(hb.root)).toHaveLength(2);
    expect(ally?.style.transform).toContain("300.0px");
    expect(ally?.style.transform).toContain("450.0px");
    // jsdom normalises "25.0%" to "25%".
    expect(fill(ally!)?.style.width).toBe("25%");
    expect(ally?.classList.contains("is-hurt")).toBe(true);
    expect(fill(enemy!)?.style.width).toBe("100%");
    expect(enemy?.classList.contains("is-hurt")).toBe(false);

    hb.destroy();
  });

  it("invents nothing: dead units and units without health get no bar", () => {
    const src = fakeSource([
      unit({ id: "alive" }),
      unit({ id: "dead", alive: false }),
      { id: "unknown", side: "enemy", x: 2, z: 2, alive: true },
    ]);
    const hb = createUnitHealthBars(src, projection);
    document.body.append(hb.root);

    expect(bars(hb.root)).toHaveLength(1);

    hb.destroy();
  });

  it("adds and removes bars as units change", () => {
    const src = fakeSource([unit({ id: "a" })]);
    const hb = createUnitHealthBars(src, projection);
    document.body.append(hb.root);
    expect(bars(hb.root)).toHaveLength(1);

    src.emitUnits([unit({ id: "a" }), unit({ id: "b", x: 5 })]);
    expect(bars(hb.root)).toHaveLength(2);

    src.emitUnits([unit({ id: "b", x: 5 })]);
    expect(bars(hb.root)).toHaveLength(1);

    hb.destroy();
  });

  it("keeps the nearest units when more than the cap are on the field", () => {
    const many: TrackedUnit[] = [];
    for (let i = 0; i < MAX_BARS + 10; i++) many.push(unit({ id: `u${i}`, x: i, z: 0 }));
    const src = fakeSource(many);
    const hb = createUnitHealthBars(src, projection);
    document.body.append(hb.root);

    expect(bars(hb.root)).toHaveLength(MAX_BARS);
    // u0 is at the origin and must survive; the far stragglers must not.
    expect(bars(hb.root)[0]?.style.transform).toContain("0.0px");

    hb.destroy();
  });

  it("toggles the whole layer without losing track of the units", () => {
    const src = fakeSource([unit({ id: "a" })]);
    const hb = createUnitHealthBars(src, projection, { enabled: true });
    document.body.append(hb.root);
    expect(hb.root.hidden).toBe(false);

    hb.setEnabled(false);
    expect(hb.enabled()).toBe(false);
    expect(hb.root.hidden).toBe(true);

    hb.setEnabled(true);
    expect(hb.root.hidden).toBe(false);
    expect(bars(hb.root)).toHaveLength(1);

    hb.destroy();
  });

  it("starts hidden when built disabled", () => {
    const src = fakeSource([unit({ id: "a" })]);
    const hb = createUnitHealthBars(src, projection, { enabled: false });
    document.body.append(hb.root);

    expect(hb.enabled()).toBe(false);
    expect(hb.root.hidden).toBe(true);

    hb.destroy();
  });

  it("refresh follows the camera", () => {
    const src = fakeSource([unit({ id: "a", x: 1, z: 1 })]);
    const hb = createUnitHealthBars(src, projection);
    document.body.append(hb.root);

    src.emitUnits([unit({ id: "a", x: 7, z: 0 })]);
    hb.refresh();
    expect(bars(hb.root)[0]?.style.transform).toContain("70.0px");

    hb.destroy();
  });

  it("destroy unsubscribes and removes the layer", () => {
    const src = fakeSource([unit({ id: "a" })]);
    const hb = createUnitHealthBars(src, projection);
    document.body.append(hb.root);
    hb.destroy();

    expect(hb.root.isConnected).toBe(false);
    src.emitUnits([unit({ id: "a" }), unit({ id: "b" })]); // no listener: nothing to draw
    expect(document.querySelectorAll('[data-testid="fb-unit-health"]')).toHaveLength(0);
  });
});
