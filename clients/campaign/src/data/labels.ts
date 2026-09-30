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

/**
 * Shown when the world survey files are not present at all.
 *
 * The file name and the command that fetches them are deliberately absent. This string
 * reaches the player's screen, and `ART_DIRECTION.md` section 10.3 bans both a file path
 * and a developer command in anything a player can see. The command belongs in the
 * developer detail that goes to the console, which is where the operator is looking.
 */
export const NO_WORLD_DATA_HINT =
  "The world survey did not load, so the map has no terrain, roads or towns to draw. " +
  "The rest of the client is fine; the survey files are missing from this build.";

/** The operator-facing half of `NO_WORLD_DATA_HINT`. Console only, never rendered. */
export const NO_WORLD_DATA_DETAIL =
  "No world survey files were found. Expected them under the public path; run the world fetch step before starting the client.";
