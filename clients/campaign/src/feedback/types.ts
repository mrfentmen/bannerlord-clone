/**
 * Battle feedback (MASTER_PLAN 2C, tasks 49-57): kill feed, battle log,
 * floating damage numbers, damage-direction arc, threat edge flash,
 * objective markers, offscreen unit arrows, low-health vignette,
 * hit-stop + screen shake.
 *
 * Every component here is presentation only. The battle simulation (milo's
 * lane) decides what happened; it reports through {@link FeedbackSource} and
 * these components render. Nothing here reads sim internals, touches the
 * render loop, or issues orders. The scene adapter that wires a real sim to
 * FeedbackSource lives outside this module.
 */

export type Side = "ally" | "enemy";

/** A notable kill. The source decides what counts as a "hero". */
export interface HeroKill {
  killerName: string;
  killerSide: Side;
  victimName: string;
  victimSide: Side;
  at: number;
}

/** One damage application at a field position. */
export interface DamageTick {
  unitId: string;
  amount: number;
  x: number;
  z: number;
  /** Field position of the attacker, when known. */
  fromX?: number;
  fromZ?: number;
  crit?: boolean;
  heavy?: boolean;
  at: number;
}

/** A hit that flanked or came from behind its victim. */
export interface ThreatHit {
  unitId: string;
  fromX: number;
  fromZ: number;
  /** True when the blow landed from the rear arc. */
  rear: boolean;
  at: number;
}

/** Timestamped battle moments for the log panel. */
export interface BattleMoment {
  kind: "charge" | "rout" | "heroDown" | "objective" | "order";
  text: string;
  at: number;
}

export interface ObjectiveMarker {
  id: string;
  label: string;
  x: number;
  z: number;
  kind: "capture" | "vip" | "extract";
}

export interface TrackedUnit {
  id: string;
  side: Side;
  x: number;
  z: number;
  alive: boolean;
  /**
   * Current/maximum health. Both are optional: a source that does not track
   * health simply draws no bar for that unit rather than inventing one
   * (task 36).
   */
  hp?: number;
  maxHp?: number;
}

export type Unsubscribe = () => void;

/**
 * The narrow interface the sim (or a test fake) implements. All callbacks are
 * fire-and-forget; components never call back into the source.
 */
export interface FeedbackSource {
  onHeroKill(fn: (k: HeroKill) => void): Unsubscribe;
  onDamage(fn: (d: DamageTick) => void): Unsubscribe;
  onThreat(fn: (t: ThreatHit) => void): Unsubscribe;
  onMoment(fn: (m: BattleMoment) => void): Unsubscribe;
  /** Player/hero health in [0, max]. */
  onPlayerHealth(fn: (hp: number, max: number) => void): Unsubscribe;
  objectives(): ObjectiveMarker[];
  onObjectivesChanged(fn: () => void): Unsubscribe;
  units(): TrackedUnit[];
  onUnitsChanged(fn: () => void): Unsubscribe;
}

/** Screen projection supplied by the battle scene (Hana's lane). */
export interface FeedbackProjection {
  fieldToScreen(x: number, z: number): { x: number; y: number };
  viewport(): { w: number; h: number };
}
