/**
 * CopBrain tests — the foot-cop FSM against fake peds.
 */
import { describe, expect, it } from "vitest";
import {
  aimAtPlayer,
  CopBrain,
  type CopContext,
  type CopPed,
} from "../copBrain.js";
import { dispatchTier } from "../policeData.js";
import type { V3 } from "../types.js";

function makePed(x: number, z: number): CopPed & { movedTo: V3[]; stopped: boolean } {
  const ped = {
    position: { x, y: 0, z },
    state: "idle",
    vehicle: null,
    handsUp: false,
    knockedDown: false,
    movedTo: [] as V3[],
    stopped: false,
    stop() {
      this.stopped = true;
    },
    moveToward(target: V3, _speed: number) {
      this.movedTo.push({ ...target });
      // Fake movement: step toward the target.
      const dx = target.x - this.position.x;
      const dz = target.z - this.position.z;
      const d = Math.hypot(dx, dz) || 1;
      this.position.x += (dx / d) * Math.min(d, 1);
      this.position.z += (dz / d) * Math.min(d, 1);
    },
    face(_target: V3) {},
  };
  return ped;
}

interface CtxOpts {
  level?: number;
  playerPos?: V3;
  playerSpeed?: number;
  playerInVehicle?: boolean;
  playerArmed?: boolean;
  alive?: boolean;
  sight?: boolean;
}

function makeCtx(opts: CtxOpts = {}): CopContext {
  const playerPos = opts.playerPos ?? { x: 0, y: 0, z: 0 };
  return {
    level: opts.level ?? 1,
    heat: 0,
    tier: dispatchTier(opts.level ?? 1),
    holdFire: false,
    playerAlive: () => opts.alive ?? true,
    playerArmed: () => opts.playerArmed ?? false,
    playerSpeed: () => opts.playerSpeed ?? 0,
    playerInVehicle: () => opts.playerInVehicle ?? false,
    playerPosition: () => playerPos,
    rng: { range: (a: number, b: number) => (a + b) / 2 },
    sight: { toPlayer: () => opts.sight ?? true },
    fire: () => {},
    reportSighting: () => {},
  };
}

describe("CopBrain", () => {
  it("stands down when the wanted level is 0", () => {
    const brain = new CopBrain(makeCtx({ level: 0 }), "pistol");
    const ped = makePed(5, 0);
    brain.update(ped, 0.5);
    expect(brain.mode).toBe("standDown");
    expect(ped.stopped).toBe(true);
  });

  it("walks up to arrest a slow unarmed player on foot at level 1", () => {
    const brain = new CopBrain(makeCtx({ level: 1, sight: true }), "pistol");
    const ped = makePed(30, 0);
    for (let i = 0; i < 40; i++) brain.update(ped, 0.5);
    // Eventually inside arrest range with LOS: arrest contact.
    expect(["arrest", "approach"]).toContain(brain.mode);
    expect(brain.arrestContact).toBe(true);
  });

  it("chases (no arrest walk-up) when the player is fleeing", () => {
    const brain = new CopBrain(makeCtx({ level: 1, playerSpeed: 8, sight: true }), "pistol");
    const ped = makePed(30, 0);
    brain.update(ped, 0.5);
    expect(brain.mode).toBe("approach");
    expect(ped.movedTo.length).toBeGreaterThan(0);
  });

  it("goes combat at level 3 (lethal tier)", () => {
    const brain = new CopBrain(makeCtx({ level: 3, sight: true }), "smg");
    const ped = makePed(30, 0);
    brain.update(ped, 0.5);
    expect(brain.mode).toBe("combat");
  });

  it("goes combat when provoked even at level 1", () => {
    const brain = new CopBrain(makeCtx({ level: 1, sight: true }), "pistol");
    brain.onDamaged();
    expect(brain.provoked).toBe(true);
    const ped = makePed(30, 0);
    brain.update(ped, 0.5);
    expect(brain.mode).toBe("combat");
  });

  it("stays in ride mode while seated in a vehicle", () => {
    const brain = new CopBrain(makeCtx({ level: 3 }), "pistol");
    const ped = makePed(0, 0);
    ped.vehicle = {};
    brain.update(ped, 0.5);
    expect(brain.mode).toBe("ride");
  });

  it("fires when it has line of sight in combat", () => {
    let fired = 0;
    const ctx = makeCtx({ level: 3, sight: true });
    ctx.fire = () => {
      fired++;
    };
    const brain = new CopBrain(ctx, "pistol");
    const ped = makePed(15, 0); // inside standoff band
    for (let i = 0; i < 60; i++) brain.update(ped, 0.1);
    expect(fired).toBeGreaterThan(0);
  });

  it("does not fire without line of sight", () => {
    let fired = 0;
    const ctx = makeCtx({ level: 3, sight: false });
    ctx.fire = () => {
      fired++;
    };
    const brain = new CopBrain(ctx, "pistol");
    const ped = makePed(15, 0);
    for (let i = 0; i < 60; i++) brain.update(ped, 0.1);
    expect(fired).toBe(0);
  });

  it("accuracy rises with heat and tier bonus, capped at 0.95", () => {
    const ctx = makeCtx({ level: 6 });
    ctx.heat = 100;
    const brain = new CopBrain(ctx, "rifle");
    expect(brain.accuracy).toBeLessThanOrEqual(0.95);
    expect(brain.accuracy).toBeGreaterThan(0.35);
  });
});

describe("aimAtPlayer", () => {
  it("aims at the chest with no spread at perfect accuracy", () => {
    const dir = aimAtPlayer(
      { x: 0, y: 1.6, z: 0 },
      { x: 0, y: 0, z: 10 },
      1,
      { range: () => 0 },
    );
    expect(dir.z).toBeGreaterThan(0.9);
    expect(Math.abs(dir.x)).toBeLessThan(0.01);
  });

  it("adds spread at low accuracy", () => {
    const rng = { range: (_a: number, b: number) => b }; // always max spread
    const dir = aimAtPlayer({ x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: 10 }, 0, rng);
    expect(Math.abs(dir.x)).toBeGreaterThan(0.05);
  });
});
