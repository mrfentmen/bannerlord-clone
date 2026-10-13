/**
 * Crime system shared types — wanted levels, police AI, heists.
 *
 * Architecture ported from `bridge-mind/leonida` (MIT — LICENSE pulled at
 * `docs/code-pulls/crime-systems/LICENSE-leonida`; its README also says
 * "non-commercial fan project", so get maintainer clarification before any
 * commercial use). Deliberate differences: zero engine imports anywhere in
 * this module. The game engine (Babylon, ped/vehicle spawners, audio, HUD)
 * is injected through the `CrimeHost` interface in `director.ts`; everything
 * here is pure TypeScript and unit-testable.
 */

export interface V3 {
  x: number;
  y: number;
  z: number;
}

/** Wanted states. `none` = not wanted. */
export type WantedState = "none" | "responding" | "searching" | "active";

export function isWantedState(v: unknown): v is WantedState {
  return v === "none" || v === "responding" || v === "searching" || v === "active";
}

/**
 * Crime types the wanted machine understands. Modernized for the setting:
 * gangs, carjackings and store robberies instead of medieval banditry.
 */
export type CrimeType =
  | "assault"
  | "murder"
  | "carjacking"
  | "armed_robbery"
  | "burglary"
  | "grand_theft_auto"
  | "drug_deal"
  | "hit_and_run"
  | "resisting_arrest"
  | "cop_assaulted"
  | "cop_killed"
  | "store_robbery";

export const CRIME_TYPES: readonly CrimeType[] = [
  "assault",
  "murder",
  "carjacking",
  "armed_robbery",
  "burglary",
  "grand_theft_auto",
  "drug_deal",
  "hit_and_run",
  "resisting_arrest",
  "cop_assaulted",
  "cop_killed",
  "store_robbery",
];

export interface WitnessInfo {
  copSaw: boolean;
  civilianSaw: boolean;
}

export interface CrimeResult {
  counted: boolean;
  starsAdded: number;
}

/** Callbacks the wanted machine fires; the director maps them to audio/UI/state. */
export interface WantedHooks {
  changed(level: number, state: WantedState, previousLevel: number): void;
  cleared(reason: string): void;
  starsGained(count: number): void;
  searching(): void;
  hotSceneReraised(): void;
}

/** A hot scene: a crime location cops will re-raise heat at if re-entered. */
export interface HotScene {
  position: V3;
  radius: number;
  /** Machine time at which the scene expires. */
  expiresAt: number;
  /** Re-raising needs an outside→inside transition, so this starts true when created under the player. */
  playerInside: boolean;
}

/** Snapshot the HUD reads every frame. */
export interface WantedSnapshot {
  level: number;
  state: WantedState;
  heat: number;
  evasion: number;
  evasionSeconds: number;
  searchCenter: V3 | null;
  searchRadius: number;
  hotScenes: HotScene[];
  playerSeen: boolean;
}
