/**
 * Task 99: map name and biome in the report header.
 *
 * "Victory — Dry Fork" says which battle; it does not say where the field was,
 * and the ground decides how a battle reads afterwards. A win in the hills is not
 * the same report as a win on the plains, and the player deciding whether to
 * press on deserves to know which they are looking at.
 *
 * The biome label is `modes/types.ts`'s own `BIOME_LABEL` — the same words the
 * battle setup screens use for the same ids — so the report cannot end up calling
 * `forest` "Woodlands" while the setup screen calls it "Forest".
 *
 * Both fields are optional and the line is assembled from whatever is present: a
 * battle the flow could not place on the map still gets a header, and a caller
 * whose map name is already the battle label can pass only the biome rather than
 * printing the same words twice.
 */

import { BIOME_LABEL, type BiomeId } from "../modes/types.js";
import "./reportContent.css";

export interface SiteContext {
  /** The place on the map the battle was fought at. */
  mapName?: string | undefined;
  /** Which of the six fields it was. */
  biome?: BiomeId | undefined;
}

/**
 * The place line for the header: "Dry Fork — Plains". Empty when the flow told
 * us nothing about the site, in which case the header shows no line at all
 * rather than a placeholder.
 */
export function siteLine(site: SiteContext): string {
  const parts = [site.mapName, site.biome ? BIOME_LABEL[site.biome] : null].filter(
    (part): part is string => part !== null && part !== undefined && part.length > 0,
  );
  return parts.join(" — ");
}