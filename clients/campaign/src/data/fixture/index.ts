/**
 * The fixture barrel. Aliased to `forbiddenInProduction.ts` in any non-dev build by
 * `vite.config.ts`, and asserted absent from `dist/` by `tools/check-no-fixtures.mjs`.
 */
export { createFixtureSimulationProvider, FIXTURE_MARKER, FIXTURE_WARNING } from "./fixtureProvider.js";
