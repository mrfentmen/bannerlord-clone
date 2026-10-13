/**
 * WantedMachine tests — the pure state machine, no engine.
 */
import { describe, expect, it } from "vitest";
import type { V3, WantedHooks } from "../types.js";
import { WantedMachine } from "../wanted.js";

function makeMachine() {
  const events: string[] = [];
  const hooks: WantedHooks = {
    changed: (level, state, prev) => events.push(`changed:${prev}->${level}:${state}`),
    cleared: (reason) => events.push(`cleared:${reason}`),
    starsGained: (count) => events.push(`stars:+${count}`),
    searching: () => events.push("searching"),
    hotSceneReraised: () => events.push("hotscene"),
  };
  return { machine: new WantedMachine(hooks), events };
}

const P0: V3 = { x: 0, y: 0, z: 0 };
const noWitness = { copSaw: false, civilianSaw: false };
const civWitness = { copSaw: false, civilianSaw: true };
const copWitness = { copSaw: true, civilianSaw: false };

function tickMachine(m: WantedMachine, seconds: number, pos: V3 = P0, seen = false) {
  const steps = Math.ceil(seconds / 0.5);
  for (let i = 0; i < steps; i++) m.tick(0.5, pos, seen);
}

describe("WantedMachine.reportCrime", () => {
  it("ignores an unwitnessed civilian-witness crime", () => {
    const { machine } = makeMachine();
    const r = machine.reportCrime("assault", P0, noWitness);
    expect(r.counted).toBe(false);
    expect(machine.level).toBe(0);
  });

  it("counts a witnessed murder as 1 star, state responding", () => {
    const { machine } = makeMachine();
    const r = machine.reportCrime("murder", { x: 10, y: 0, z: 5 }, civWitness);
    expect(r).toEqual({ counted: true, starsAdded: 1 });
    expect(machine.level).toBe(1);
    expect(machine.state).toBe("responding");
    expect(machine.hasSearchCenter).toBe(true);
    expect(machine.searchCenter.x).toBe(10);
  });

  it("goes active immediately when a cop sees it", () => {
    const { machine } = makeMachine();
    machine.reportCrime("carjacking", P0, copWitness);
    expect(machine.state).toBe("active");
  });

  it("adds starsWhenWanted for repeat crimes while wanted", () => {
    const { machine } = makeMachine();
    machine.reportCrime("murder", P0, civWitness); // +1
    machine.reportCrime("murder", P0, civWitness); // +2 while wanted
    expect(machine.level).toBe(3);
  });

  it("armed_robbery counts with no witness at all", () => {
    const { machine } = makeMachine();
    const r = machine.reportCrime("armed_robbery", P0, noWitness);
    expect(r.counted).toBe(true);
    expect(machine.level).toBe(2);
  });

  it("enforces per-crime cooldowns", () => {
    const { machine } = makeMachine();
    machine.reportCrime("hit_and_run", P0, copWitness);
    const r = machine.reportCrime("hit_and_run", P0, copWitness);
    expect(r.counted).toBe(false);
    expect(machine.level).toBe(1);
  });

  it("clamps at MAX_WANTED_LEVEL", () => {
    const { machine, events } = makeMachine();
    machine.setLevel(6);
    machine.reportCrime("murder", P0, copWitness);
    expect(machine.level).toBe(6);
    expect(events).not.toContain("stars:+1");
  });

  it("creates a hot scene for hot crimes", () => {
    const { machine } = makeMachine();
    machine.reportCrime("store_robbery", { x: 50, y: 0, z: 50 }, copWitness);
    expect(machine.hotScenes).toHaveLength(1);
  });
});

describe("WantedMachine evasion", () => {
  it("active -> searching after losing sight, then clears on evasion", () => {
    const { machine, events } = makeMachine();
    machine.setLevel(1, "active");
    // Seen for a bit, then lost.
    tickMachine(machine, 1, P0, true);
    expect(machine.state).toBe("active");
    tickMachine(machine, 4, P0, false);
    expect(machine.state).toBe("searching");
    expect(events).toContain("searching");
    // Evasion at level 1 needs 40 s outside the circle.
    machine.fastForward(41);
    expect(machine.level).toBe(0);
    expect(machine.state).toBe("none");
    expect(events).toContain("cleared:evaded");
  });

  it("hiding inside the search circle counts slower", () => {
    const { machine } = makeMachine();
    machine.setLevel(1, "searching");
    // Stand exactly at the search centre (inside the circle).
    tickMachine(machine, 30, { ...machine.searchCenter });
    expect(machine.level).toBe(1); // 30 s inside only counts 20 s of evasion
    tickMachine(machine, 31, { x: 10000, y: 0, z: 10000 });
    expect(machine.level).toBe(0);
  });

  it("being seen resets the evasion clock", () => {
    const { machine } = makeMachine();
    machine.setLevel(1, "searching");
    tickMachine(machine, 30, { x: 10000, y: 0, z: 10000 });
    expect(machine.evasion).toBeGreaterThan(0);
    machine.tick(0.5, P0, true);
    expect(machine.evasion).toBe(0);
    expect(machine.state).toBe("active");
  });
});

describe("WantedMachine hot scenes", () => {
  it("re-raises heat when re-entering a scene after clearing", () => {
    const { machine, events } = makeMachine();
    const scene = { x: 100, y: 0, z: 100 };
    machine.tick(0.1, scene, false);
    machine.reportCrime("murder", scene, copWitness);
    machine.fastForward(1000); // evade it all
    expect(machine.level).toBe(0);
    // Walk away, then walk back in: outside->inside transition re-raises.
    machine.tick(0.1, P0, false);
    machine.tick(0.1, scene, false);
    expect(machine.level).toBe(1);
    expect(machine.state).toBe("searching");
    expect(events).toContain("hotscene");
  });
});

describe("WantedMachine phone reports and direct control", () => {
  it("reportedByPhone starts level 1 responding at the scene", () => {
    const { machine } = makeMachine();
    machine.reportedByPhone({ x: 7, y: 0, z: 7 });
    expect(machine.level).toBe(1);
    expect(machine.state).toBe("responding");
    expect(machine.searchCenter.x).toBe(7);
  });

  it("setLevel(5) arms the getaway chase; setLevel(0) clears", () => {
    const { machine, events } = makeMachine();
    machine.setLevel(5);
    expect(machine.level).toBe(5);
    expect(machine.state).toBe("active");
    machine.setLevel(0);
    expect(machine.level).toBe(0);
    expect(events).toContain("cleared:debug");
  });
});

describe("WantedMachine heat", () => {
  it("gains heat per star and decays over time", () => {
    const { machine } = makeMachine();
    machine.reportCrime("murder", P0, copWitness);
    expect(machine.heat).toBe(5);
    tickMachine(machine, 600, P0, false); // 10 minutes, unseen
    expect(machine.heat).toBeLessThan(5);
  });

  it("clamps heat at max", () => {
    const { machine } = makeMachine();
    machine.setLevel(6);
    expect(machine.heat).toBeLessThanOrEqual(100);
  });
});
