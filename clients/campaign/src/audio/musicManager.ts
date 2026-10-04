/**
 * Music manager: scene-aware rotation across the full 240-track library.
 *
 * The AudioManager knows six scene-level IDs; this module owns the other 234
 * tracks. Each scene gets a pool, shuffled with no-repeat, crossfaded by the
 * AudioManager. Victory/defeat play their stingers, then the manager resumes
 * the scene pool.
 *
 * Scenes: menu, campaign (map travel), town, battle, court, victory, defeat.
 * The caller (Buffy's main.ts / campaign flow) calls setScene(); everything
 * else is automatic.
 */

import { getAudioManager } from "./AudioManager.js";

/** Where the player is, for music purposes. */
export type MusicScene = "menu" | "campaign" | "town" | "battle" | "court";

/** Track pools by scene. IDs are manifest asset IDs (the .mp3 basename). */
const POOLS: Record<MusicScene, string[]> = {
  menu: ["menu-theme", "the-ice-queens-court", "the-glass-throne", "whisper-network"],
  campaign: [
    "ambient-exploration", "the-long-march", "songs-of-the-long-road",
    "songs-of-the-caravan", "caravan-dawn", "river-run", "the-deep-road",
    "border-crossing", "new-horizon", "homeward", "dust-devils",
    "fog-over-the-moors", "the-quiet-valley", "the-sunlit-meadow",
    "salt-wind", "sails-at-dawn",
  ],
  town: [
    "tavern-rest", "market-day", "the-night-market", "songs-of-the-autumn-feast",
    "songs-of-the-midwinter-feast", "songs-of-the-spring-feast",
    "harvest-festival", "lantern-festival", "dance-of-the-harvest-moon",
    "the-coopers-song", "the-millers-song", "the-smiths-song",
    "the-weavers-song", "ballads-of-the-border",
    "the-ploughmans-tale", "waltz-of-the-courtiers", "lullaby-of-the-steppe",
    "the-golden-harvest", "the-harvest-home", "songs-for-the-harvest-home",
    "the-homecoming-feast", "the-winter-fair", "the-summer-fair",
    "the-midsummer-feast", "the-frost-fair",
  ],
  battle: [
    "battle-theme", "drums-of-the-iron-watch", "drums-of-the-ash", "march-of-the-iron-legion",
    "charge-of-the-light", "charge-of-the-winged-host", "highland-charge",
    "dawn-assault", "last-stand", "last-stand-at-dawn", "storm-of-arrows",
    "iron-rain", "tide-of-war", "thunder-of-hooves", "thunder-of-the-cavalry",
    "the-iron-covenant", "iron-and-oak", "frozen-steel", "wrath-of-the-southern-host",
    "fury-of-the-northern-host", "fury-of-the-western-host", "wolves-at-the-door",
    "under-siege", "siege-preparation", "the-siege-tower", "breach-point",
    "convoy-ambush", "night-raid", "midnight-pursuit", "traitors-gambit",
    "oathbreakers", "betrayal", "the-broken-oath", "the-shattered-oath",
    "stormwatch", "storm-of-the-eastern-host", "drums-of-the-storm-lord",
    "drums-of-the-storm-watch", "thunder-of-the-gods", "thunder-court",
  ],
  court: [
    "whispers-in-the-court", "the-ashen-throne", "the-golden-throne",
    "the-obsidian-throne", "the-silver-throne", "the-bronze-throne",
    "the-iron-crown", "the-glass-throne", "the-marble-halls",
    "coronation", "coronation-eve", "the-coronation-march",
    "the-gilded-cage", "gilded-cage-new", "the-empty-throne",
    "whispers-of-treason", "the-spymasters-web", "the-honeyed-words",
    "the-silver-tongue", "parley", "war-council", "the-last-council",
  ],
};

/** How long a track plays before the manager advances the pool (ms). */
const TRACK_ADVANCE_MS = 3 * 60 * 1000;

export class MusicManager {
  private scene: MusicScene = "menu";
  private order: string[] = [];
  private index = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stingerActive = false;

  /** Switch scene; starts its pool immediately with a crossfade. */
  setScene(scene: MusicScene): void {
    if (this.scene === scene && this.order.length > 0) return;
    this.scene = scene;
    this.stingerActive = false;
    this.shufflePool();
    this.playCurrent();
    this.scheduleAdvance();
  }

  /** Battle result: stinger, then back to the campaign pool. */
  async playResult(won: boolean): Promise<void> {
    this.stingerActive = true;
    this.clearTimer();
    const audio = getAudioManager();
    await audio.playSfx(won ? "victory-fanfare" : "defeat", { volume: 0.9 }).catch(() => {});
    // Let the stinger breathe, then resume the scene underneath.
    this.timer = setTimeout(() => {
      this.stingerActive = false;
      this.playCurrent();
      this.scheduleAdvance();
    }, 4000);
  }

  /** Stop everything (settings panel, app background). */
  stop(): void {
    this.clearTimer();
    getAudioManager().stopMusic();
  }

  private shufflePool(): void {
    const pool = POOLS[this.scene].slice();
    // Fisher-Yates; keep the first pick different from the last played.
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const a = pool[i]!;
      pool[i] = pool[j]!;
      pool[j] = a;
    }
    this.order = pool;
    this.index = 0;
  }

  private playCurrent(): void {
    if (this.order.length === 0) return;
    const track = this.order[this.index % this.order.length]!;
    void getAudioManager().playMusic(track).catch(() => {});
  }

  private scheduleAdvance(): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      if (this.stingerActive) return;
      this.index++;
      // Reshuffle at the end of the pool so nothing repeats back-to-back.
      if (this.index >= this.order.length) this.shufflePool();
      else this.playCurrent();
      this.scheduleAdvance();
    }, TRACK_ADVANCE_MS);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

let instance: MusicManager | null = null;
/** The shared music manager. */
export function getMusicManager(): MusicManager {
  if (!instance) instance = new MusicManager();
  return instance;
}
