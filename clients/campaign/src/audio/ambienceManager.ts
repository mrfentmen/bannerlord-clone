/**
 * Ambience per location: one bed at a time under everything else.
 *
 * Maps the player's location context to the 29 ambience beds in
 * `public/audio/sfx/ambience/`. The AudioManager crossfades between beds;
 * a location with no mapping keeps the current bed (never silence by
 * accident).
 */

import { getAudioManager } from "./AudioManager.js";

/** Where the player is, for ambience purposes. */
export type AmbienceLocation =
  | "town-day"
  | "town-night"
  | "tavern"
  | "market"
  | "throne-room"
  | "library"
  | "dungeon"
  | "cave"
  | "forest"
  | "meadow"
  | "swamp"
  | "swamp-night"
  | "jungle"
  | "desert"
  | "desert-night"
  | "arctic"
  | "blizzard"
  | "ocean"
  | "waterfall"
  | "campfire"
  | "rain"
  | "thunderstorm"
  | "hail"
  | "dust-storm"
  | "wind"
  | "highway"
  | "rail-yard"
  | "volcanic"
  | "distant-battle";

const BED_FOR: Record<AmbienceLocation, string> = {
  "town-day": "sfx-ambience-town-day",
  "town-night": "sfx-ambience-town-night",
  "tavern": "sfx-ambience-tavern-interior",
  "market": "sfx-ambience-market-crowd",
  "throne-room": "sfx-ambience-throne-room",
  "library": "sfx-ambience-library",
  "dungeon": "sfx-ambience-dungeon",
  "cave": "sfx-ambience-cave",
  "forest": "sfx-ambience-forest",
  "meadow": "sfx-ambience-meadow-day",
  "swamp": "sfx-ambience-swamp",
  "swamp-night": "sfx-ambience-swamp-night",
  "jungle": "sfx-ambience-jungle",
  "desert": "sfx-ambience-desert-wind",
  "desert-night": "sfx-ambience-desert-night",
  "arctic": "sfx-ambience-arctic",
  "blizzard": "sfx-ambience-blizzard",
  "ocean": "sfx-ambience-ocean",
  "waterfall": "sfx-ambience-waterfall",
  "campfire": "sfx-ambience-campfire",
  "rain": "sfx-ambience-rain",
  "thunderstorm": "sfx-ambience-thunderstorm",
  "hail": "sfx-ambience-hail",
  "dust-storm": "sfx-ambience-dust-storm",
  "wind": "sfx-ambience-wind",
  "highway": "sfx-ambience-highway-bed",
  "rail-yard": "sfx-ambience-rail-yard",
  "volcanic": "sfx-ambience-volcanic",
  "distant-battle": "sfx-ambience-distant-battle",
};

export class AmbienceManager {
  private current: AmbienceLocation | null = null;

  /** Move to a location's bed; unknown locations keep the current bed. */
  setLocation(location: AmbienceLocation): void {
    if (this.current === location) return;
    this.current = location;
    const bed = BED_FOR[location];
    if (!bed) return;
    void getAudioManager().playAmbient(bed).catch(() => {});
  }

  /** Silence the bed (main menu, app background). */
  stop(): void {
    this.current = null;
    getAudioManager().stopAmbient();
  }
}

let instance: AmbienceManager | null = null;
/** The shared ambience manager. */
export function getAmbienceManager(): AmbienceManager {
  if (!instance) instance = new AmbienceManager();
  return instance;
}
