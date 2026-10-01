/**
 * Input entry point.
 *
 * `input` is the app's one input registry: every gameplay action routes through
 * it. Panels, scenes, and the keybinding editor all talk to this singleton; tests
 * use `createInputRegistry()` for isolation.
 */

import { createInputRegistry } from "./registry.js";

export const input = createInputRegistry();

export * from "./actions.js";
export * from "./registry.js";
