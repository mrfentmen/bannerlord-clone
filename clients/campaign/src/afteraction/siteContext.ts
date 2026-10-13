/**
 * Task 99: map name and biome in the report header.
 * Task 100: weather and time of day, on the same line.
 *
 * "Victory — Dry Fork" says which battle; it does not say where the field was,
 * and the ground and the sky decide how a battle reads afterwards. A win in the
 * hills under rain at dusk is not the same report as one on the plains at noon,
 * and the player deciding whether to press on deserves to know which they are
 * looking at.
 *
 * The biome label is `modes/types.ts`'s own `BIOME_LABEL` — the same words the
 * battle setup screens use for the same ids — so the report cannot end up calling
 * `forest` "Woodlands" while the setup screen calls it "Forest". Weather is taken
 * as the sim's own object, so "Clear skies" is the word `weatherFor()` chose and
 * not a second label table kept in step by hand; its five kinds are
 * `battleflow/weather.ts`'s, which is why snow and heat show up here too.
 *
 * Time of day uses its own four-value union rather than importing the scene's:
 * `scene/BattleScene.ts` takes `"dawn" | "day" | "dusk" | "night"` inline and
 * another lane is editing the file beside it, so this declares the union it
 * accepts. Structural typing makes the two interchangeable at the call site, and
 * this module never imports from the scene.
 *
 * No glyphs here on purpose: the deployment overlay already carries weather and
 * time-of-day icons, and a second icon set for the same two values would be two
 * systems to keep in step. These are words in a sentence the player reads.
 */

import { BIOME_LABEL, type BiomeId } from "../modes/types.js";
import type { WeatherKind } from "../battleflow/weather.js";
import "./reportContent.css";

export type ReportTimeOfDay = "dawn" | "day" | "dusk" | "night";

export interface ReportWeather {
  /** The sim's weather for this battle. */
  kind: WeatherKind;
  /** Its label as the sim words it, e.g. "Clear skies". Printed unchanged. */
  label: string;
}

export interface SiteContext {
  /** The place on the map the battle was fought at. */
  mapName?: string | undefined;
  /** Which of the six fields it was. */
  biome?: BiomeId | undefined;
  /** The sky, as the sim described it. */
  weather?: ReportWeather | undefined;
  /** What light the battle was fought in. */
  timeOfDay?: ReportTimeOfDay | undefined;
}

const TIME_LABEL: Record<ReportTimeOfDay, string> = {
  dawn: "Dawn",
  day: "Daylight",
  dusk: "Dusk",
  night: "Night",
};

/** The words for a time of day, for callers holding only the union. */
export function timeOfDayLabel(time: ReportTimeOfDay): string {
  return TIME_LABEL[time];
}

/**
 * The place line for the header: "Dry Fork — Plains · Clear skies · Dusk". Empty
 * when the flow told us nothing about the site, in which case the header shows no
 * line at all rather than a placeholder.
 *
 * The place leads and the conditions follow, joined by middots: they are one
 * run of metadata, and an em-dash separator all the way through would read as a
 * single phrase.
 */
export function siteLine(site: SiteContext): string {
  const place = [site.mapName, site.biome ? BIOME_LABEL[site.biome] : null].filter(
    (part): part is string => part !== null && part !== undefined && part.length > 0,
  );
  const conditions = [site.weather?.label, site.timeOfDay ? TIME_LABEL[site.timeOfDay] : null].filter(
    (part): part is string => part !== null && part !== undefined && part.length > 0,
  );
  // The place is one phrase (an em-dash binds name to ground); the conditions are a
  // run of equal metadata, so they follow the place on middots.
  if (place.length === 0) return conditions.join(" · ");
  if (conditions.length === 0) return place.join(" — ");
  return `${place.join(" — ")} · ${conditions.join(" · ")}`;
}