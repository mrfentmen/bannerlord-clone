/**
 * Stands in for the fixture module in any build that is not a dev build, so the
 * fixture code never reaches a production bundle at all (agents/README.md section 4,
 * "a fixture is never wired into a production path").
 *
 * `vite.config.ts` maps `./fixture/index.js` here when mode is not development.
 */
import type { SimulationProvider } from "../types.js";

function refuse(): never {
  throw new Error(
    "This module was replaced at build time and must never run. " +
      "vite.config.ts swaps the test double out of any non-development build; " +
      "tools/check-no-fixtures.mjs proves it did.",
  );
}

/** Deliberately different wording from the real fixture, so the build check can tell
 *  them apart after bundling has erased the file names. */
export const FIXTURE_MARKER = "replaced at build time";
export const FIXTURE_WARNING = "";
export function createFixtureSimulationProvider(): SimulationProvider {
  return refuse();
}
