/**
 * Mission framework shared types.
 *
 * Ported from leonida's `missions/types.ts` (MIT; license caveat in
 * `../types.ts`). Deliberate differences: leonida's `Game` handle is
 * replaced with the minimal `MissionHost` below — missions never touch
 * Babylon, peds or vehicles directly. The adapter (Buffy's lane) maps
 * host calls onto the real engine.
 */
import type { V3 } from "../types.js";

export type ObjectiveStatus = "running" | "done" | "failed";

/**
 * One sequential step of a mission. Instances are created fresh per attempt
 * by `MissionDef.build`, so all per-attempt state lives on the object itself.
 */
export interface Objective {
  /** HUD line; re-read every frame so it may change while running. */
  text: string;
  /** GPS target; null shows no waypoint. */
  target(): V3 | null;
  start(ctx: MissionContext): void;
  update(ctx: MissionContext, dt: number): ObjectiveStatus;
  /** Debug fast-forward: force the objective into its done state. */
  skip(ctx: MissionContext): void;
  /** Always called once after `start`, whatever the outcome. */
  stop(ctx: MissionContext): void;
}

/** Everything an objective or mission script needs. */
export interface MissionContext {
  readonly host: MissionHost;
  readonly missionId: string;
  /** Cash paid on pass; missions adjust it while running. */
  reward: number;
  /** Set by `fail`; the runner reads it when an objective reports 'failed'. */
  failReason: string | null;
  fail(reason: string): void;
  /** Registered functions run once when the mission passes, fails or is aborted (LIFO). */
  onCleanup(fn: () => void): void;
  /** True while the debug `complete` action drives the mission. */
  fast: boolean;
}

export interface MissionDef {
  id: string;
  name: string;
  contact: string;
  /** Contact marker (world, ground level). */
  position: V3;
  unlockedAfter?: string;
  reward: number;
  repeatable: boolean;
  /** Builds the objective list for one attempt. */
  build(ctx: MissionContext): Objective[];
}

/**
 * The engine surface missions need. The Babylon adapter implements this;
 * missions stay pure.
 */
export interface MissionHost {
  playerPosition(): V3;
  /** Player speed m/s (for getaway / tail checks). */
  playerSpeed(): number;
  /** Is the player inside a vehicle right now? */
  playerInVehicle(): boolean;
  /** Wanted level (0 = clean). */
  wantedLevel(): number;
  setWanted(level: number): void;
  clearWanted(reason: string): void;
  addCash(amount: number): void;
  /** Subscribe to an engine event; returns an unsubscribe function. */
  on(event: string, cb: (data?: Record<string, unknown>) => void): () => void;
  notify(text: string, kind: "info" | "warning" | "success"): void;
  /** Machine seconds (for timed objectives). */
  now(): number;
  /** Add police heat (gang jobs are dirty work). */
  addHeat(amount: number): void;
  /** Add reputation with a faction/gang/business. */
  addRep(factionId: string, amount: number): void;
}
