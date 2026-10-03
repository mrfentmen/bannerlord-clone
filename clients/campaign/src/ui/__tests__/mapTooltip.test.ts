/**
 * Settlement hover cards (mandate §17): the card content is built from the real town
 * state, so these tests assert the mapping, not the rendering.
 *
 * The towns come from the fixture simulation provider — the same real-shaped state
 * the map reads — with field overrides only where a tone needs a specific value.
 */

import { describe, expect, it } from "vitest";
import { buildSettlementHoverCard } from "../mapTooltip.js";
import { createFixtureSimulationProvider } from "../../data/fixture/index.js";
import type { SimSnapshot, TownState } from "../../data/types.js";

async function firstTown(): Promise<TownState> {
  const provider = createFixtureSimulationProvider();
  const snapshot: SimSnapshot = await provider.getSnapshot();
  const town = snapshot.towns[0];
  if (!town) throw new Error("fixture has no towns");
  return town;
}

function row(card: ReturnType<typeof buildSettlementHoverCard>, label: string) {
  const found = card.rows.find((r) => r.label === label);
  if (!found) throw new Error(`no row labelled ${label}`);
  return found;
}

describe("buildSettlementHoverCard", () => {
  it("titles the card with the town name, class and holder", async () => {
    const town = await firstTown();
    const card = buildSettlementHoverCard(town);
    expect(card.title).toBe(town.name);
    expect(card.subtitle).toContain(town.holderName);
    expect(card.subtitle.toLowerCase()).toContain(town.klass);
  });

  it("shows the real published figures", async () => {
    const town = await firstTown();
    const card = buildSettlementHoverCard(town);
    expect(row(card, "Population").value).toBe(
      town.population == null ? "unknown" : town.population.toLocaleString("en-US"),
    );
    expect(row(card, "Prosperity").value).toBe(`${Math.round(town.prosperity * 100)}%`);
    expect(row(card, "Garrison").value).toBe(town.garrison.toLocaleString("en-US"));
  });

  it("marks dangerous unrest as bad and middling unrest as a warning", async () => {
    const town = await firstTown();
    expect(row(buildSettlementHoverCard({ ...town, unrest: 0.85 }), "Unrest").tone).toBe("bad");
    expect(row(buildSettlementHoverCard({ ...town, unrest: 0.7 }), "Unrest").tone).toBe("warn");
    expect(row(buildSettlementHoverCard({ ...town, unrest: 0.2 }), "Unrest").tone).toBeUndefined();
  });

  it("shows closed gates with the simulation's reason", async () => {
    const town = await firstTown();
    const closed: TownState = {
      ...town,
      access: { allowed: false, reason: "at war with the holder" },
    };
    const gates = row(buildSettlementHoverCard(closed), "Gates");
    expect(gates.value).toContain("at war with the holder");
    expect(gates.tone).toBe("warn");
  });

  it("omits the gates row when entry is allowed", async () => {
    const town = await firstTown();
    const open: TownState = { ...town, access: { allowed: true, reason: "" } };
    expect(buildSettlementHoverCard(open).rows.some((r) => r.label === "Gates")).toBe(false);
  });

  it("says unknown, muted, when the simulation publishes no population", async () => {
    const town = await firstTown();
    const pop = row(buildSettlementHoverCard({ ...town, population: null }), "Population");
    expect(pop.value).toBe("unknown");
    expect(pop.tone).toBe("muted");
  });
});
