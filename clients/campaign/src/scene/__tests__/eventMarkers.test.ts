/**
 * Battle/siege event markers (mandate §17): derived from the simulation's own
 * notifications, so these tests assert the join and the recency rules.
 */

import { describe, expect, it } from "vitest";
import { buildEventMarkers, EVENT_MARKER_LIMIT } from "../eventMarkers.js";
import { createFixtureSimulationProvider } from "../../data/fixture/index.js";
import type { Notification, SimSnapshot, TownState } from "../../data/types.js";

async function fixtureTowns(): Promise<TownState[]> {
  const provider = createFixtureSimulationProvider();
  const snapshot: SimSnapshot = await provider.getSnapshot();
  return snapshot.towns;
}

function notif(entityId: string | null, kind?: string): Notification {
  return {
    id: `notif-${entityId ?? "none"}-${kind ?? "none"}`,
    day: 12,
    priority: "important",
    text: "something happened",
    entityId,
    field: null,
    ...(kind === undefined ? {} : { kind }),
  };
}

describe("buildEventMarkers", () => {
  it("marks recent battles and sieges at their towns", async () => {
    const towns = await fixtureTowns();
    const a = towns[0]!;
    const b = towns[1]!;
    const markers = buildEventMarkers(
      [notif(a.id, "battle"), notif(b.id, "siege")],
      towns,
    );
    expect(markers).toContainEqual({ settlementId: a.settlementId, kind: "battle" });
    expect(markers).toContainEqual({ settlementId: b.settlementId, kind: "siege" });
  });

  it("ignores other kinds, non-town entities and unknown towns", async () => {
    const towns = await fixtureTowns();
    const a = towns[0]!;
    const markers = buildEventMarkers(
      [
        notif(a.id, "rebellion"),
        notif(a.id), // no kind
        notif("side-3", "battle"), // not a town
        notif(null, "siege"), // no entity
        notif("town-999999", "battle"), // no such town
      ],
      towns,
    );
    expect(markers).toEqual([]);
  });

  it("lets the latest notification win per town", async () => {
    const towns = await fixtureTowns();
    const a = towns[0]!;
    const markers = buildEventMarkers(
      [notif(a.id, "battle"), notif(a.id, "siege")],
      towns,
    );
    expect(markers).toEqual([{ settlementId: a.settlementId, kind: "siege" }]);
  });

  it("caps the markers at the limit, most recent first", async () => {
    const towns = await fixtureTowns();
    const notes = towns.slice(0, EVENT_MARKER_LIMIT + 4).map((t, i) => notif(t.id, i % 2 ? "siege" : "battle"));
    const markers = buildEventMarkers(notes, towns);
    expect(markers).toHaveLength(EVENT_MARKER_LIMIT);
    // The oldest towns fell off; the newest survived.
    const marked = new Set(markers.map((m) => m.settlementId));
    expect(marked.has(towns[0]!.settlementId)).toBe(false);
    expect(marked.has(towns[towns.length - 1]!.settlementId) || marked.size === EVENT_MARKER_LIMIT).toBe(true);
  });
});
