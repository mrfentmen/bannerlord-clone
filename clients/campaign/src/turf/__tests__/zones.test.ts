/**
 * Turf war tests — zone capture, neutralization, countdown, penalties, rotation.
 */
import { describe, expect, it } from "vitest";
import { insidePoly, TurfWar, type TurfEvent, type TurfZoneDef } from "../zones.js";

const DEFS: TurfZoneDef[] = [
  { id: "downtown", poly: [[0, 0], [100, 0], [100, 100], [0, 100]], kind: "centre" },
  { id: "docks", poly: [[200, 0], [300, 0], [300, 100], [200, 100]], kind: "side" },
];

function makeWar() {
  const events: TurfEvent[] = [];
  const war = new TurfWar(DEFS, ["red", "blue"], (e) => events.push(e), { next: () => 0 });
  return { war, events };
}

describe("insidePoly", () => {
  it("detects points inside and outside", () => {
    expect(insidePoly(DEFS[0]!.poly, 50, 50)).toBe(true);
    expect(insidePoly(DEFS[0]!.poly, 150, 50)).toBe(false);
  });
});

describe("TurfWar capture", () => {
  it("takes a zone at 80% coverage", () => {
    const { war, events } = makeWar();
    war.tag("red", 50, 50);
    for (let i = 0; i < 40; i++) war.presence("red", 50, 50, 10, 1);
    war.tick(0.2);
    expect(war.owner("downtown")).toBe("red");
    expect(events.some((e) => e.type === "zone:captured" && e.owner === "red")).toBe(true);
  });

  it("neutralizes a held zone when the rival paints 40%", () => {
    const { war, events } = makeWar();
    for (let i = 0; i < 40; i++) war.presence("red", 50, 50, 10, 1);
    war.tick(0.2);
    expect(war.owner("downtown")).toBe("red");
    // Rival paints: each tag is 0.15, presence adds too.
    for (let i = 0; i < 10; i++) war.tag("blue", 50, 50);
    war.tick(0.2);
    expect(war.coverage("downtown", "blue")).toBeGreaterThanOrEqual(0.4);
    expect(war.owner("downtown")).toBeNull();
    expect(events.some((e) => e.type === "zone:neutralized")).toBe(true);
  });

  it("warns when a rival contests a held zone", () => {
    const { war, events } = makeWar();
    for (let i = 0; i < 40; i++) war.presence("red", 50, 50, 10, 1);
    war.tick(0.2);
    war.presence("blue", 50, 50, 16, 1); // 0.32 share: contest, not neutralize
    war.tick(0.2);
    expect(events.some((e) => e.type === "zone:contest" && e.holder === "red")).toBe(true);
  });

  it("painting over rival coverage removes it", () => {
    const { war } = makeWar();
    for (let i = 0; i < 10; i++) war.tag("blue", 50, 50);
    const before = war.coverage("downtown", "blue");
    expect(before).toBeGreaterThan(0.5);
    for (let i = 0; i < 10; i++) war.tag("red", 50, 50);
    expect(war.coverage("downtown", "blue")).toBeLessThan(before);
  });

  it("coverage outside every zone is ignored", () => {
    const { war } = makeWar();
    war.tag("red", 500, 500);
    war.tick(1);
    expect(war.owner("downtown")).toBeNull();
  });
});

describe("TurfWar countdown and income", () => {
  it("holding the objective counts down and pays income", () => {
    const { war, events } = makeWar();
    for (let i = 0; i < 40; i++) war.presence("red", 50, 50, 10, 1);
    war.tick(0.2);
    const before = war.count("red");
    war.tick(10);
    expect(war.count("red")).toBeLessThan(before);
    const income = events.filter((e) => e.type === "turf:income" && e.team === "red");
    expect(income.length).toBeGreaterThan(0);
    expect(income.reduce((s, e) => s + (e.type === "turf:income" ? e.amount : 0), 0)).toBeGreaterThan(0);
  });

  it("ends the war when a count hits zero", () => {
    const { war, events } = makeWar();
    for (let i = 0; i < 40; i++) war.presence("red", 50, 50, 10, 1);
    war.tick(0.2);
    war.tick(200); // more than enough to count down from 100
    expect(events.some((e) => e.type === "turf:end" && e.winner === "red")).toBe(true);
    // Further ticks are no-ops.
    const n = events.length;
    war.tick(10);
    expect(events.length).toBe(n);
  });

  it("applies a penalty when the objective changes hands", () => {
    const { war, events } = makeWar();
    // Red takes downtown (the operational objective) and holds a while.
    for (let i = 0; i < 40; i++) war.presence("red", 50, 50, 10, 1);
    war.tick(0.2);
    war.tick(20); // red counts down 20
    // Blue neutralizes then takes it.
    for (let i = 0; i < 12; i++) war.tag("blue", 50, 50);
    war.tick(0.2);
    expect(war.owner("downtown")).toBeNull();
    for (let i = 0; i < 40; i++) war.presence("blue", 50, 50, 10, 1);
    war.tick(0.2);
    expect(war.owner("downtown")).toBe("blue");
    const penalty = events.find((e) => e.type === "turf:penalty" && e.team === "red");
    expect(penalty).toBeDefined();
    // round(0.75 * 20) + 1 (started at 100) = 16
    expect((penalty as { penalty: number }).penalty).toBe(16);
  });

  it("rotates the objective between centre and side zones", () => {
    const { war, events } = makeWar();
    expect(war.objectiveZoneId).toBe("downtown");
    war.tick(61); // past rotateMax
    expect(events.some((e) => e.type === "objective:rotated" && e.zone === "docks")).toBe(true);
    expect(war.objectiveZoneId).toBe("docks");
    war.tick(61);
    expect(war.objectiveZoneId).toBe("downtown");
  });
});
