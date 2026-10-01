/**
 * Task 64: historical battles. Three scripted scenarios ship with briefing
 * text: the setup (forces, biome, modifiers) plus the story the player reads
 * before deploying. "Scripted" here means authored setup and briefing — the
 * fight itself still runs in the battle scene.
 */

import type { BattleConfig } from "./types.js";
import { presetForce } from "./forces.js";
import { applyModifiers } from "./challenge.js";

export interface HistoricalScenario {
  id: string;
  title: string;
  briefing: string[];
  config: BattleConfig;
}

function scenario(
  id: string,
  title: string,
  briefing: string[],
  playerId: string,
  enemyId: string,
  biome: BattleConfig["biome"],
  seed: number,
  modifiers: string[] = [],
): HistoricalScenario {
  const config: BattleConfig = {
    mode: "historical",
    label: title,
    player: presetForce(playerId),
    enemy: presetForce(enemyId),
    biome,
    modifiers: [],
    seed,
  };
  applyModifiers(config, modifiers);
  return { id, title, briefing, config };
}

export const HISTORICAL_SCENARIOS: HistoricalScenario[] = [
  scenario(
    "hist-harbor",
    "The Harbor Uprising",
    [
      "Year three of the blockade. The Harbor Guard holds the docks against the Rust Horde, who have come for the grain ships.",
      "You command the Guard. The Horde outnumbers you two to one, but the docks are narrow and they can only come at you down the piers.",
      "Hold until the ships cast off. Nothing else matters.",
    ],
    "guard",
    "horde",
    "coast",
    1683,
    ["outnumbered"],
  ),
  scenario(
    "hist-freeway",
    "Midnight on the Freeway",
    [
      "The Freeway Wardens ambushed an Iron Legion column at 2 a.m., in the rain, on the elevated freeway outside the city.",
      "No moon, no streetlights. Your Wardens know every on-ramp; the Legion does not.",
      "Break the column before dawn or be ground down by discipline.",
    ],
    "wardens",
    "legion",
    "urban",
    2417,
    ["night"],
  ),
  scenario(
    "hist-dust",
    "Last Stand at Dust Bowl",
    [
      "The County Militia's final muster. The Highway Raiders have cut the water line and the militia marches out with half its strength.",
      "No bows — the armory burned last week. What you have is pikes, spite, and high ground.",
      "Make them pay for every foot of dust.",
    ],
    "militia",
    "raiders",
    "desert",
    902,
    ["last-stand", "no-archers"],
  ),
];

export function historicalScenario(id: string): HistoricalScenario {
  const s = HISTORICAL_SCENARIOS.find((x) => x.id === id);
  if (!s) throw new Error(`unknown historical scenario: ${id}`);
  return s;
}
