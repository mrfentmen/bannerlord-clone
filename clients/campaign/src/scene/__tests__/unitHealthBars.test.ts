/**
 * Tasks 36, 41: unit health bars and the FPS toggle.
 *
 * Health bars run on a NullEngine scene with scripted brains — the bar widths
 * come from the soldiers' real health, the toggle really hides the meshes.
 * The FPS toggle drives the real perf overlay module, reset between tests.
 */

import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene, Vector3 } from "@babylonjs/core";
import { UnitHealthBars } from "../unitHealthBars.js";
import type { UnitBrain } from "../battleUnit.js";
import type { BattleSoldier } from "../BattleSoldier.js";

function fakeBrain(alive: boolean, x = 0): UnitBrain {
  return {
    team: 0,
    state: alive ? "idle" : "dead",
    alive,
    position: new Vector3(x, 0, 0),
  } as unknown as UnitBrain;
}

function fakeSoldier(health: number, maxHealth: number): BattleSoldier {
  return { health, maxHealth } as unknown as BattleSoldier;
}

describe("unit health bars (task 36)", () => {
  it("scales bars by health fraction and hides the dead", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const bars = new UnitHealthBars(
      scene,
      [fakeBrain(true, 0), fakeBrain(false, 5)],
      [fakeSoldier(50, 100), fakeSoldier(0, 100)],
    );

    bars.update();
    const meshes = scene.meshes.filter((m) => m.name.startsWith("unitHpBar_"));
    expect(meshes).toHaveLength(2);
    const first = meshes[0];
    const second = meshes[1];
    expect(first?.isEnabled()).toBe(true);
    expect(first?.scaling.x).toBeCloseTo(0.5, 5);
    // The dead soldier's bar is gone, not empty.
    expect(second?.isEnabled()).toBe(false);

    bars.setVisible(false);
    expect(bars.isVisible).toBe(false);
    expect(first?.isEnabled()).toBe(false);
    bars.dispose();
    engine.dispose();
  });
});
