/**
 * The character sheet reaching the campaign, and surviving a save round trip.
 *
 * `setCharacter` used to take the background choices and drop them on the floor,
 * so a finished campaign could show the biography a sheet had built and never
 * what the player had picked. Attributes and focus are newer still and would have
 * gone the same way, which is why the fields are pinned here rather than left to
 * the snapshot to carry by accident.
 */

import { describe, expect, it } from "vitest";

import { createFixtureSimulationProvider } from "../fixtureProvider.js";
import { ATTRIBUTE_IDS, SKILL_IDS, startingSkillLevels } from "../../attributes.js";
import type { PlayerCharacter } from "../../types.js";

/**
 * A fresh sheet per test. One shared object would be wrong here for a real reason
 * rather than a tidiness one: the aliasing test below writes to the maps it hands
 * in, and a shared fixture would carry those writes into every later test and
 * make them pass against corrupted input.
 */
function sheet(): PlayerCharacter {
  return {
  firstName: "Wren",
  lastName: "Calloway",
  gender: "female",
  appearanceId: "african-1",
  ethnicityId: "african",
  age: 31,
  startCity: "manhattan-sample",
  difficulty: "normal",
  backgroundChoices: { childhood: "rural", youth: "athlete", training: "military", profession: "medic" },
  attributes: { vigor: 6, control: 4, endurance: 5, cunning: 5, social: 6, intelligence: 4 },
  skillFocus: { medicine: 2, trade: 1 },
  startingSkills: { combat: 6, medicine: 4, athletics: 3 },
  startingCash: 850,
  biography: "Grew up rural. Trained as a medic.",
  };
}

describe("setCharacter puts the sheet on the player", () => {
  it("carries the names, the background choices, the attributes, and the focus", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    provider.setCharacter(sheet());

    const { player } = await provider.getSnapshot();
    expect(player.characterName).toBe("Wren Calloway");
    expect(player.ethnicityId).toBe("african");
    expect(player.appearanceId).toBe("african-1");
    expect(player.age).toBe(31);
    expect(player.biography).toBe("Grew up rural. Trained as a medic.");
    expect(player.resources.money).toBe(850);
    expect(player.skills).toEqual({ combat: 6, medicine: 4, athletics: 3 });

    // The three fields the sheet gained.
    expect(player.backgroundChoices).toEqual({ childhood: "rural", youth: "athlete", training: "military", profession: "medic" });
    expect(player.attributes).toEqual({
      vigor: 6, control: 4, endurance: 5, cunning: 5, social: 6, intelligence: 4,
    });
    expect(player.skillFocus).toEqual({ medicine: 2, trade: 1 });
  });

  it("copies the sheet rather than aliasing the caller's maps", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    provider.setCharacter(sheet());

    // The maker hands over `{ ...attributes }` already, but a caller that does not
    // is still not allowed to mutate the live campaign by writing to its own map.
    const handed = sheet();
    provider.setCharacter(handed);
    handed.attributes!.vigor = 99;
    handed.backgroundChoices.childhood = "projects";
    handed.skillFocus!.medicine = 99;

    const { player } = await provider.getSnapshot();
    expect(player.attributes?.vigor).toBe(6);
    expect(player.backgroundChoices?.childhood).toBe("rural");
    expect(player.skillFocus?.medicine).toBe(2);
  });

  it("stores empty maps rather than nothing when an older sheet omits them", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    provider.setCharacter({ ...sheet(), attributes: undefined, skillFocus: undefined });

    // The fields are typed optional so a pre-attribute client still fits, and the
    // snapshot answers with the same keys present and empty rather than undefined,
    // so a panel can read them without a nil check.
    const { player } = await provider.getSnapshot();
    expect(player.attributes).toEqual({});
    expect(player.skillFocus).toEqual({});
    expect(player.backgroundChoices).toEqual({ childhood: "rural", youth: "athlete", training: "military", profession: "medic" });
  });

  it("survives a save and load with every field intact", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    provider.setCharacter(sheet());
    const saved = await provider.getSnapshot();

    // Play on, so the restore is doing real work rather than restoring the state it
    // was handed.
    await provider.applyBattleResult({ won: false, playerLosses: 4, loot: 0, enemyStrength: 500 });

    await provider.restoreSnapshot(saved);
    const { player } = await provider.getSnapshot();

    expect(player.characterName).toBe("Wren Calloway");
    expect(player.attributes).toEqual({
      vigor: 6, control: 4, endurance: 5, cunning: 5, social: 6, intelligence: 4,
    });
    expect(player.skillFocus).toEqual({ medicine: 2, trade: 1 });
    expect(player.backgroundChoices).toEqual({ childhood: "rural", youth: "athlete", training: "military", profession: "medic" });
    expect(player.biography).toBe("Grew up rural. Trained as a medic.");
  });

  it("derives the eighteen skills from the sheet the same way the panels will", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    provider.setCharacter(sheet());
    const { player } = await provider.getSnapshot();

    const attributes = player.attributes ?? {};
    const focus = player.skillFocus ?? {};
    const levels = startingSkillLevels(attributes, focus, player.skills);

    expect(Object.keys(levels).sort()).toEqual([...SKILL_IDS].sort());
    expect(ATTRIBUTE_IDS.every((id) => attributes[id] !== undefined)).toBe(true);
    // Social is 6 and Intelligence 4, and two focus points went into medicine, which
    // Intelligence governs: the sheet is enough to rebuild every level.
    expect(levels.trade).toBe(6 * 4 + 1 * 10);
    expect(levels.medicine).toBe(4 * 4 + 2 * 10 + (4 - 1) * 10);
    expect(levels.one_handed).toBe(6 * 4 + (6 - 1) * 10);
  });
});