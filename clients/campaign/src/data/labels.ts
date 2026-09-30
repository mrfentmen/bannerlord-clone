/**
 * Player-visible strings that are not attached to a panel.
 *
 * They live here rather than beside the code that renders them so that
 * `main.ts` never has to import from `data/fixture/`. If it did, the fixture would be
 * reachable from the application entry point and would end up in a production bundle
 * whatever the build config says, which is exactly what
 * `tools/check-no-fixtures.mjs` exists to prevent.
 */

/** Shown in a permanent banner whenever the world state is not the real simulation. */
export const TEST_SOURCE_WARNING = "Test fixture data — not the real simulation.";

/** The longer form, for the data-source panel. */
export const TEST_SOURCE_DETAIL =
  "Terrain, roads, settlements and populations are real public data. Town fields, prices, " +
  "unrest and the cause log are test fixtures, because the simulation has not landed.";

/** Shown when the world data files are not present at all. */
export const NO_WORLD_DATA_HINT =
  "The world survey files are not in public/world. Run `npm run fetch:world`.";
