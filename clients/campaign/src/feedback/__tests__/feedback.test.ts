/**
 * Battle feedback suite (MASTER_PLAN 2C, tasks 49-57).
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { settings } from "../../settings/index.js";
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
import { createBattleFeedback } from "../index.js";

type Fn<T> = (e: T) => void;

function fakeSource(): FeedbackSource & {
  emitKill(k: HeroKill): void;
  emitDamage(d: DamageTick): void;
  emitThreat(t: ThreatHit): void;
  emitMoment(m: BattleMoment): void;
  emitHealth(hp: number, max: number): void;
  setObjectives(o: ObjectiveMarker[]): void;
  setUnits(u: TrackedUnit[]): void;
} {
  const kills = new Set<Fn<HeroKill>>();
  const damages = new Set<Fn<DamageTick>>();
  const threats = new Set<Fn<ThreatHit>>();
  const moments = new Set<Fn<BattleMoment>>();
  const healths = new Set<(hp: number, max: number) => void>();
  const objChanged = new Set<() => void>();
  const unitsChanged = new Set<() => void>();
  let objectives: ObjectiveMarker[] = [];
  let units: TrackedUnit[] = [];
  const sub = <T>(s: Set<T>, fn: T): Unsubscribe => {
    s.add(fn);
    return () => {
      s.delete(fn);
    };
  };
  return {
    onHeroKill: (fn) => sub(kills, fn),
    onDamage: (fn) => sub(damages, fn),
    onThreat: (fn) => sub(threats, fn),
    onMoment: (fn) => sub(moments, fn),
    onPlayerHealth: (fn) => sub(healths, fn),
    objectives: () => [...objectives],
    onObjectivesChanged: (fn) => sub(objChanged, fn),
    units: () => [...units],
    onUnitsChanged: (fn) => sub(unitsChanged, fn),
    emitKill: (k) => kills.forEach((fn) => fn(k)),
    emitDamage: (d) => damages.forEach((fn) => fn(d)),
    emitThreat: (t) => threats.forEach((fn) => fn(t)),
    emitMoment: (m) => moments.forEach((fn) => fn(m)),
    emitHealth: (hp, max) => healths.forEach((fn) => fn(hp, max)),
    setObjectives: (o) => {
      objectives = o;
      objChanged.forEach((fn) => fn());
    },
    setUnits: (u) => {
      units = u;
      unitsChanged.forEach((fn) => fn());
    },
  };
}

const projection: FeedbackProjection = {
  fieldToScreen: (x, z) => ({ x, y: z }),
  viewport: () => ({ w: 800, h: 600 }),
};

beforeEach(() => {
  document.body.replaceChildren();
  settings.reset();
});

afterEach(() => {
  document.body.replaceChildren();
  settings.reset();
  vi.unstubAllGlobals();
});

describe("battle feedback (tasks 49-57)", () => {
  it("task 49: hero kills render immediately, capped at 20 rows", () => {
    const src = fakeSource();
    const fb = createBattleFeedback(src, projection);
    document.body.appendChild(fb.root);
    try {
      const t = Date.now();
      src.emitKill({ killerName: "Ari", killerSide: "ally", victimName: "Boss", victimSide: "enemy", at: t });
      const rows = document.querySelectorAll('[data-testid="fb-killfeed"] li');
      expect(rows).toHaveLength(1);
      expect(rows[0]!.textContent).toContain("Ari");
      expect(rows[0]!.textContent).toContain("Boss");
      for (let i = 0; i < 24; i++) {
        src.emitKill({ killerName: `K${i}`, killerSide: "ally", victimName: `V${i}`, victimSide: "enemy", at: t });
      }
      expect(document.querySelectorAll('[data-testid="fb-killfeed"] li')).toHaveLength(20);
      // Newest first.
      expect(document.querySelector('[data-testid="fb-killfeed"] li')!.textContent).toContain("K23");
    } finally {
      fb.destroy();
    }
  });

  it("task 50: battle log timestamps moments and exports as text", () => {
    const src = fakeSource();
    const fb = createBattleFeedback(src, projection);
    document.body.appendChild(fb.root);
    try {
      const t = new Date(2026, 9, 1, 12, 3, 7).getTime();
      src.emitMoment({ kind: "charge", text: "Cavalry charges the flank", at: t });
      src.emitMoment({ kind: "heroDown", text: "Ari is down", at: t + 1000 });
      const rows = document.querySelectorAll('[data-testid="fb-battlelog"] li');
      expect(rows).toHaveLength(2);
      expect(rows[0]!.textContent).toMatch(/\[03:07\]/);
      const text = fb.exportLog();
      expect(text).toContain("charge: Cavalry charges the flank");
      expect(text).toContain("heroDown: Ari is down");
      expect(text.split("\n")).toHaveLength(2);
    } finally {
      fb.destroy();
    }
  });

  it("task 51: damage numbers are pooled and toggleable", () => {
    const src = fakeSource();
    const fb = createBattleFeedback(src, projection);
    document.body.appendChild(fb.root);
    try {
      expect(fb.damageNumbers.poolSize()).toBe(200);
      const t = Date.now();
      for (let i = 0; i < 200; i++) {
        src.emitDamage({ unitId: "a", amount: 10 + i, x: i, z: i, at: t });
      }
      // Pool never grows: still 200 nodes in the DOM.
      expect(document.querySelectorAll(".fb-damage")).toHaveLength(200);
      // Overflow recycles the oldest instead of allocating.
      src.emitDamage({ unitId: "a", amount: 9999, x: 1, z: 1, at: t });
      expect(document.querySelectorAll(".fb-damage")).toHaveLength(200);

      settings.set({ floatingDamageNumbers: false });
      const before = [...document.querySelectorAll(".fb-damage")].filter(
        (el) => !(el as HTMLElement).hidden,
      ).length;
      src.emitDamage({ unitId: "a", amount: 5, x: 2, z: 2, at: t });
      const after = [...document.querySelectorAll(".fb-damage")].filter(
        (el) => !(el as HTMLElement).hidden,
      ).length;
      expect(after).toBe(before);
    } finally {
      fb.destroy();
    }
  });

  it("task 52: the direction arc points at the attacker", () => {
    const src = fakeSource();
    const fb = createBattleFeedback(src, projection);
    document.body.appendChild(fb.root);
    try {
      // Hit at (400,300); attacker due east at (500,300) -> angle 90deg.
      src.emitDamage({ unitId: "a", amount: 10, x: 400, z: 300, fromX: 500, fromZ: 300, at: Date.now() });
      const arc = document.querySelector(".fb-direction-arc") as HTMLElement;
      expect(arc).not.toBeNull();
      expect(arc.style.getPropertyValue("--hit-angle")).toBe("90.0deg");
      // No attacker data -> no arc; nothing invented.
      src.emitDamage({ unitId: "a", amount: 10, x: 100, z: 100, at: Date.now() });
      expect(document.querySelectorAll(".fb-direction-arc")).toHaveLength(1);
    } finally {
      fb.destroy();
    }
  });

  it("task 53: rear attacks flash the correct screen edge", () => {
    const src = fakeSource();
    const fb = createBattleFeedback(src, projection);
    document.body.appendChild(fb.root);
    try {
      src.setUnits([{ id: "a", side: "ally", x: 400, z: 300, alive: true }]);
      // Attacker to the east of the victim -> right edge, rear -> brighter.
      src.emitThreat({ unitId: "a", fromX: 700, fromZ: 300, rear: true, at: Date.now() });
      const flash = document.querySelector(".fb-threat-edge") as HTMLElement;
      expect(flash).not.toBeNull();
      expect(flash.classList.contains("is-right")).toBe(true);
      expect(flash.classList.contains("is-rear")).toBe(true);
      // Unknown unit -> no flash.
      src.emitThreat({ unitId: "ghost", fromX: 700, fromZ: 300, rear: false, at: Date.now() });
      expect(document.querySelectorAll(".fb-threat-edge")).toHaveLength(1);
    } finally {
      fb.destroy();
    }
  });

  it("task 54: objective markers project and track the camera", () => {
    const src = fakeSource();
    const fb = createBattleFeedback(src, projection);
    document.body.appendChild(fb.root);
    try {
      src.setObjectives([{ id: "o1", label: "Mill", x: 400, z: 300, kind: "capture" }]);
      const el = document.querySelector('[data-testid="fb-objective"]') as HTMLElement;
      expect(el).not.toBeNull();
      expect(el.textContent).toContain("Mill");
      expect(el.style.transform).toContain("translate(400.0px, 300.0px)");
      // Markers are DOM overlays: no depth test, no fog — always on top.
      expect(getComputedStyle(el).display).not.toBe("none");
    } finally {
      fb.destroy();
    }
  });

  it("task 55: offscreen units get edge arrows pointing at them, 360°", () => {
    const src = fakeSource();
    const fb = createBattleFeedback(src, projection);
    document.body.appendChild(fb.root);
    try {
      src.setUnits([
        { id: "east", side: "enemy", x: 1200, z: 300, alive: true }, // offscreen right
        { id: "home", side: "ally", x: 400, z: 300, alive: true }, // onscreen
      ]);
      const east = document.querySelector('[data-unit="east"]') as HTMLElement;
      const home = document.querySelector('[data-unit="home"]') as HTMLElement;
      expect((east as HTMLElement).hidden).toBe(false);
      expect(east.style.transform).toContain("rotate(0.0deg)"); // pointing east
      expect(home.hidden).toBe(true);
      // Dead units get no arrow.
      src.setUnits([{ id: "dead", side: "enemy", x: 1200, z: 300, alive: false }]);
      expect(document.querySelector('[data-unit="dead"]')).toBeNull();
    } finally {
      fb.destroy();
    }
  });

  it("task 56: the vignette scales with missing health", () => {
    const src = fakeSource();
    const fb = createBattleFeedback(src, projection);
    document.body.appendChild(fb.root);
    try {
      const veil = document.querySelector('[data-testid="fb-vignette"]') as HTMLElement;
      src.emitHealth(100, 100);
      expect(veil.hidden).toBe(true);
      src.emitHealth(80, 100);
      expect(veil.hidden).toBe(true); // only the last 40% matters
      src.emitHealth(20, 100);
      expect(veil.hidden).toBe(false);
      expect(veil.style.getPropertyValue("--vignette-strength")).toBe("0.50");
      src.emitHealth(0, 100);
      expect(veil.style.getPropertyValue("--vignette-strength")).toBe("1.00");
    } finally {
      fb.destroy();
    }
  });

  it("task 57: hit-stop fires on heavy hits; reduceMotion forces both off", () => {
    const src = fakeSource();
    const shakeTarget = document.createElement("div");
    document.body.appendChild(shakeTarget);
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const fb = createBattleFeedback(src, projection, { shakeTarget });
    document.body.appendChild(fb.root);
    try {
      const stops: number[] = [];
      fb.impact.onHitStopRequest((ms) => stops.push(ms));
      // Light hit: nothing.
      src.emitDamage({ unitId: "a", amount: 5, x: 1, z: 1, at: Date.now() });
      expect(stops).toHaveLength(0);
      // Heavy hit: hit-stop request + shake transform.
      src.emitDamage({ unitId: "a", amount: 50, x: 1, z: 1, heavy: true, at: Date.now() });
      expect(stops).toEqual([90]);
      expect(frames.length).toBeGreaterThan(0);
      frames.splice(0).forEach((cb) => cb(performance.now()));
      expect(shakeTarget.style.transform).toContain("translate(");
      // Run the shake to completion.
      for (let i = 0; i < 40 && shakeTarget.style.transform !== ""; i++) {
        frames.splice(0).forEach((cb) => cb(performance.now() + i * 20));
      }
      expect(shakeTarget.style.transform).toBe("");

      // Reduce motion forces both off.
      settings.set({ reduceMotion: true });
      src.emitDamage({ unitId: "a", amount: 50, x: 1, z: 1, heavy: true, at: Date.now() });
      expect(stops).toHaveLength(1);
      expect(shakeTarget.style.transform).toBe("");
    } finally {
      fb.destroy();
      vi.unstubAllGlobals();
    }
  });

  it("task 57: the individual toggles disable their own effect", () => {
    const src = fakeSource();
    const shakeTarget = document.createElement("div");
    document.body.appendChild(shakeTarget);
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const fb = createBattleFeedback(src, projection, { shakeTarget });
    document.body.appendChild(fb.root);
    try {
      const stops: number[] = [];
      fb.impact.onHitStopRequest((ms) => stops.push(ms));
      settings.set({ hitStop: false, screenShake: false });
      src.emitDamage({ unitId: "a", amount: 50, x: 1, z: 1, heavy: true, at: Date.now() });
      expect(stops).toHaveLength(0);
      expect(shakeTarget.style.transform).toBe("");
    } finally {
      fb.destroy();
      vi.unstubAllGlobals();
    }
  });

  it("destroy() removes every layer and stops the frame loop", () => {
    const src = fakeSource();
    const cancels: number[] = [];
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      cancels.push(id);
    });
    const fb = createBattleFeedback(src, projection);
    document.body.appendChild(fb.root);
    fb.destroy();
    expect(document.querySelector('[data-testid="fb-root"]')).toBeNull();
    expect(cancels.length).toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });
});
