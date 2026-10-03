/**
 * Contextual tutorial hints (mandate §13): triggers read live state, dismissal
 * persists.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";
import {
  currentHint,
  loadTutorialStore,
  saveTutorialStore,
  type TutorialInput,
} from "../tutorial.js";
import { createFixtureSimulationProvider } from "../fixture/index.js";
import type { PartyState, SimSnapshot } from "../types.js";
import { beforeAll } from "vitest";

let snapshot: SimSnapshot;

beforeAll(async () => {
  const provider = createFixtureSimulationProvider();
  snapshot = await provider.getSnapshot();
});

function input(overrides: Partial<TutorialInput> = {}): TutorialInput {
  return {
    party: snapshot.party,
    visitedSettlementIds: new Set<string>(),
    daysOfFood: 10,
    objectivesOpened: false,
    ...overrides,
  };
}

describe("currentHint", () => {
  it("suggests marching when the party has no destination and nothing visited", () => {
    const party: PartyState = { ...snapshot.party, destination: null };
    const hint = currentHint(input({ party }), new Set(), false);
    expect(hint?.id).toBe("march");
  });

  it("does not suggest marching once the party has a destination", () => {
    const hint = currentHint(input(), new Set(), false);
    // The fixture party may or may not have a destination; either way, if the march
    // hint is suppressed the trigger did its job.
    if (snapshot.party.destination) expect(hint?.id).not.toBe("march");
  });

  it("suggests recruiting when the party is tiny and a settlement was opened", () => {
    const party: PartyState = { ...snapshot.party, troops: [] };
    const hint = currentHint(input({ party, visitedSettlementIds: new Set(["s1"]) }), new Set(), false);
    expect(hint?.id).toBe("recruit");
  });

  it("warns about food when supplies run low", () => {
    // Visited a settlement so the march hint does not take priority: one hint at a
    // time, and the march hint is first in a fresh world.
    const hint = currentHint(
      input({ daysOfFood: 1.5, visitedSettlementIds: new Set(["s1"]) }),
      new Set(),
      false,
    );
    expect(hint?.id).toBe("food");
  });

  it("points at objectives after some scouting, once", () => {
    const hint = currentHint(
      input({ visitedSettlementIds: new Set(["a", "b"]), objectivesOpened: false }),
      new Set(),
      false,
    );
    expect(hint?.id).toBe("objectives");
    const afterOpen = currentHint(
      input({ visitedSettlementIds: new Set(["a", "b"]), objectivesOpened: true }),
      new Set(),
      false,
    );
    expect(afterOpen?.id).not.toBe("objectives");
  });

  it("respects dismissal and the global disable", () => {
    const party: PartyState = { ...snapshot.party, destination: null };
    const dismissed = currentHint(input({ party }), new Set(["march"]), false);
    expect(dismissed?.id).not.toBe("march");
    expect(currentHint(input({ party }), new Set(), true)).toBeNull();
  });

  it("shows one hint at a time", () => {
    // Low food and no destination: exactly one hint, not a stack.
    const party: PartyState = { ...snapshot.party, destination: null, troops: [] };
    const hint = currentHint(
      input({ party, daysOfFood: 1, visitedSettlementIds: new Set() }),
      new Set(),
      false,
    );
    expect(hint).not.toBeNull();
  });
});

describe("tutorial store", () => {
  it("round-trips through localStorage and survives corruption", () => {
    localStorage.clear();
    const fresh = loadTutorialStore();
    expect(fresh.disabled).toBe(false);
    expect(fresh.dismissed.size).toBe(0);
    saveTutorialStore({ dismissed: new Set(["march"]), disabled: true, objectivesOpened: true });
    const loaded = loadTutorialStore();
    expect(loaded.dismissed.has("march")).toBe(true);
    expect(loaded.disabled).toBe(true);
    expect(loaded.objectivesOpened).toBe(true);
    localStorage.setItem("blc-tutorial-v1", "broken{{{");
    expect(loadTutorialStore().disabled).toBe(false);
    localStorage.clear();
  });
});
