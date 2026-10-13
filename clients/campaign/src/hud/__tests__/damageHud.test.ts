/**
 * Tasks 330-335: damage numbers, hit flash, combat audio triggers.
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core";
import { CombatEventBus } from "../../scene/combatEvents.js";
import { createCombatAudio } from "../../scene/combatAudio.js";
import { DamageNumbers } from "../../scene/damageNumbers.js";
import { createHitFlash } from "../hitFlash.js";
import type { SoundBus } from "../../audio/soundEvents.js";

beforeEach(() => {
  document.body.replaceChildren();
});

function strike(team: 0 | 1, killed = false, amount = 12) {
  return {
    attackerTeam: team === 0 ? 1 : 0,
    victimTeam: team,
    fromDirection: { x: 0, z: 1 },
    killed,
    amount,
    victimPosition: { x: 1, y: 0, z: 2 },
  };
}

describe("combat audio triggers (tasks 334, 335)", () => {
  it("plays combat.hit on strikes and combat.kill on kills", () => {
    const played: string[] = [];
    const fakeBus = {
      play: (event: string) => void played.push(event),
    } as unknown as SoundBus;
    const bus = new CombatEventBus();
    const audio = createCombatAudio(bus, { bus: fakeBus, hitThrottleMs: 0, now: () => 0 });

    bus.emitStrike(strike(1));
    bus.emitKill({ victimTeam: 1, killerTeam: 0 });
    expect(played).toEqual(["combat.hit", "combat.kill"]);
    audio.destroy();
  });

  it("throttles hit sounds but never kill sounds", () => {
    const played: string[] = [];
    const fakeBus = { play: (event: string) => void played.push(event) } as unknown as SoundBus;
    let t = 0;
    const bus = new CombatEventBus();
    const audio = createCombatAudio(bus, { bus: fakeBus, hitThrottleMs: 120, now: () => t });

    bus.emitStrike(strike(1));
    t = 50;
    bus.emitStrike(strike(1));
    t = 200;
    bus.emitStrike(strike(1));
    bus.emitKill({ victimTeam: 1, killerTeam: 0 });
    bus.emitKill({ victimTeam: 1, killerTeam: 0 });
    expect(played.filter((p) => p === "combat.hit")).toHaveLength(2);
    expect(played.filter((p) => p === "combat.kill")).toHaveLength(2);
    audio.destroy();
  });
});

describe("damage numbers (tasks 330-332)", () => {
  it("spawns a number per strike, floats it up, and disposes it", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const bus = new CombatEventBus();
    const numbers = new DamageNumbers(scene, bus);

    bus.emitStrike(strike(1, false, 12));
    bus.emitStrike(strike(1, true, 18));
    expect(numbers.count).toBe(2);

    numbers.update(2);
    expect(numbers.count).toBe(0);
    numbers.dispose();
    engine.dispose();
  });

  it("stays silent when the setting is off (task 332)", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const bus = new CombatEventBus();
    const numbers = new DamageNumbers(scene, bus, { enabled: () => false });

    bus.emitStrike(strike(1));
    expect(numbers.count).toBe(0);
    numbers.dispose();
    engine.dispose();
  });
});

describe("hit flash (task 333)", () => {
  it("flashes on player-side hits only", () => {
    const bus = new CombatEventBus();
    const flash = createHitFlash(bus, { setTimeout: () => 0 });
    document.body.appendChild(flash.root);

    bus.emitStrike(strike(0));
    expect(document.querySelector(".hud-hitflash--show")).not.toBeNull();

    document.querySelector(".hud-hitflash")?.classList.remove("hud-hitflash--show");
    bus.emitStrike(strike(1));
    expect(document.querySelector(".hud-hitflash--show")).toBeNull();
    flash.destroy();
  });
});
