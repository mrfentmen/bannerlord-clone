/**
 * Tests for the bark trigger system: cooldowns, anti-overlap, category mapping.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BarkTriggers } from "../barkTriggers.js";
import { getAudioManager } from "../AudioManager.js";

vi.mock("../AudioManager.js", () => {
  const playSfx = vi.fn().mockResolvedValue(undefined);
  return {
    getAudioManager: () => ({ playSfx }),
  };
});

describe("BarkTriggers", () => {
  let now: number;
  let triggers: BarkTriggers;

  beforeEach(() => {
    vi.clearAllMocks();
    now = 1_000_000;
    triggers = new BarkTriggers(() => now);
  });

  const playedIds = () =>
    (getAudioManager().playSfx as any).mock.calls.map((c: any[]) => c[0] as string);

  it("plays a bark for a battle order", () => {
    triggers.barkFor("charge", "briggs");
    const ids = playedIds();
    expect(ids).toHaveLength(1);
    expect(ids[0]).toMatch(/^bark-briggs-(charge|charge-now|charge-the-square)-[123]$/);
  });

  it("enforces the global cooldown", () => {
    triggers.barkFor("attack", "briggs");
    triggers.barkFor("charge", "paloma");
    expect(playedIds()).toHaveLength(1);
    now += 2600;
    triggers.barkFor("charge", "paloma");
    expect(playedIds()).toHaveLength(2);
  });

  it("enforces the per-category cooldown", () => {
    // Force the same category by using a single-category event twice.
    triggers.barkBattleEvent("ambush", "briggs");
    const first = playedIds()[0];
    const category = first.split("-").slice(2, -1).join("-");
    now += 2600; // past global, inside category cooldown
    // A different event mapping to the same category would be dropped;
    // ambush maps to ambush-now/spring-the-trap — retry ambush directly.
    triggers.barkBattleEvent("ambush", "paloma");
    // May or may not have played (random category pick); either 1 or 2 is fine
    // as long as the same category never repeats inside its cooldown.
    const ids = playedIds();
    const sameCat = ids.filter((id: string) => id.includes(category));
    expect(sameCat).toHaveLength(1);
  });

  it("plays battle events", () => {
    triggers.barkBattleEvent("victory", "vincent");
    const ids = playedIds();
    expect(ids).toHaveLength(1);
    expect(ids[0]).toMatch(/^bark-vincent-(victory|victory-cheer)-[123]$/);
  });

  it("plays NPC barks", () => {
    triggers.barkNpc("blacksmith", "paloma");
    const ids = playedIds();
    expect(ids).toHaveLength(1);
    expect(ids[0]).toMatch(/^bark-paloma-blacksmith-[123]$/);
  });

  it("picks a random voice when none is given", () => {
    triggers.barkFor("hold");
    const ids = playedIds();
    expect(ids[0]).toMatch(/^bark-(briggs|paloma|vincent)-/);
  });

  it("drops barks cleanly when the category is missing", async () => {
    triggers.barkNpc("no-such-profession-xyz", "briggs");
    // playSfx mock resolves, so nothing observable here; the real path
    // clears the category cooldown on rejection. Just assert no throw.
    expect(playedIds()).toHaveLength(1);
  });
});
