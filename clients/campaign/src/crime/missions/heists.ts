/**
 * Heists and repeatable crime jobs.
 *
 * Structure ported from leonida's `missions/m8_theScore.ts` and
 * `missions/jobs.ts` (MIT; license caveat in `../types.ts`). The
 * authored beats are kept: approach → breach → timed loot grab →
 * `setWanted(5)` (**heat is set, not earned** — the getaway is a
 * guaranteed 5-star chase, not a coin flip) → timed escape with an
 * authored fail reason. `jobRobbery` is the smallest complete crime
 * loop: rob → escape → payout.
 *
 * Deliberate differences: positions come from `HeistLocations` (the
 * adapter supplies real world positions) instead of leonida's interior
 * system; cutscenes and companion objectives are adapter-side.
 */
import type { V3 } from "../types.js";
import { action, escapeWanted, goto, holdPosition, timed } from "./objectives.js";
import type { MissionDef } from "./types.js";

export interface HeistLocations {
  jewelryStore: V3;
  marina: V3;
  chopShop: V3;
  /** Any storefront that can be robbed (jobRobbery picks the nearest at runtime). */
  stores: V3[];
}

/** The Score: hit the jewelers, fill the bag, outrun a guaranteed 5-star chase to the marina. */
export function theScore(loc: HeistLocations): MissionDef {
  const LOOT_SECONDS = 20;
  const LOOT_RADIUS = 6;
  const GETAWAY_SECONDS = 5 * 60;
  const HEAT_LEVEL = 5;
  return {
    id: "heist-the-score",
    name: "The Score",
    contact: "Dominic",
    position: loc.jewelryStore,
    reward: 45000,
    repeatable: false,
    build() {
      const counter = { x: loc.jewelryStore.x, y: loc.jewelryStore.y, z: loc.jewelryStore.z };
      return [
        goto(loc.jewelryStore, 6, "Get to the jewelers"),
        holdPosition(
          () => counter,
          LOOT_RADIUS,
          LOOT_SECONDS,
          "Fill the bag at the counter",
        ),
        action((ctx) => {
          ctx.host.setWanted(HEAT_LEVEL);
          ctx.host.notify('Dominic: "Boat leaves the marina in five minutes. Move."', "warning");
        }),
        timed(
          goto(loc.marina, 8, "Get to the marina before the boat leaves"),
          GETAWAY_SECONDS,
          "the boat left without you",
        ),
        action((ctx) => {
          ctx.host.clearWanted("mission");
          ctx.host.notify("Clean getaway. The crew eats tonight.", "success");
        }),
      ];
    },
  };
}

/** Repeatable: rob a store and get away clean. */
export function jobRobbery(loc: HeistLocations): MissionDef {
  return {
    id: "job-robbery",
    name: "Store Robbery",
    contact: "Ray",
    position: loc.stores[0] ?? { x: 0, y: 0, z: 0 },
    reward: 2500,
    repeatable: true,
    build(ctx) {
      // Nearest store to the player when the job starts.
      const p = ctx.host.playerPosition();
      let best = loc.stores[0] ?? { x: 0, y: 0, z: 0 };
      let bestD = Infinity;
      for (const s of loc.stores) {
        const d = (s.x - p.x) ** 2 + (s.z - p.z) ** 2;
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
      const store = { ...best };
      return [
        goto(store, 5, "Get to the store"),
        holdPosition(() => store, 4, 12, "Empty the register — stay by the counter"),
        escapeWanted(240),
        action((c) => c.host.notify('Ray: "Clean. Come back tomorrow."', "info")),
      ];
    },
  };
}

/** Repeatable: steal a car and deliver it to the chop shop. */
export function jobChopShop(loc: HeistLocations): MissionDef {
  return {
    id: "job-chopshop",
    name: "Chop Shop Run",
    contact: "Manny",
    position: loc.chopShop,
    reward: 1800,
    repeatable: true,
    build() {
      let ride: "stolen" | null = null;
      return [
        goto(loc.chopShop, 6, "See Manny at the chop shop"),
        action((ctx) => {
          ctx.host.notify('Manny: "Bring me something fast. Anything fast."', "info");
        }),
        // The adapter flags the player's current vehicle as the stolen ride
        // via the `vehicle:stolen` event; here we just wait for wheels.
        {
          text: "Steal a car",
          target: () => null,
          start() {},
          update(ctx) {
            if (ctx.host.playerInVehicle()) {
              ride = "stolen";
              return "done";
            }
            return "running";
          },
          skip(ctx) {
            ride = "stolen";
            void ctx;
          },
          stop() {},
        },
        timed(
          goto(loc.chopShop, 6, "Deliver the car to the chop shop"),
          300,
          "Manny found another supplier",
        ),
        action((ctx) => {
          if (ride) ctx.reward = Math.max(1800, Math.round(ctx.reward * 1.5));
        }),
      ];
    },
  };
}

export const ALL_HEISTS = [theScore, jobRobbery, jobChopShop];
