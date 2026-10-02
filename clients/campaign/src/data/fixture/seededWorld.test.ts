/**
 * The world this double hands over before a single tick: the trade rumours it generates,
 * and the history its quest log carries.
 *
 * Both are properties of the seed rather than of anything the client does, and both are
 * properties of the *fixture's own fields agreeing with each other*. A double that handed
 * over a world whose rumour feed did not come out of its markets, or whose quest log
 * claimed a delivery the world's own readings contradicted, would let a panel bug hide
 * behind a seed bug: the panel would be tested against numbers no simulation could produce.
 */

import { describe, expect, it } from "vitest";
import { createFixtureSimulationProvider } from "./index.js";
import type { IssueBoard, SimSnapshot, TownState } from "../types.js";

/** The market price a town charges for a good, read off the snapshot the panels read. */
function priceAt(snapshot: SimSnapshot, townId: string, goodId: string): number {
  const good = snapshot.markets[townId]?.goods.find((line) => line.goodId === goodId);
  expect(good, `no ${goodId} market in ${townId}`).toBeDefined();
  return good!.price;
}

function townNamed(snapshot: SimSnapshot, name: string): TownState {
  const town = snapshot.towns.find((t) => t.name === name);
  expect(town, `the fixture has no town called ${name}`).toBeDefined();
  return town!;
}

describe("the rumour feed is the fixture's own prices", () => {
  it("picks the cheapest town against the dearest, for each good it scans", async () => {
    const provider = createFixtureSimulationProvider();
    const snapshot = await provider.getSnapshot();
    const feed = await provider.rumours();
    // The fixture's markets are not all far enough apart to be worth publishing, so the
    // feed is a short one. It is never empty, and it is never invented: every figure in it
    // is a price the snapshot itself carries.
    expect(feed.length).toBeGreaterThan(0);
    for (const rumour of feed) {
      const goodId = rumour.good === "food" ? "grain" : rumour.good;
      const buyTown = townNamed(snapshot, rumour.buyTown);
      const sellTown = townNamed(snapshot, rumour.sellTown);
      // The two prices are the two markets' own prices, to the cent.
      expect(rumour.buyPrice).toBe(priceAt(snapshot, buyTown.id, goodId));
      expect(rumour.sellPrice).toBe(priceAt(snapshot, sellTown.id, goodId));
      // And they really are the extremes: a rumour that is not about the cheapest town
      // being cheapest is not the simulation's rumour.
      const prices = snapshot.towns.map((t) => priceAt(snapshot, t.id, goodId));
      expect(rumour.buyPrice).toBe(Math.min(...prices));
      expect(rumour.sellPrice).toBe(Math.max(...prices));
    }
  });

  it("publishes only what clears the threshold, best margin first, with the margin as its own difference", async () => {
    const provider = createFixtureSimulationProvider();
    const feed = await provider.rumours();
    for (const rumour of feed) {
      // The threshold is the server's, 5 a unit, and the double uses the same one so a
      // dev build and a real one publish the same feed.
      expect(rumour.margin).toBeGreaterThanOrEqual(5);
      expect(rumour.margin).toBeCloseTo(rumour.sellPrice - rumour.buyPrice, 5);
      expect(rumour.margin).toBeLessThanOrEqual(rumour.sellPrice);
    }
    // The order is the generator's: best margin first, ties by good name.
    const margins = feed.map((r) => r.margin);
    expect([...margins].sort((a, b) => b - a)).toEqual(margins);
    expect(feed.length).toBeLessThanOrEqual(10);
  });

  it("writes the sentence in the simulation's own words, key and rounding included", async () => {
    const provider = createFixtureSimulationProvider();
    const feed = await provider.rumours();
    for (const rumour of feed) {
      // `food` is the simulation's key for the good the rest of the client calls grain, and
      // its sentence says `food`. The double quotes it rather than translating it, because
      // the panel prints the sentence as written.
      expect(rumour.good).toMatch(/^(food|medicine|metal)$/);
      expect(rumour.text).toBe(
        `Buy ${rumour.good} cheap in ${rumour.buyTown} (${Math.round(rumour.buyPrice)}), ` +
          `sell dear in ${rumour.sellTown} (${Math.round(rumour.sellPrice)}). ` +
          `Margin ${Math.round(rumour.margin)} per unit.`,
      );
    }
  });

  it("carries the two towns as numbers, because the contract says they are numbers", async () => {
    const provider = createFixtureSimulationProvider();
    const snapshot = await provider.getSnapshot();
    const feed = await provider.rumours();
    const ids = snapshot.towns.map((t) => t.id);
    for (const rumour of feed) {
      expect(Number.isInteger(rumour.buyTownId)).toBe(true);
      expect(Number.isInteger(rumour.sellTownId)).toBe(true);
      // Which town each number names is the double's own business — the simulation numbers
      // its towns and this one names them — so the assertion is only that a panel reading
      // the field gets a number and not a string.
      expect(ids.length).toBeGreaterThan(rumour.sellTownId);
    }
  });

  it("reads the markets again rather than remembering a feed, because prices move", async () => {
    const provider = createFixtureSimulationProvider();
    const snapshot = await provider.getSnapshot();
    const before = await provider.rumours();
    const dearest = before[0];
    expect(dearest).toBeDefined();
    // Buy a load of the cheap end out of the market that was cheapest, which makes that
    // town dearer. The purse is about two thousand, so this is the size of load the
    // fixture's own prices allow.
    const town = townNamed(snapshot, dearest!.buyTown);
    const bought = await provider.trade({
      partyId: snapshot.party.id,
      townId: town.id,
      goodId: dearest!.good === "food" ? "grain" : dearest!.good,
      side: "buy",
      quantity: 8,
      expectedDay: snapshot.day,
    });
    expect(bought.accepted).toBe(true);
    expect(bought.marketPriceAfter).toBeGreaterThan(bought.unitPrice);

    // The second read does not name that town as the cheap end any more, which is the whole
    // point: a feed the double remembered would send the player to a market that has just
    // got more expensive.
    const after = await provider.rumours();
    const sameGood = after.find((r) => r.good === dearest!.good);
    expect(sameGood).toBeDefined();
    expect(sameGood!.buyTown).not.toBe(dearest!.buyTown);
    expect(priceAt(await provider.getSnapshot(), town.id, dearest!.good === "food" ? "grain" : dearest!.good)).toBeGreaterThan(
      dearest!.buyPrice,
    );
  });
});

describe("the seeded quest log and the seeded world agree with each other", () => {
  async function board(): Promise<{ board: IssueBoard; snapshot: SimSnapshot }> {
    const provider = createFixtureSimulationProvider();
    const snapshot = await provider.getSnapshot();
    return { board: await provider.issueBoard(snapshot.party.id), snapshot };
  }

  it("reports a served request as met, because the seed moved the world the log says it moved", async () => {
    const { board: seeded } = await board();
    const served = seeded.issues.find((issue) => issue.state === "succeeded");
    expect(served, "the fixture seeds no served request").toBeDefined();
    // This is the pair that used to contradict each other. `progress` is the state the
    // request settled in and `requirement.met` is a reading of the world recomputed on
    // every read, so a seed that left the larder where it was produced a full gauge beside
    // "the world does not meet the objective" — the double disagreeing with itself about a
    // delivery its own step log said had happened.
    expect(served!.progress).toBe(1);
    expect(served!.requirement.met).toBe(true);
    expect(served!.steps.at(-1)?.text).toBe("the goods arrived and the work was done");
  });

  it("leaves a failed request unmet, because nothing was delivered", async () => {
    const { board: seeded } = await board();
    const failed = seeded.issues.find((issue) => issue.state === "failed");
    expect(failed, "the fixture seeds no failed request").toBeDefined();
    expect(failed!.progress).toBe(0);
    expect(failed!.requirement.met).toBe(false);
    // And the reading behind it is the town's own: the road is as unsafe as it was.
    expect(failed!.requirement.text).toMatch(/It stands at \d+ now\./);
  });

  it("does not leave a served request's delivery hanging in the town's larder forever", async () => {
    const { board: seeded, snapshot } = await board();
    const served = seeded.issues.find((issue) => issue.state === "succeeded")!;
    const town = snapshot.towns.find((t) => t.name === served.settlementName)!;
    // The larder is at least what the objective asked for, read in the same unit the
    // requirement is written in: grain units, at 40 person-days each.
    const grainUnits = town.foodStock / 40;
    const target = served.requirement.baseline! + served.requirement.amount * 0.8;
    expect(grainUnits).toBeGreaterThanOrEqual(target);
  });
});
