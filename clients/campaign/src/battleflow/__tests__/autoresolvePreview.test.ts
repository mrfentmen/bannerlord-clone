import { describe, expect, it } from "vitest";
import {
  LOSER_LOSS_RATE,
  previewAutoResolve,
  WINNER_LOSS_RATE,
} from "../autoresolvePreview.js";
import type { Encounter } from "../types.js";

function encounter(attackerTroops: number, attackerPower: number): Encounter {
  return {
    id: "e1",
    attacker: { partyId: 1, name: "A", troops: attackerTroops, power: attackerPower },
    defender: { partyId: 2, name: "D", troops: 100, power: 100 },
    status: "pending",
  };
}

describe("auto-resolve preview (solo task 28)", () => {
  it("estimates losses from the local model rates", () => {
    const p = previewAutoResolve(encounter(100, 100), true);
    expect(p.winChance).toBeCloseTo(0.5, 5);
    expect(p.winLosses).toBe(Math.round(100 * WINNER_LOSS_RATE));
    expect(p.lossLosses).toBe(Math.round(100 * LOSER_LOSS_RATE));
    expect(p.expectedLosses).toBe(Math.round((p.winLosses + p.lossLosses) / 2));
  });

  it("favours the stronger side", () => {
    const strong = previewAutoResolve(encounter(100, 300), true);
    const weak = previewAutoResolve(encounter(100, 30), true);
    expect(strong.winChance).toBeGreaterThan(weak.winChance);
    expect(strong.expectedLosses).toBeLessThan(weak.expectedLosses);
  });

  it("flips perspective for the defender", () => {
    const asAttacker = previewAutoResolve(encounter(100, 100), true);
    const asDefender = previewAutoResolve(encounter(100, 100), false);
    expect(asAttacker.winChance).toBeCloseTo(1 - asDefender.winChance, 5);
  });

  it("summarises honestly", () => {
    const p = previewAutoResolve(encounter(100, 100), true);
    expect(p.summary).toContain("losses expected");
    expect(p.note).toContain("local battle model");
  });

  it("is deterministic", () => {
    const e = encounter(120, 150);
    expect(previewAutoResolve(e, true)).toEqual(previewAutoResolve(e, true));
  });
});
