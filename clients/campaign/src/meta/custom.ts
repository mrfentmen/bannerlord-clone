/**
 * Tasks 138-139: scenario editor and mod support UI.
 *
 * Scenario editor: place settlements and factions on a blank map and save
 * the result as a custom scenario. The data is the scenario — the campaign
 * layer loads it like any other.
 *
 * Mods: list installed data packs and enable/disable them. Mods are data
 * packs (JSON); this module never executes mod code.
 */

import type { ModInfo, Scenario } from "./types.js";

let nextScenario = 1;

export interface ScenarioEditor {
  scenario(): Scenario;
  rename(name: string): void;
  addSettlement(name: string, x: number, y: number): void;
  removeSettlement(id: string): void;
  addFaction(name: string, home: string): void;
  removeFaction(id: string): void;
  /** Validate before save: needs 2+ settlements and 2+ factions. */
  validate(): string[];
}

export function createScenarioEditor(name = "Untitled"): ScenarioEditor {
  let seq = 1;
  const scenario: Scenario = { id: `scenario-${nextScenario++}`, name, settlements: [], factions: [] };
  return {
    scenario: () => ({
      ...scenario,
      settlements: [...scenario.settlements],
      factions: [...scenario.factions],
    }),
    rename: (n) => {
      scenario.name = n;
    },
    addSettlement(name, x, y) {
      scenario.settlements.push({ id: `set-${seq++}`, name, x, y });
    },
    removeSettlement(id) {
      scenario.settlements = scenario.settlements.filter((s) => s.id !== id);
    },
    addFaction(name, home) {
      scenario.factions.push({ id: `fac-${seq++}`, name, home });
    },
    removeFaction(id) {
      scenario.factions = scenario.factions.filter((f) => f.id !== id);
    },
    validate() {
      const problems: string[] = [];
      if (scenario.settlements.length < 2) problems.push("needs at least 2 settlements");
      if (scenario.factions.length < 2) problems.push("needs at least 2 factions");
      for (const f of scenario.factions) {
        if (!scenario.settlements.some((s) => s.id === f.home || s.name === f.home)) {
          problems.push(`faction ${f.name} has no home settlement`);
        }
      }
      return problems;
    },
  };
}

export interface ModManager {
  mods(): ModInfo[];
  install(mod: Omit<ModInfo, "enabled">): void;
  setEnabled(id: string, enabled: boolean): void;
  enabled(): ModInfo[];
}

export function createModManager(): ModManager {
  const mods = new Map<string, ModInfo>();
  return {
    mods: () => [...mods.values()],
    install(mod) {
      mods.set(mod.id, { ...mod, enabled: false });
    },
    setEnabled(id, enabled) {
      const m = mods.get(id);
      if (!m) throw new Error(`unknown mod: ${id}`);
      m.enabled = enabled;
    },
    enabled: () => [...mods.values()].filter((m) => m.enabled),
  };
}
