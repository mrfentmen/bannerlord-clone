/**
 * NPC battle simulation and melee maneuvers.
 */

import { describe, expect, it } from "vitest";
import {
  simulateNpcBattle,
  unitStrength,
} from "../npcBattle.js";
import {
  resolveMelee,
} from "../meleeManeuvers.js";

describe("npcBattle (Bannerlord autocombat)", () => {
  it("unit strength follows the wiki formula with a floor of 1", () => {
    expect(unitStrength(4)).toBeCloseTo(1.28, 2);
    expect(unitStrength(0)).toBe(1);
    expect(unitStrength(27)).toBeCloseTo(19.22, 1);
  });

  it("the stronger side usually wins", () => {
    let wins = 0;
    for (let i = 0; i < 20; i++) {
      const r = simulateNpcBattle(
        { troops: 100, avgLevel: 18, morale: 0.7 },
        { troops: 40, avgLevel: 6, morale: 0.5 },
        () => 0.5,
      );
      if (r.winner === 0) wins++;
    }
    expect(wins).toBe(20);
  });

  it("both sides take killed and wounded", () => {
    const r = simulateNpcBattle(
      { troops: 60, avgLevel: 12, morale: 0.6 },
      { troops: 60, avgLevel: 12, morale: 0.6 },
      () => 0.5,
    );
    expect(r.rounds).toBeGreaterThan(0);
    expect(r.killed[0] + r.killed[1]).toBeGreaterThan(0);
    expect(r.wounded[0] + r.wounded[1]).toBeGreaterThan(0);
  });

  it("morale matters: shaken troops lose", () => {
    const r = simulateNpcBattle(
      { troops: 50, avgLevel: 12, morale: 0.9 },
      { troops: 50, avgLevel: 12, morale: 0.2 },
      () => 0.5,
    );
    expect(r.winner).toBe(0);
  });
});

describe("meleeManeuvers (feint and chamber)", () => {
  it("a correct block stops most damage", () => {
    const r = resolveMelee({
      attack: 'overhead',
      defense: { kind: 'block', direction: 'overhead' },
      attackerSkill: 5,
      defenderSkill: 5,
    });
    expect(r.result).toBe('blocked');
    expect(r.damageMult).toBeLessThan(0.5);
  });

  it("a wrong-direction block eats the hit", () => {
    const r = resolveMelee({
      attack: 'left',
      defense: { kind: 'block', direction: 'right' },
      attackerSkill: 5,
      defenderSkill: 5,
    });
    expect(r.result).toBe('hit');
  });

  it("a feint punishes a defender who bit on the fake", () => {
    const r = resolveMelee({
      attack: 'thrust',
      feintFrom: 'overhead',
      defense: { kind: 'block', direction: 'overhead' },
      attackerSkill: 5,
      defenderSkill: 5,
    });
    expect(r.result).toBe('hit');
    expect(r.damageMult).toBeGreaterThan(1);
    expect(r.detail).toMatch(/Feint/);
  });

  it("a defender who reads the feint still blocks", () => {
    const r = resolveMelee({
      attack: 'thrust',
      feintFrom: 'overhead',
      defense: { kind: 'block', direction: 'thrust' },
      attackerSkill: 5,
      defenderSkill: 5,
    });
    expect(r.result).toBe('blocked');
  });

  it("a chamber deflects the attack when it lands", () => {
    const r = resolveMelee(
      {
        attack: 'right',
        defense: { kind: 'chamber' },
        attackerSkill: 0,
        defenderSkill: 10,
      },
      () => 0.0,
    );
    expect(r.result).toBe('chambered');
    expect(r.damageMult).toBe(0);
  });

  it("a failed chamber leaves the defender wide open", () => {
    const r = resolveMelee(
      {
        attack: 'right',
        defense: { kind: 'chamber' },
        attackerSkill: 10,
        defenderSkill: 0,
      },
      () => 0.999,
    );
    expect(r.result).toBe('hit');
    expect(r.damageMult).toBeGreaterThan(1);
  });
});
