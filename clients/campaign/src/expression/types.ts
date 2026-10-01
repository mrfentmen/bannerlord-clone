/**
 * Expression (MASTER_PLAN 3G, tasks 123-131): photo mode, war paint and
 * cosmetics, banner oaths, the chronicle, music player, victory poses,
 * nicknames, portrait customization, and motto engraving.
 *
 * Visual and audio realization stays in Hana's lane — this module owns the
 * state, catalogs, and narrow interfaces (CaptureTarget, AudioTarget) her
 * pipelines implement.
 */

export interface PhotoModeState {
  active: boolean;
  uiHidden: boolean;
  /** Free-camera orbit angles. */
  yaw: number;
  pitch: number;
  distance: number;
}

export interface Cosmetic {
  id: string;
  name: string;
  slot: "war-paint" | "armor-trim" | "cloak";
  unlock: string; // deed description
}

export interface VictoryPose {
  id: string;
  name: string;
  unlock: string;
}

export interface NicknameRule {
  deed: string;
  title: string;
}

export interface PortraitOptions {
  skin: "light" | "tan" | "dark";
  hair: "black" | "brown" | "red" | "blond" | "gray" | "bald";
  beard: "none" | "short" | "full";
  scar: boolean;
}

export interface MusicTrack {
  id: string;
  title: string;
  mood: "war" | "court" | "travel" | "somber";
  duration: string;
}
